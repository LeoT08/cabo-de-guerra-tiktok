import { ApiStateResponse, GameConfig, GiftEffectConfig, Team, UnknownGift } from "./adminTypes";
import { GIFT_ICONS, giftIconUrl, resolveGiftIcon } from "../giftIcons";

const API_BASE = new URLSearchParams(window.location.search).get("api") ?? "http://localhost:8080";

const statusBar = document.getElementById("status-bar")!;
const content = document.getElementById("admin-content")!;

let lastConfig: GameConfig | null = null;
let controlsRendered = false;
/** Config (sem presentes) que o formulario esta mostrando; se o servidor mudar, o formulario e redesenhado. */
let renderedConfigKey = "";

function configKey(c: GameConfig) {
  const { gifts: _gifts, ...rest } = c;
  return JSON.stringify(rest);
}

/** Usuario esta digitando em algum campo do painel (nao redesenhar por cima). */
function isEditing() {
  const el = document.activeElement;
  return !!el && el !== document.body && content.contains(el) && el.matches("input, select, textarea");
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!res.ok) throw new Error(`Falha em ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function badge(text: string, kind: "on" | "off" | "warn") {
  return `<span class="badge ${kind}">${text}</span>`;
}

function renderStatus(state: ApiStateResponse) {
  const s = state.snapshot;
  statusBar.innerHTML = `
    ${badge(`Servidor: online`, "on")}
    ${badge(`Modo ${s.mode}`, s.mode === "REAL" ? (s.tiktokConnected ? "on" : "warn") : "warn")}
    ${badge(`TikTok: ${state.tiktokStatus}`, state.tiktokStatus === "CONNECTED" ? "on" : state.tiktokStatus === "ERROR" ? "off" : "warn")}
    ${badge(`Fase: ${s.phase}`, s.phase === "ROUND" ? "on" : "warn")}
    <span>Round ${s.roundNumber} · ${Math.floor(s.timeRemainingSeconds / 60)}:${String(s.timeRemainingSeconds % 60).padStart(2, "0")}</span>
    <span>Placar AZUL ${s.score.AZUL} x ${s.score.VERMELHO} VERMELHO (empates ${s.score.draws})</span>
  `;
}

function field(id: string, label: string, value: number | string, type = "number") {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${value}" /></div>`;
}

