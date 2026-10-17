import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

const MAX_BUFFER = 300;
const buffer: LogEntry[] = [];
const dataDir = join(process.cwd(), "data");
const logFile = join(dataDir, "events.log");

let ready = false;
async function ensureReady() {
  if (!ready) {
    await mkdir(dataDir, { recursive: true });
    ready = true;
  }
}

/** Remove padroes obvios de segredo antes de logar (defesa extra, nao deve nunca receber senha real). */
function redact(message: string): string {
  return message
    .replace(/(password|senha|token|secret|sessionid)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

function log(level: LogEntry["level"], message: string) {
  const entry: LogEntry = { timestamp: Date.now(), level, message: redact(message) };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  const line = `[${new Date(entry.timestamp).toISOString()}] ${level.toUpperCase()} ${entry.message}\n`;
  ensureReady()
    .then(() => appendFile(logFile, line, "utf-8"))
    .catch(() => {
      /* falha ao escrever log em disco nao deve derrubar o jogo */
    });
  // eslint-disable-next-line no-console
  console.log(line.trim());
}

export const logger = {
  info: (message: string) => log("info", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
  getBuffer: (): LogEntry[] => [...buffer]
};
