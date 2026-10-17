import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { GameEngine } from "./gameEngine.js";
import { GameConfig } from "./config.js";
import { NormalizedEvent, Team } from "./events.js";
import { logger } from "./logger.js";
import { TiktokBridge, TiktokBridgeStatus } from "./tiktokBridge.js";

export interface AdminApiDeps {
  engine: GameEngine;
  emitEvent: (event: NormalizedEvent, overlayHint?: string) => void;
  persist: () => Promise<void>;
  getTiktokStatus: () => TiktokBridgeStatus;
  startTiktok: (username: string) => Promise<void>;
  stopTiktok: () => void;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin"
};

/** Conexao vinda do proprio PC (a API admin nao tem senha: nunca aceitar da rede). */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** So paginas servidas do proprio PC podem chamar a API (bloqueia sites quaisquer abertos no navegador). */
function isLocalOrigin(origin: string | undefined): boolean {
  return !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

function send(res: ServerResponse, status: number, body: unknown) {
  const origin = res.req?.headers.origin;
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    ...(origin && isLocalOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {})
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload muito grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function simulatedEvent(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    eventId: randomUUID(),
    type: "comment",
    userId: `sim-${randomUUID().slice(0, 8)}`,
    nickname: "simulador",
    team: null,
    giftId: null,
    repeatCount: 1,
    timestamp: Date.now(),
    ...partial
  };
}

export function createAdminHttpServer(deps: AdminApiDeps, port: number) {
  const server = createServer(async (req, res) => {
    if (!isLoopbackAddress(req.socket.remoteAddress) || !isLocalOrigin(req.headers.origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "acesso permitido apenas a partir deste computador" }));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS_HEADERS, "Access-Control-Allow-Origin": req.headers.origin ?? "*" });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/api/state") {
        send(res, 200, {
          snapshot: deps.engine.getSnapshot(),
          config: deps.engine.getConfig(),
          score: deps.engine.getScore(),
          roundsPlayed: deps.engine.getRoundsPlayed(),
          tiktokStatus: deps.getTiktokStatus(),
          unknownGifts: deps.engine.getUnknownGifts(),
          log: logger.getBuffer()
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/log") {
        send(res, 200, { log: logger.getBuffer() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/round/start") {
        deps.engine.resume();
        await deps.persist();
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/round/pause") {
        deps.engine.pause();
        await deps.persist();
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/round/reset") {
        const body = await readJsonBody<{ keepHistory?: boolean }>(req);
        deps.engine.resetAll(body.keepHistory !== false);
        await deps.persist();
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/config") {
        const partial = await readJsonBody<Partial<GameConfig>>(req);
        deps.engine.updateConfig(partial);
        await deps.persist();
        send(res, 200, { ok: true, config: deps.engine.getConfig() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/simulate/comment") {
        const body = await readJsonBody<{ text: string; nickname?: string; userId?: string }>(req);
        const event = simulatedEvent({
          type: "comment",
          text: body.text,
          nickname: body.nickname ?? "simulador",
          userId: body.userId ?? `sim-${body.text}-${Math.floor(Math.random() * 1000)}`
        });
        deps.emitEvent(event);
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/simulate/gift") {
        const body = await readJsonBody<{
          giftId: string;
          giftName?: string;
          team?: Team;
          userId?: string;
          nickname?: string;
          repeatCount?: number;
        }>(req);
        const event = simulatedEvent({
          type: "gift",
          giftId: body.giftId,
          giftName: body.giftName,
          team: body.team ?? null,
          nickname: body.nickname ?? "presenteador",
          userId: body.userId ?? `sim-gift-${Math.floor(Math.random() * 1000)}`,
          repeatCount: body.repeatCount ?? 1
        });
        deps.emitEvent(event);
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/simulate/load") {
        const body = await readJsonBody<{ count?: number }>(req);
        const count = Math.min(Math.max(body.count ?? 100, 1), 2000);
        const gifts = deps.engine.getConfig().gifts;
        for (let i = 0; i < count && gifts.length; i++) {
          const gift = gifts[i % gifts.length];
          deps.emitEvent(
            simulatedEvent({
              type: "gift",
              giftId: gift.giftId,
              giftName: gift.giftName,
              nickname: `carga${i}`,
              userId: `sim-load-${i}`
            })
          );
        }
        send(res, 200, { ok: true, generated: count });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/tiktok/connect") {
        const body = await readJsonBody<{ username: string }>(req);
        if (!body.username || !body.username.trim()) {
          send(res, 400, { ok: false, error: "username obrigatorio" });
          return;
        }
        await deps.startTiktok(body.username.trim());
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/tiktok/disconnect") {
        deps.stopTiktok();
        send(res, 200, { ok: true });
        return;
      }

      send(res, 404, { ok: false, error: "rota nao encontrada" });
    } catch (err) {
      logger.error(`Erro na API admin: ${String(err instanceof Error ? err.message : err)}`);
      send(res, 500, { ok: false, error: "erro interno" });
    }
  });

  server.listen(port, () => {
    logger.info(`API admin ouvindo em http://localhost:${port}`);
  });

  return server;
}