function renderControls(state: ApiStateResponse) {
  const c = state.config;
  lastConfig = c;
  renderedConfigKey = configKey(c);

  content.innerHTML = `
    <div class="card">
      <h2>Controle do round</h2>
      <div class="row">
        <button class="primary" id="btn-start">Start / Resume</button>
        <button id="btn-pause">Pause</button>
        <button class="danger" id="btn-reset-keep">Reset round (manter placar)</button>
        <button class="danger" id="btn-reset-all">Zerar histórico</button>
        <button id="btn-reload">Recarregar painel</button>
      </div>
    </div>

    <div class="card">
      <h2>Simulação (modo DEMO / testes)</h2>
      <div class="row">
        <span id="sim-gifts" class="row"></span>
        <button class="vermelho" id="sim-13">Comentário 13</button>
        <button class="azul" id="sim-22">Comentário 22</button>
        <button id="sim-load">Carga: 100 presentes</button>
      </div>
      <p style="color:#8d99ab;font-size:13px">Comentários só movem a corda se "Comentários 13/22 movem a corda" estiver marcado na configuração.</p>
    </div>

    <div class="card">
      <h2>Presentes → time</h2>
      <p style="color:#8d99ab;font-size:13px">O presente define o time. Casa pelo ID ou pelo nome. Impulso é por unidade (combo x10 = 10×). 1 Rosa (impulso 5) anda ~3 de 100. Alterações salvam na hora.</p>
      <div id="gift-map"></div>
      <h3 style="margin-top:14px">Recebidos e NÃO mapeados</h3>
      <div id="unknown-gifts"></div>
      <div class="row" style="margin-top:10px">
        ${field("new-gift-id", "ID do presente", "", "text")}
        ${field("new-gift-name", "Nome (como o TikTok envia, ex.: Rose)", "", "text")}
        <button class="azul" id="new-gift-azul">Adicionar → AZUL</button>
        <button class="vermelho" id="new-gift-vermelho">Adicionar → VERMELHO</button>
      </div>
    </div>

    <div class="card">
      <h2>TikTok LIVE (opcional)</h2>
      <div class="row">
        <div class="field">
          <label for="tiktok-username">@usuario da LIVE</label>
          <input id="tiktok-username" type="text" value="${c.tiktokUsername}" placeholder="usuario (sem @)" />
        </div>
        <button id="btn-tiktok-connect">Conectar</button>
        <button id="btn-tiktok-disconnect">Desconectar / voltar a DEMO</button>
      </div>
      <p style="color:#8d99ab;font-size:13px">Não solicita senha. Apenas escuta eventos públicos de uma LIVE já no ar. Risco: biblioteca não oficial, pode falhar se o TikTok mudar o protocolo.</p>
    </div>

    <div class="card">
      <h2>Configuração</h2>
      <div class="row">
        ${field("cfg-roundDurationSeconds", "Duração do round (s)", c.roundDurationSeconds)}
        ${field("cfg-intervalSeconds", "Intervalo entre rounds (s)", c.intervalSeconds)}
        ${field("cfg-victoryScreenSeconds", "Tela de vitória (s)", c.victoryScreenSeconds)}
        ${field("cfg-drawToleranceAbs", "Tolerância de empate", c.drawToleranceAbs)}
        ${field("cfg-commentImpulse", "Impulso por comentário", c.commentImpulse)}
        ${field("cfg-commentCooldownSeconds", "Cooldown por usuário (s)", c.commentCooldownSeconds)}
        ${field("cfg-commentWindowSeconds", "Janela anti-spam (s)", c.commentWindowSeconds)}
        ${field("cfg-commentWindowMaxCount", "Máx. comentários por janela", c.commentWindowMaxCount)}
        ${field("cfg-maxVelocity", "Velocidade máxima", c.maxVelocity)}
        ${field("cfg-damping", "Amortecimento (0-1)", c.damping)}
      </div>
      <div class="row" style="margin-top:10px">
        <label><input type="checkbox" id="cfg-likesEnabled" ${c.likesEnabled ? "checked" : ""}/> Curtidas ativadas</label>
        <label><input type="checkbox" id="cfg-giftsEnabled" ${c.giftsEnabled ? "checked" : ""}/> Presentes ativados</label>
        <label><input type="checkbox" id="cfg-commentsEnabled" ${c.commentsEnabled ? "checked" : ""}/> Comentários 13/22 movem a corda</label>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="field" style="min-width:260px">
          <label>Integrantes Time Azul (separados por vírgula)</label>
          <input id="cfg-azul-members" type="text" value="${c.teamNames.AZUL.members.join(", ")}" />
        </div>
        <div class="field" style="min-width:260px">
          <label>Integrantes Time Vermelho (separados por vírgula)</label>
          <input id="cfg-vermelho-members" type="text" value="${c.teamNames.VERMELHO.members.join(", ")}" />
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="primary" id="btn-save-config">Salvar configuração</button>
      </div>
    </div>

    <div class="card">
      <h2>Log de eventos</h2>
      <div id="log-box"></div>
    </div>
  `;

  renderLog(state.log);
  wireButtons();
  controlsRendered = true;
  giftsKey = "";
  renderGifts(state);
}

