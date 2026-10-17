/**
 * Helpers compartilhados pelos scripts de debug da ponte TikTok
 * (probeTiktok.ts = LIVE real, simulateTiktok.ts = sem LIVE).
 *
 * Campos conforme tiktok-live-connector v2 / tiktok-live-proto v3:
 *   gift: common.msgId, giftId (string), repeatCount, repeatEnd, groupId,
 *         user.{id, displayId, nickname}, gift.{id, name, type, diamondCount}
 *   chat: common.msgId, content, user.{...}
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function userOf(data: any) {
  const u = data.user ?? {};
  return {
    userId: String(u.id ?? u.userId ?? "?"),
    uniqueId: String(u.displayId ?? u.uniqueId ?? "?"),
    nickname: String(u.nickname ?? "?")
  };
}

export function describeGift(data: any, giftNames: Map<string, string> = new Map()) {
  const id = String(data.giftId);
  return {
    id,
    name: String(data.gift?.name || data.extendedGiftInfo?.name || giftNames.get(id) || "?"),
    // type 1 = presente "de combo" (envia varios eventos com repeatCount acumulado)
    type: Number(data.gift?.type ?? data.extendedGiftInfo?.type ?? NaN),
    diamonds: data.gift?.diamondCount ?? data.extendedGiftInfo?.diamond_count ?? "?",
    repeatCount: Number(data.repeatCount) || 0,
    repeatEnd: Number(data.repeatEnd) || 0,
    groupId: String(data.groupId || "-"),
    msgId: String(data.common?.msgId ?? "-")
  };
}

export function ts() {
  return new Date().toLocaleTimeString("pt-BR");
}

export function makeRawLogger(logPath: string) {
  mkdirSync(dirname(logPath), { recursive: true });
  return (kind: string, data: unknown) => {
    const line = JSON.stringify({ t: new Date().toISOString(), kind, data }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
    appendFileSync(logPath, line + "\n");
  };
}

export interface GiftStats {
  name: string;
  events: number;
  units: number;
}

/** Liga impressao de gift/chat numa TikTokLiveConnection (real ou alimentada pelo simulador). */
export function attachPrinters(
  connection: any,
  opts: { giftNames: Map<string, string>; showChat: boolean; showRaw: boolean; logRaw?: (k: string, d: unknown) => void }
) {
  const stats = new Map<string, GiftStats>();

  connection.on("gift", (data: any) => {
    opts.logRaw?.("gift", data);
    const g = describeGift(data, opts.giftNames);
    const u = userOf(data);
    console.log(
      `[${ts()}] GIFT id=${g.id} nome="${g.name}" tipo=${g.type} diamantes=${g.diamonds} ` +
        `repeatCount=${g.repeatCount} repeatEnd=${g.repeatEnd} groupId=${g.groupId} msgId=${g.msgId} ` +
        `user=@${u.uniqueId} (${u.nickname}, id ${u.userId})`
    );
    if (opts.showRaw) console.dir(data, { depth: 3 });

    const s = stats.get(g.id) ?? { name: g.name, events: 0, units: 0 };
    s.events += 1;
    // Unidades reais: combo (type 1) so conta no evento final; os demais contam sempre.
    if (g.type !== 1 || g.repeatEnd === 1) s.units += g.repeatCount || 1;
    stats.set(g.id, s);
  });

  connection.on("chat", (data: any) => {
    opts.logRaw?.("chat", data);
    if (!opts.showChat) return;
    const u = userOf(data);
    console.log(`[${ts()}] CHAT @${u.uniqueId} (id ${u.userId}) msgId=${data.common?.msgId ?? "-"}: ${data.content}`);
  });

  return {
    printSummary() {
      console.log("\n=== Resumo de presentes ===");
      if (stats.size === 0) console.log("  (nenhum presente recebido)");
      for (const [id, s] of stats) {
        console.log(`  id=${id} "${s.name}": ${s.events} eventos -> ${s.units} unidades reais`);
      }
    }
  };
}
