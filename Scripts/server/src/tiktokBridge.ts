import { randomUUID } from "node:crypto";
import { NormalizedEvent, Team } from "./events.js";
import { logger } from "./logger.js";
import { GiftStreakTracker } from "./giftStreak.js";

export type TiktokBridgeStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface TiktokBridgeOptions {
  username: string;
  onEvent: (event: NormalizedEvent) => void;
  onStatusChange: (status: TiktokBridgeStatus, detail?: string) => void;
}

const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;

/**
 * Ponte opcional e NAO OFICIAL para o TikTok LIVE usando a biblioteca
 * "tiktok-live-connector" (comunidade), que le eventos PUBLICOS de uma sala
 * ja ao vivo (comentarios, presentes, curtidas). Isso NAO E login automatizado
 * nem uso de credenciais: apenas escuta eventos publicos de uma live existente.
 *
 * RISCO DOCUMENTADO: biblioteca nao oficial, pode quebrar sem aviso se o
 * TikTok mudar o protocolo interno do webcast. Se a conexao real falhar ou a
 * dependencia nao estiver instalada, o sistema permanece em modo DEMO e
 * informa o bloqueio exato no log/painel, sem jamais inventar eventos.
 */
export class TiktokBridge {
  private status: TiktokBridgeStatus = "DISCONNECTED";
  private connection: any = null;
  private stopped = false;
  private backoffMs = BASE_BACKOFF_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private streaks = new GiftStreakTracker();

  constructor(private options: TiktokBridgeOptions) {}

  getStatus(): TiktokBridgeStatus {
    return this.status;
  }

  async connect(): Promise<void> {
    this.stopped = false;
    await this.attemptConnect();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.connection?.disconnect?.();
    } catch {
      /* ignore */
    }
    this.setStatus("DISCONNECTED");
  }

  private setStatus(status: TiktokBridgeStatus, detail?: string) {
    this.status = status;
    this.options.onStatusChange(status, detail);
  }

  private async attemptConnect() {
    this.setStatus("CONNECTING");
    let ConnectorClass: any;
    try {
      const mod: any = await import("tiktok-live-connector");
      ConnectorClass = mod.TikTokLiveConnection ?? mod.WebcastPushConnection ?? mod.default;
      if (!ConnectorClass) {
        throw new Error("Nenhuma classe de conexao reconhecida exportada pelo pacote tiktok-live-connector");
      }
    } catch (err) {
      const message =
        "Dependencia 'tiktok-live-connector' indisponivel ou incompativel. " +
        "Permanecendo em modo DEMO. Detalhe: " +
        String(err instanceof Error ? err.message : err);
      logger.error(message);
      this.setStatus("ERROR", message);
      return;
    }

    try {
      this.connection = new ConnectorClass(this.options.username, {
        // false: a lista de presentes da sala (gift/list) exige assinatura do plano Business do Euler Stream.
        // Nome e valor ja vem em cada mensagem de presente (gift.name / gift.diamondCount).
        enableExtendedGiftInfo: false,
        // Chave opcional do Euler Stream (assinatura da conexao), se o plano gratuito limitar.
        ...(process.env.TIKTOK_SIGN_API_KEY ? { signApiKey: process.env.TIKTOK_SIGN_API_KEY } : {})
      });
      this.wireEvents();
      await this.connection.connect();
      this.backoffMs = BASE_BACKOFF_MS;
      this.setStatus("CONNECTED");
      logger.info(`Conectado a LIVE real de @${this.options.username}`);
    } catch (err) {
      const message = `Falha ao conectar na LIVE de @${this.options.username}: ${String(
        err instanceof Error ? err.message : err
      )}`;
      logger.error(message);
      this.setStatus("ERROR", message);
      this.scheduleReconnect();
    }
  }

  private wireEvents() {
    const conn = this.connection;
    conn.on("disconnected", () => {
      logger.warn("Conexao com a LIVE caiu. Jogo permanece em modo seguro, sem inventar eventos.");
      this.setStatus("DISCONNECTED");
      this.scheduleReconnect();
    });

    conn.on("streamEnd", () => {
      logger.warn(`A LIVE de @${this.options.username} terminou.`);
      this.setStatus("DISCONNECTED", "LIVE encerrada");
    });

    // Formato tiktok-live-connector v2 (tiktok-live-proto v3): ver scripts/tiktokDebug.ts.
    conn.on("chat", (data: any) => {
      this.options.onEvent({
        ...baseEvent(data),
        type: "comment",
        giftId: null,
        repeatCount: 1,
        text: String(data.content ?? data.comment ?? "")
      });
    });

    conn.on("gift", (data: any) => {
      const base = baseEvent(data);
      const giftId = String(data.giftId ?? data.gift?.id ?? "desconhecido");
      const key = `${base.userId}:${giftId}:${String(data.groupId ?? "")}`;
      const units = this.streaks.increment(key, Number(data.repeatCount ?? 1), Number(data.repeatEnd ?? 0) === 1);
      if (units <= 0) return; // evento final do combo, ja contado nos parciais
      const diamonds = Number(data.gift?.diamondCount ?? data.extendedGiftInfo?.diamond_count);
      this.options.onEvent({
        ...base,
        type: "gift",
        giftId,
        giftName: String(data.gift?.name || data.extendedGiftInfo?.name || "") || undefined,
        diamondCount: Number.isFinite(diamonds) ? diamonds : undefined,
        repeatCount: units
      });
    });

    conn.on("like", (data: any) => {
      this.options.onEvent({
        ...baseEvent(data),
        eventId: randomUUID(),
        type: "like",
        giftId: null,
        repeatCount: Number(data.count ?? data.likeCount ?? 1)
      });
    });
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      void this.attemptConnect();
    }, this.backoffMs);
    logger.info(`Tentando reconectar em ${Math.round(this.backoffMs / 1000)}s`);
  }
}

function baseEvent(data: any) {
  const u = data.user ?? {};
  return {
    eventId: String(data.common?.msgId || data.msgId || randomUUID()),
    userId: String(u.id || u.userId || u.displayId || u.uniqueId || "desconhecido"),
    nickname: sanitizeNickname(String(u.nickname || u.displayId || u.uniqueId || "espectador")),
    team: null,
    timestamp: Date.now()
  };
}

function sanitizeNickname(raw: string): string {
  return raw.replace(/[<>&"'`]/g, "").slice(0, 48);
}

export function assignTeamFallback(): Team | null {
  return null;
}