function renderLog(log: ApiStateResponse["log"]) {
  const box = document.getElementById("log-box");
  if (!box) return;
  box.innerHTML = log
    .slice(-150)
    .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.level.toUpperCase()} ${escapeHtml(l.message)}`)
    .join("\n");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
}

function wireButtons() {
  byId("btn-start").onclick = () => api("/api/round/start", { method: "POST" });
  byId("btn-pause").onclick = () => api("/api/round/pause", { method: "POST" });
  byId("btn-reset-keep").onclick = () =>
    api("/api/round/reset", { method: "POST", body: JSON.stringify({ keepHistory: true }) });
  byId("btn-reset-all").onclick = () => {
    if (confirm("Zerar TODO o histórico (placar e rounds)? Esta ação não pode ser desfeita.")) {
      void api("/api/round/reset", { method: "POST", body: JSON.stringify({ keepHistory: false }) });
    }
  };

  byId("sim-13").onclick = () =>
    api("/api/simulate/comment", { method: "POST", body: JSON.stringify({ text: "13", nickname: "espectador" }) });
  byId("sim-22").onclick = () =>
    api("/api/simulate/comment", { method: "POST", body: JSON.stringify({ text: "22", nickname: "espectador" }) });

  byId("new-gift-azul").onclick = () => addGiftFromForm("AZUL");
  byId("new-gift-vermelho").onclick = () => addGiftFromForm("VERMELHO");

  byId("sim-load").onclick = () => api("/api/simulate/load", { method: "POST", body: JSON.stringify({ count: 100 }) });

  byId("btn-tiktok-connect").onclick = () => {
    const username = (byId("tiktok-username") as HTMLInputElement).value.trim();
    void api("/api/tiktok/connect", { method: "POST", body: JSON.stringify({ username }) });
  };
  byId("btn-tiktok-disconnect").onclick = () => api("/api/tiktok/disconnect", { method: "POST" });

  byId("btn-save-config").onclick = () => saveConfig();
  byId("btn-reload").onclick = () => {
    controlsRendered = false;
    void refresh();
  };
}

let giftsKey = "";

/** Re-renderiza a secao de presentes so quando mapeamento ou lista mudarem (nao apaga o que esta sendo digitado). */
function renderGifts(state: ApiStateResponse) {
  lastConfig = state.config;
  const key = JSON.stringify([state.config.gifts, state.unknownGifts.map((g) => [g.giftId, g.units])]);
  if (key === giftsKey) return;
  giftsKey = key;
  const gifts = state.config.gifts;

  byId("gift-map").innerHTML = gifts.length
    ? `<table><tr><th>Ícone</th><th>Rótulo</th><th>ID</th><th>Nome</th><th>Time</th><th>Impulso</th><th></th></tr>${gifts
        .map((g, i) => {
          const icon = resolveGiftIcon(g.icon, g.giftName, g.label) ?? "";
          return `<tr>
            <td style="white-space:nowrap">${icon ? `<img src="${giftIconUrl(icon)}" width="32" height="32" style="vertical-align:middle" />` : ""}
              <select data-gi="${i}" data-f="icon">
                <option value="">(sem ícone)</option>
                ${GIFT_ICONS.map((ic) => `<option value="${ic.slug}" ${ic.slug === icon ? "selected" : ""}>${escapeHtml(ic.label)}</option>`).join("")}
              </select></td>
            <td><input data-gi="${i}" data-f="label" value="${escapeAttr(g.label)}" /></td>
            <td><input data-gi="${i}" data-f="giftId" value="${escapeAttr(g.giftId)}" size="8" /></td>
            <td><input data-gi="${i}" data-f="giftName" value="${escapeAttr(g.giftName ?? "")}" size="12" /></td>
            <td><select data-gi="${i}" data-f="team">
              <option value="AZUL" ${g.team === "AZUL" ? "selected" : ""}>AZUL</option>
              <option value="VERMELHO" ${g.team === "VERMELHO" ? "selected" : ""}>VERMELHO</option></select></td>
            <td><input data-gi="${i}" data-f="impulse" type="number" value="${g.impulse}" style="width:80px" /></td>
            <td><button class="danger" data-remove="${i}">Remover</button></td></tr>`;
        })
        .join("")}</table>`
    : `<p class="warn">Nenhum presente mapeado: a corda não vai se mexer.</p>`;

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#gift-map [data-gi]").forEach((el) => {
    el.onchange = () => {
      const next = structuredClone(gifts);
      const g = next[Number(el.dataset.gi)] as unknown as Record<string, unknown>;
      g[el.dataset.f!] = el.dataset.f === "impulse" ? Number(el.value) : el.value.trim();
      void saveGifts(next);
    };
  });
  document.querySelectorAll<HTMLButtonElement>("#gift-map [data-remove]").forEach((btn) => {
    btn.onclick = () => void saveGifts(gifts.filter((_, i) => i !== Number(btn.dataset.remove)));
  });

  const unknown = state.unknownGifts;
  byId("unknown-gifts").innerHTML = unknown.length
    ? `<table><tr><th>ID</th><th>Nome</th><th>Diamantes</th><th>Recebidos</th><th></th></tr>${unknown
        .map(
          (u, i) => `<tr><td>${escapeHtml(u.giftId)}</td><td>${escapeHtml(u.giftName || "?")}</td>
            <td>${u.diamondCount ?? "?"}</td><td>${u.units}</td>
            <td><button class="azul" data-map="${i}" data-team="AZUL">→ AZUL</button>
                <button class="vermelho" data-map="${i}" data-team="VERMELHO">→ VERMELHO</button></td></tr>`
        )
        .join("")}</table>`
    : `<p style="color:#8d99ab;font-size:13px">Nenhum. Quando chegar um presente sem mapeamento, ele aparece aqui.</p>`;
  document.querySelectorAll<HTMLButtonElement>("#unknown-gifts [data-map]").forEach((btn) => {
    btn.onclick = () => mapUnknown(unknown[Number(btn.dataset.map)], btn.dataset.team as Team);
  });

  byId("sim-gifts").innerHTML = gifts
    .map(
      (g, i) =>
        `<button class="${g.team === "AZUL" ? "azul" : "vermelho"}" data-sim="${i}">${escapeHtml(g.label)} → ${g.team}</button>`
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("#sim-gifts [data-sim]").forEach((btn) => {
    const g = gifts[Number(btn.dataset.sim)];
    btn.onclick = () =>
      api("/api/simulate/gift", {
        method: "POST",
        body: JSON.stringify({ giftId: g.giftId, giftName: g.giftName, userId: `sim-${Date.now()}` })
      });
  });
}

/** Mesmo valor por diamante da Rosa: um presente de 100 diamantes vale 100 rosas. */
function defaultImpulse(diamonds: number | null): number {
  const rose = lastConfig?.gifts.find((g) => g.giftName?.toLowerCase() === "rose") ?? lastConfig?.gifts[0];
  return (rose?.impulse ?? 5) * Math.max(1, diamonds ?? 1);
}

function newGift(giftId: string, giftName: string, team: Team, diamonds: number | null): GiftEffectConfig {
  return {
    giftId,
    giftName: giftName || undefined,
    label: giftName || `Presente ${giftId}`,
    icon: resolveGiftIcon(undefined, giftName) ?? undefined,
    team,
    impulse: defaultImpulse(diamonds),
    superForceSeconds: 0,
    superForceMultiplier: 1,
    particles: true
  };
}

function mapUnknown(u: UnknownGift, team: Team) {
  if (!lastConfig) return;
  void saveGifts([...lastConfig.gifts, newGift(u.giftId, u.giftName, team, u.diamondCount)]);
}

function addGiftFromForm(team: Team) {
  if (!lastConfig) return;
  const id = (byId("new-gift-id") as HTMLInputElement).value.trim();
  const name = (byId("new-gift-name") as HTMLInputElement).value.trim();
  if (!id && !name) return alert("Informe o ID ou o nome do presente.");
  void saveGifts([...lastConfig.gifts, newGift(id, name, team, null)]);
}

async function saveGifts(gifts: GiftEffectConfig[]) {
  await api("/api/config", { method: "POST", body: JSON.stringify({ gifts }) });
  await refresh();
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function saveConfig() {
  if (!lastConfig) return;
  const num = (id: string) => Number((byId(id) as HTMLInputElement).value);
  const bool = (id: string) => (byId(id) as HTMLInputElement).checked;
  const str = (id: string) => (byId(id) as HTMLInputElement).value;

  const partial: Partial<GameConfig> = {
    roundDurationSeconds: num("cfg-roundDurationSeconds"),
    intervalSeconds: num("cfg-intervalSeconds"),
    victoryScreenSeconds: num("cfg-victoryScreenSeconds"),
    drawToleranceAbs: num("cfg-drawToleranceAbs"),
    commentImpulse: num("cfg-commentImpulse"),
    commentCooldownSeconds: num("cfg-commentCooldownSeconds"),
    commentWindowSeconds: num("cfg-commentWindowSeconds"),
    commentWindowMaxCount: num("cfg-commentWindowMaxCount"),
    maxVelocity: num("cfg-maxVelocity"),
    damping: num("cfg-damping"),
    likesEnabled: bool("cfg-likesEnabled"),
    giftsEnabled: bool("cfg-giftsEnabled"),
    commentsEnabled: bool("cfg-commentsEnabled"),
    teamNames: {
      AZUL: {
        title: lastConfig.teamNames.AZUL.title,
        members: str("cfg-azul-members")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      },
      VERMELHO: {
        title: lastConfig.teamNames.VERMELHO.title,
        members: str("cfg-vermelho-members")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }
  };

  void api("/api/config", { method: "POST", body: JSON.stringify(partial) }).then(() => refresh());
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento ${id} nao encontrado`);
  return el;
}

async function refresh() {
  try {
    const state = await api<ApiStateResponse>("/api/state");
    renderStatus(state);
    // Redesenha se a config mudou no servidor (ex.: por outra aba ou pela API), para o
    // botao Salvar nunca regravar valores antigos por cima.
    if (!controlsRendered || (configKey(state.config) !== renderedConfigKey && !isEditing())) {
      renderControls(state);
    } else {
      renderLog(state.log);
      renderGifts(state);
    }
  } catch {
    statusBar.innerHTML = badge("Servidor OFFLINE — rode o server (npm run dev na pasta server)", "off");
  }
}

refresh();
setInterval(refresh, 1500);
