/**
 * Sonda de debug da ponte TikTok LIVE: conecta numa LIVE publica e imprime
 * os eventos CRUS (gift/chat) para conferir nomes de campos, giftIds reais
 * e o comportamento de combos (repeatCount/repeatEnd). Nao toca no jogo.
 *
 * Uso: npm run probe -- <usuario_da_live> [--chat] [--raw]
 *   --chat  tambem imprime comentarios
 *   --raw   imprime o objeto completo de cada gift no console (sempre vai pro log)
 * Log completo: server/data/tiktok-raw.log
 * Sem LIVE disponivel: npm run simulate
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attachPrinters, makeRawLogger, ts } from "./tiktokDebug.js";

const args = process.argv.slice(2);
const username = args.find((a) => !a.startsWith("--"))?.replace(/^@/, "");

if (!username) {
  console.error("Uso: npm run probe -- <usuario_da_live> [--chat] [--raw]");
  process.exit(1);
}

const logPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "tiktok-raw.log");
const logRaw = makeRawLogger(logPath);

const { TikTokLiveConnection } = await import("tiktok-live-connector");
const connection: any = new TikTokLiveConnection(username, {
  enableExtendedGiftInfo: false, // gift/list exige plano Business do Euler Stream
  signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined
});

const giftNames = new Map<string, string>();
const printers = attachPrinters(connection, {
  giftNames,
  showChat: args.includes("--chat"),
  showRaw: args.includes("--raw"),
  logRaw
});

connection.on("streamEnd", () => {
  console.log(`[${ts()}] A LIVE terminou.`);
  finish(0);
});
connection.on("disconnected", () => console.log(`[${ts()}] Desconectado.`));
connection.on("error", (err: any) =>
  console.error(`[${ts()}] ERRO: ${err?.info ?? ""} ${err?.exception?.message ?? err?.message ?? ""}`.trim())
);

function finish(code: number) {
  printers.printSummary();
  console.log(`Log completo: ${logPath}`);
  void Promise.resolve(connection.disconnect?.()).finally(() => process.exit(code));
}

process.on("SIGINT", () => finish(0));

console.log(`Conectando na LIVE de @${username}...`);
try {
  const state = await connection.connect();
  console.log(`Conectado. roomId=${state?.roomId ?? "?"}. Ctrl+C para sair.`);
  const gifts = connection.availableGifts;
  const list: any[] = Array.isArray(gifts) ? gifts : gifts?.gifts ?? [];
  for (const g of list) giftNames.set(String(g.id), g.name);
  const rose = list.filter((g) => /rose|rosa/i.test(g.name ?? ""));
  console.log(
    `Presentes disponiveis na sala: ${list.length}. Rosa: ${rose.map((g) => `${g.name}=${g.id}`).join(", ") || "nao encontrada"}`
  );
  logRaw("availableGifts", list.map((g) => ({ id: g.id, name: g.name, diamonds: g.diamond_count, type: g.type })));
} catch (err: any) {
  console.error(`Falha ao conectar: ${err?.message ?? err}`);
  process.exit(1);
}
