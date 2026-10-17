import { EngineSnapshot, InboundMessage, OverlayMessage } from "./types";

export interface GameWsClientCallbacks {
  onSnapshot: (snapshot: EngineSnapshot) => void;
  onOverlay: (message: OverlayMessage) => void;
  onConnectionChange: (connected: boolean) => void;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10_000;

/**
 * Cliente do WebSocket local do jogo (servidor Node e a fonte unica de verdade).
 * Em caso de queda, reconecta com backoff e nunca inventa estado: a cena mostra
 * um aviso de "sem conexao" ate o snapshot real voltar.
 */
export class GameWsClient {
  private socket: WebSocket | null = null;
  private backoffMs = BASE_BACKOFF_MS;
  private closedByUser = false;

  constructor(private url: string, private callbacks: GameWsClientCallbacks) {}

  connect() {
    this.closedByUser = false;
    this.open();
  }

  disconnect() {
    this.closedByUser = true;
    this.socket?.close();
  }

  private open() {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.backoffMs = BASE_BACKOFF_MS;
      this.callbacks.onConnectionChange(true);
    });

    socket.addEventListener("message", (ev) => {
      try {
        const message = JSON.parse(ev.data) as InboundMessage;
        if (message.kind === "snapshot") this.callbacks.onSnapshot(message.data);
        if (message.kind === "overlay") this.callbacks.onOverlay(message.data);
      } catch {
        /* ignora mensagens malformadas */
      }
    });

    const scheduleReconnect = () => {
      this.callbacks.onConnectionChange(false);
      if (this.closedByUser) return;
      setTimeout(() => this.open(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    };

    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", () => socket.close());
  }
}
