import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { EngineSnapshot } from "./gameEngine.js";
import { OverlayMessage } from "./events.js";
import { logger } from "./logger.js";
import { isLoopbackAddress } from "./httpApi.js";

export type OutboundMessage =
  | { kind: "snapshot"; data: EngineSnapshot }
  | { kind: "overlay"; data: OverlayMessage };

export class GameWsServer {
  private wss: WebSocketServer;

  constructor(port: number) {
    this.wss = new WebSocketServer({
      port,
      // So a cena aberta neste computador recebe o estado do jogo.
      verifyClient: ({ req }: { req: IncomingMessage }) => isLoopbackAddress(req.socket.remoteAddress)
    });
    this.wss.on("connection", (socket) => {
      logger.info("Cliente do jogo conectado via WebSocket");
      socket.on("close", () => logger.info("Cliente do jogo desconectado"));
      socket.on("error", (err) => logger.warn(`Erro no socket do jogo: ${String(err)}`));
    });
    logger.info(`WebSocket do jogo ouvindo em ws://localhost:${port}`);
  }

  broadcast(message: OutboundMessage) {
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  close() {
    this.wss.close();
  }
}
