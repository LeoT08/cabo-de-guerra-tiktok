import { loadState, saveState, PersistedState } from "./persistence.js";
import { GameEngine } from "./gameEngine.js";
import { GameWsServer } from "./wsServer.js";
import { createAdminHttpServer } from "./httpApi.js";
import { TiktokBridge, TiktokBridgeStatus } from "./tiktokBridge.js";
import { NormalizedEvent } from "./events.js";
import { logger } from "./logger.js";

const WS_PORT = Number(process.env.GAME_WS_PORT ?? 8081);
const HTTP_PORT = Number(process.env.ADMIN_HTTP_PORT ?? 8080);
const TICK_MS = 50;
const BROADCAST_HZ = 20;
const PERSIST_INTERVAL_MS = 10_000;

async function main() {
  const persisted: PersistedState = await loadState();

  const ws = new GameWsServer(WS_PORT);

  const engine = new GameEngine(persisted.config, persisted.score, persisted.roundsPlayed, {
    onPersist: () => {
      void persistNow();
    }
  });

  let tiktokStatus: TiktokBridgeStatus = "DISCONNECTED";
  let tiktokBridge: TiktokBridge | null = null;

  function persistNow(): Promise<void> {
    return saveState({
      config: engine.getConfig(),
      score: engine.getScore(),
      roundsPlayed: engine.getRoundsPlayed()
    });
  }

  function emitEvent(event: NormalizedEvent) {
    const overlay = engine.processEvent(event);
    if (overlay) {
      ws.broadcast({ kind: "overlay", data: overlay });
    }
  }

  async function startTiktok(username: string) {
    tiktokBridge?.disconnect();
    engine.updateConfig({ mode: "REAL", tiktokUsername: username });
    await persistNow();
    tiktokBridge = new TiktokBridge({
      username,
      onEvent: emitEvent,
      onStatusChange: (status, detail) => {
        tiktokStatus = status;
        engine.setTiktokConnected(status === "CONNECTED");
        logger.info(`Status TikTok: ${status}${detail ? " - " + detail : ""}`);
      }
    });
    await tiktokBridge.connect();
  }

  function stopTiktok() {
    tiktokBridge?.disconnect();
    tiktokBridge = null;
    tiktokStatus = "DISCONNECTED";
    engine.setTiktokConnected(false);
    engine.updateConfig({ mode: "DEMO" });
    void persistNow();
  }

  createAdminHttpServer(
    {
      engine,
      emitEvent,
      persist: persistNow,
      getTiktokStatus: () => tiktokStatus,
      startTiktok,
      stopTiktok
    },
    HTTP_PORT
  );

  let lastTick = Date.now();
  let ticksSinceBroadcast = 0;
  const broadcastEveryNTicks = Math.max(1, Math.round(1000 / TICK_MS / BROADCAST_HZ));

  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    const overlay = engine.tick(dt);
    if (overlay) {
      ws.broadcast({ kind: "overlay", data: overlay });
    }

    ticksSinceBroadcast += 1;
    if (ticksSinceBroadcast >= broadcastEveryNTicks) {
      ticksSinceBroadcast = 0;
      ws.broadcast({ kind: "snapshot", data: engine.getSnapshot() });
    }
  }, TICK_MS);

  setInterval(() => {
    void persistNow();
  }, PERSIST_INTERVAL_MS);

  const savedConfig = engine.getConfig();
  if (savedConfig.mode === "REAL" && savedConfig.tiktokUsername) {
    // Estava conectado quando o servidor parou: reconecta sozinho na mesma LIVE.
    logger.info(`Servidor iniciado. Reconectando automaticamente na LIVE de @${savedConfig.tiktokUsername}...`);
    void startTiktok(savedConfig.tiktokUsername);
  } else {
    logger.info("Servidor Cabo de Guerra iniciado em modo DEMO. Use o painel admin para iniciar o round.");
  }

  process.on("SIGINT", async () => {
    logger.info("Encerrando servidor...");
    tiktokBridge?.disconnect();
    await persistNow();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(`Falha fatal ao iniciar servidor: ${String(err instanceof Error ? err.stack ?? err.message : err)}`);
  process.exit(1);
});
