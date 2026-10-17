/**
 * Simulador de LIVE do TikTok (sem precisar de LIVE no ar).
 *
 * Monta mensagens protobuf REAIS (tiktok-live-proto v3, o mesmo formato que
 * chega no WebSocket do TikTok), serializa em binario, decodifica de volta e
 * injeta em uma TikTokLiveConnection de verdade via processDecodedData() — o
 * mesmo ponto por onde passa cada mensagem de uma LIVE real. A partir dai tudo
 * e o codigo de producao: TiktokBridge -> NormalizedEvent -> GameEngine.
 *
 * O que NAO e testado aqui: rede/assinatura (Euler Stream) e os giftIds reais
 * (o 9999 "Coqueiro" e ficticio). Para isso: npm run probe -- <usuario>.
 *
 * Uso: npm run simulate [-- --raw]
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachPrinters, describeGift } from "./tiktokDebug.js";

// O logger do servidor grava em <cwd>/data/events.log; isola num diretorio temporario.
process.chdir(mkdtempSync(join(tmpdir(), "cabo-sim-")));

const proto: any = await import("tiktok-live-proto/v3");
const { TikTokLiveConnection } = await import("tiktok-live-connector");
const { TiktokBridge } = await import("../src/tiktokBridge.js");
const { GameEngine } = await import("../src/gameEngine.js");
const { DEFAULT_CONFIG } = await import("../src/config.js");

const ROSE = { id: "5655", name: "Rose", type: 1, diamondCount: 1 };
const COQUEIRO = { id: "9999", name: "Coqueiro (ficticio)", type: 2, diamondCount: 5 };
const IMPULSE = 50;

// ---------- montagem de mensagens protobuf ----------
const blank = (T: any) => T.decode(new Uint8Array());
const roundtrip = (T: any, msg: any) => T.decode(T.encode(msg).finish());

let msgSeq = 1000;
function common(msgId?: string) {
  return { ...blank(proto.CommonMessageData), msgId: msgId ?? String(++msgSeq), createTime: String(Date.now()) };
}
function user(id: string, displayId: string, nickname: string) {
  return { ...blank(proto.User), id, displayId, nickname };
}
function giftMsg(
  u: ReturnType<typeof user>,
  g: typeof ROSE,
  repeatCount: number,
  repeatEnd: 0 | 1,
  groupId: string,
  msgId?: string
) {
  return roundtrip(proto.WebcastGiftMessage, {
    ...blank(proto.WebcastGiftMessage),
    common: common(msgId),
    giftId: g.id,
    repeatCount,
    repeatEnd,
    groupId,
    user: u,
    gift: { ...blank(proto.Gift), id: g.id, name: g.name, type: g.type, diamondCount: g.diamondCount }
  });
}
function chatMsg(u: ReturnType<typeof user>, content: string) {
  return roundtrip(proto.WebcastChatMessage, { ...blank(proto.WebcastChatMessage), common: common(), user: u, content });
}

// ---------- conexao real da lib, sem rede ----------
const connection: any = new TikTokLiveConnection("simulacao", { enableExtendedGiftInfo: false });
// Formato da API de presentes da sala (ids numericos), como em fetchAvailableGifts().
connection._availableGifts = [
  { id: 5655, name: "Rose", type: 1, diamond_count: 1 },
  { id: 9999, name: "Coqueiro (ficticio)", type: 2, diamond_count: 5 }
];
const showRaw = process.argv.includes("--raw");
const printers = attachPrinters(connection, { giftNames: new Map(), showChat: true, showRaw });

// ---------- pipeline de producao: ponte atual + engine ----------
const config = structuredClone(DEFAULT_CONFIG);
// Rosa: mapeamento padrao (id 5655 / "Rose"). Coqueiro: mapeado so pelo NOME, como o painel permite.
config.gifts = [
  { ...config.gifts[0], impulse: IMPULSE },
  { ...config.gifts[0], giftId: "", giftName: COQUEIRO.name, label: "Coqueiro", team: "VERMELHO", impulse: IMPULSE }
];
const engine: any = new GameEngine(config, { AZUL: 0, VERMELHO: 0, draws: 0 }, 0, { onPersist: () => {} });
engine.startRound();

const applied = { AZUL: 0, VERMELHO: 0 };
const originalApply = engine.applySignedImpulse.bind(engine);
engine.applySignedImpulse = (signed: number) => {
  if (signed < 0) applied.AZUL += -signed;
  else applied.VERMELHO += signed;
  originalApply(signed);
};

const bridge: any = new TiktokBridge({
  username: "simulacao",
  onStatusChange: () => {},
  onEvent: (ev: any) => {
    const before = { ...applied };
    const overlay = engine.processEvent(ev);
    const dA = applied.AZUL - before.AZUL;
    const dV = applied.VERMELHO - before.VERMELHO;
    console.log(
      `    ponte -> {type:${ev.type}, userId:"${ev.userId}", nickname:"${ev.nickname}", eventId:"${ev.eventId.slice(0, 12)}", ` +
        `giftId:${ev.giftId}, repeatCount:${ev.repeatCount}${ev.type === "comment" ? `, text:"${ev.text}"` : ""}}`
    );
    console.log(
      `    engine -> impulso AZUL +${dA}  VERMELHO +${dV}` + (overlay ? `  | overlay: "${overlay.text}"` : "  | (sem efeito)")
    );
  }
});
bridge.connection = connection;
bridge.wireEvents();

// ---------- roteiro ----------
const ana = user("7001", "ana_azul", "Ana");
const beto = user("7002", "beto_verm", "Beto");
const carla = user("7003", "carla", "Carla");

async function send(type: string, data: any) {
  await connection.processDecodedData({ type, data });
}
function step(title: string) {
  console.log(`\n--- ${title}`);
}

step("1) Ana comenta \"22\" (comentarios desligados: nao move a corda)");
await send("WebcastChatMessage", chatMsg(ana, "22"));

step("2) Ana manda 1 Rosa (combo de 1: evento parcial + evento final repeatEnd=1)");
await send("WebcastGiftMessage", giftMsg(ana, ROSE, 1, 0, "501"));
await send("WebcastGiftMessage", giftMsg(ana, ROSE, 1, 1, "501"));

step("3) Carla (sem comentar) manda combo de 5 Rosas: repeatCount 1..5 e evento final");
for (let i = 1; i <= 5; i++) await send("WebcastGiftMessage", giftMsg(carla, ROSE, i, 0, "502"));
await send("WebcastGiftMessage", giftMsg(carla, ROSE, 5, 1, "502"));

step("4) Beto (sem comentar) manda 1 Coqueiro (presente sem combo, type 2)");
await send("WebcastGiftMessage", giftMsg(beto, COQUEIRO, 1, 1, "0", "777123"));

step("5) TikTok reenvia a MESMA mensagem do passo 4 (mesmo msgId) — deve ser ignorada");
await send("WebcastGiftMessage", giftMsg(beto, COQUEIRO, 1, 1, "0", "777123"));

// ---------- veredito ----------
printers.printSummary();
const expected = { AZUL: 6 * IMPULSE, VERMELHO: 1 * IMPULSE };
console.log("\n=== Veredito (regra desejada: Rosa -> AZUL, Coqueiro -> VERMELHO, sem precisar comentar) ===");
console.log(`  AZUL     esperado +${expected.AZUL} (6 rosas)   | obtido +${applied.AZUL}`);
console.log(`  VERMELHO esperado +${expected.VERMELHO} (1 coqueiro) | obtido +${applied.VERMELHO}`);
const extInfo = describeGift(giftMsg(ana, ROSE, 1, 1, "503")).name;
console.log(`  (nome do presente lido de data.gift.name: "${extInfo}")`);
const ok = applied.AZUL === expected.AZUL && applied.VERMELHO === expected.VERMELHO;
console.log(ok ? "\nRESULTADO: OK" : "\nRESULTADO: DIVERGENTE — ponte/engine precisam de correcao");
process.exit(ok ? 0 : 2);
