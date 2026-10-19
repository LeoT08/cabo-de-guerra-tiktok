import Phaser from "phaser";
import { GameWsClient } from "../net/wsClient";
import { EngineSnapshot, OverlayMessage, RoundPhase, Team } from "../net/types";
import { sound } from "../sound";
import { GIFT_ICONS, giftIconUrl, resolveGiftIcon } from "../giftIcons";
import {
  AZUL_CHARACTERS,
  VERMELHO_CHARACTERS,
  AZUL_STAGE,
  VERMELHO_STAGE,
  BACKGROUND_IMAGE,
  CharacterAsset,
  StageTier
} from "./characterAssets";

// Formato de celular (~400x900, proporcao 0.45) em resolucao maior para ficar nitido no OBS.
export const WIDTH = 720;
export const HEIGHT = 1600;

const COLOR_AZUL = 0x2d6cdf;
const COLOR_VERMELHO = 0xdc3545;
const COLOR_BG = 0x0b0e14;

const CENTER_X = WIDTH / 2;

// Faixa do cenario (fundo recortado no centro). Fica na metade de cima da tela:
// no celular, o chat do TikTok cobre a parte de baixo.
const BAND_TOP = 410;
const BAND_BOTTOM = 930;
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP;

// Linha dos pes dos personagens (sobre a pista do cenario).
const FEET_Y = 900;
// Altura em tela do quadro "puxando" do personagem da frente.
const FIGHTER_HEIGHT = 220;
// Altura (fracao do quadro, a partir dos pes) onde as maos seguram a corda.
const HANDS_FRACTION = 0.5;
// Distancia horizontal do centro ate cada personagem (frente -> fundo).
const SLOT_OFFSETS = [118, 196, 266];
// Quanto a corda/grupos andam quando a posicao chega a +-100 (vitoria).
const ROPE_RANGE_PX = 120;

// Barra de forca, quadro de legenda e lista de eventos.
// Nome de cada lado na legenda de presentes ("PUXA AZUL"). So a cor do time:
// nome de politico/partido na tela causava restricao na LIVE.
const LEGEND_TEAM_NAME: Record<Team, string> = { AZUL: "AZUL", VERMELHO: "VERMELHO" };

// Fotos dos presentes na legenda (public/assets/gifts).
const SHOW_GIFT_ICONS = true;
// Icone do presente nao fica fixo: aparece numa piscada e some, com intervalo
// sorteado a cada vez e independente por figurinha (os dois lados nunca sincronizam).
const GIFT_BLINK_GAP_MS = { min: 1200, max: 4500 };
const GIFT_BLINK_SHOW_MS = { min: 350, max: 900 };
const GIFT_BLINK_FADE_MS = 120;

const BAR_Y = 960;
const LEGEND_Y = 158;
const HUD_Y = 388;
const EVENTS_Y = BAND_TOP + 24;

const TIER_CONFIG: Record<StageTier, { scale: number; yOffset: number; depth: number }> = {
  front: { scale: 1, yOffset: 0, depth: 30 },
  mid: { scale: 0.9, yOffset: -22, depth: 20 },
  back: { scale: 0.82, yOffset: -40, depth: 10 }
};

// Inclinacao (radianos) de quem puxa: sempre um pouco para tras; mais quando esta ganhando.
const LEAN_BASE = 0.05;
const LEAN_WINNING = 0.13;
const LEAN_LOSING = -0.03;

// Ritmo de troca de quadros "puxando" (ms).
const FRAME_MS_FAST = 85;
const FRAME_MS_NORMAL = 170;
const FRAME_MS_SLOW = 260;

const BG_KEY = "bg_brasilia";

interface OverlayEntry {
  message: OverlayMessage;
  text: Phaser.GameObjects.Text;
  expiresAt: number;
}

interface Fighter {
  team: Team;
  container: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  asset: CharacterAsset;
  baseX: number;
  baseY: number;
  scale: number;
  bob: Phaser.Tweens.Tween;
}

interface TeamAnim {
  frameIndex: number;
  frameElapsed: number;
  yank: number; // deslocamento extra (px) do tranco de presente, decai sozinho
}

export class MainScene extends Phaser.Scene {
  private wsClient!: GameWsClient;
  private snapshot: EngineSnapshot | null = null;
  private connected = false;
  private lastPhase: RoundPhase | null = null;

  /** Posicao exibida, interpolada a partir dos snapshots (~20Hz) para movimento suave. */
  private displayPos = 0;
  /** Velocidade exibida (unidades/s), usada para decidir quem esta ganhando terreno. */
  private displayVel = 0;
  private celebrating = false;

  private timerText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private connectionBanner!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;

  private rope!: Phaser.GameObjects.Graphics;
  private knot!: Phaser.GameObjects.Container;
  private forceBar!: Phaser.GameObjects.Graphics;
  private positionLabel!: Phaser.GameObjects.Text;

  private fighters: Fighter[] = [];
  private teamAnim: Record<Team, TeamAnim> = {
    AZUL: { frameIndex: 0, frameElapsed: 0, yank: 0 },
    VERMELHO: { frameIndex: 0, frameElapsed: 0, yank: 0 }
  };

  private overlayEntries: OverlayEntry[] = [];
  private overlayContainer!: Phaser.GameObjects.Container;

  private victoryContainer!: Phaser.GameObjects.Container;
  private victoryText!: Phaser.GameObjects.Text;

  private superForceBanner!: Phaser.GameObjects.Text;
  private legendContainer!: Phaser.GameObjects.Container;
  private legendKey = "";

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.image(BG_KEY, BACKGROUND_IMAGE);
    [...AZUL_CHARACTERS, ...VERMELHO_CHARACTERS].forEach((asset) => {
      asset.pulling.forEach((url) => this.load.image(url, url));
      this.load.image(asset.idle[0], asset.idle[0]);
      this.load.image(asset.victory, asset.victory);
      this.load.image(asset.defeat, asset.defeat);
    });
    GIFT_ICONS.forEach((g) => this.load.image(`gift_${g.slug}`, giftIconUrl(g.slug)));
  }

  create() {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.buildParticleTexture();
    this.buildBackgroundBand();
    this.buildHeader();
    this.buildRopeScene();
    this.buildBottomPanel();
    this.buildVictoryOverlay();
    this.buildMuteButton();
    this.buildConnectionBanner();

    this.wsClient = new GameWsClient(this.resolveWsUrl(), {
      onSnapshot: (snap) => {
        this.snapshot = snap;
        this.updateLegend(snap.giftLegend ?? [], snap.commentsEnabled ?? false, snap.likesEnabled ?? false);
      },
      onOverlay: (msg) => this.handleOverlay(msg),
      onConnectionChange: (connected) => (this.connected = connected)
    });
    this.wsClient.connect();
  }

  private resolveWsUrl(): string {
    const override = new URLSearchParams(window.location.search).get("ws");
    return override ?? "ws://localhost:8081";
  }

  // ---------------------------------------------------------------- construcao

  private buildParticleTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture("particle", 16, 16);
    g.destroy();
  }

  private buildBackgroundBand() {
    // Cobre a faixa inteira (corta as laterais do panorama, mantem o centro).
    const bg = this.add.image(CENTER_X, BAND_BOTTOM, BG_KEY).setOrigin(0.5, 1);
    bg.setScale(BAND_HEIGHT / bg.height);
    const mask = this.make.graphics({}, false);
    mask.fillRect(0, BAND_TOP, WIDTH, BAND_HEIGHT);
    bg.setMask(mask.createGeometryMask());

    // Faixas de time sobre a pista e escurecimento leve no topo para o texto.
    this.add.rectangle(0, FEET_Y - 40, CENTER_X - 20, 90, COLOR_AZUL, 0.22).setOrigin(0, 0);
    this.add.rectangle(CENTER_X + 20, FEET_Y - 40, CENTER_X - 20, 90, COLOR_VERMELHO, 0.22).setOrigin(0, 0);
    const fade = this.add.graphics();
    fade.fillGradientStyle(COLOR_BG, COLOR_BG, COLOR_BG, COLOR_BG, 1, 1, 0, 0);
    fade.fillRect(0, BAND_TOP, WIDTH, 90);
    const fadeBottom = this.add.graphics();
    fadeBottom.fillGradientStyle(COLOR_BG, COLOR_BG, COLOR_BG, COLOR_BG, 0, 0, 1, 1);
    fadeBottom.fillRect(0, BAND_BOTTOM - 40, WIDTH, 40);
  }

  private buildHeader() {
    this.add
      .text(CENTER_X, 30, "CABO DE GUERRA", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "30px",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.roundText = this.add
      .text(24, HUD_Y, "ROUND 1", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "22px",
        color: "#ffd166"
      })
      .setOrigin(0, 0.5);

    this.timerText = this.add
      .text(CENTER_X, HUD_Y, "05:00", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "40px",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.scoreText = this.add
      .text(WIDTH - 24, HUD_Y, "", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "20px",
        color: "#ffffff"
      })
      .setOrigin(1, 0.5);

    this.modeText = this.add
      .text(WIDTH - 16, 14, "DEMO", {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#ffd166"
      })
      .setOrigin(1, 0);

  }

  private buildRopeScene() {
    // Marcas de vitoria (fixas): quando o no cruza uma delas, aquele time venceu.
    const markH = 70;
    this.add.rectangle(CENTER_X - ROPE_RANGE_PX, this.handsY(), 6, markH, COLOR_AZUL).setDepth(5);
    this.add.rectangle(CENTER_X + ROPE_RANGE_PX, this.handsY(), 6, markH, COLOR_VERMELHO).setDepth(5);
    this.add.rectangle(CENTER_X, this.handsY(), 2, markH - 20, 0xffffff, 0.5).setDepth(5);

    this.rope = this.add.graphics().setDepth(25);

    // Fila de cada time: frente (perto da corda) -> fundo. Vermelho eh o espelho do Azul.
    AZUL_STAGE.forEach((slot, i) => this.fighters.push(this.createFighter("AZUL", slot.asset, slot.tier, i)));
    VERMELHO_STAGE.forEach((slot, i) => this.fighters.push(this.createFighter("VERMELHO", slot.asset, slot.tier, i)));

    const knotBall = this.add.circle(0, 0, 13, 0xffd166).setStrokeStyle(3, 0x8a5a00);
    const ribbon = this.add.triangle(0, 22, -9, -8, 9, -8, 0, 14, 0xdc3545);
    this.knot = this.add.container(CENTER_X, this.handsY(), [ribbon, knotBall]).setDepth(40);
  }

  /** i = 0 frente, 1 meio, 2 fundo (ordem de AZUL_STAGE invertida: o array vai do fundo para a frente). */
  private createFighter(team: Team, asset: CharacterAsset, tier: StageTier, stageIndex: number): Fighter {
    const tierCfg = TIER_CONFIG[tier];
    const slot = team === "AZUL" ? 2 - stageIndex : stageIndex; // AZUL_STAGE vem do fundo para a frente
    const dir = team === "AZUL" ? -1 : 1;
    const baseX = CENTER_X + dir * SLOT_OFFSETS[slot];
    const baseY = FEET_Y + tierCfg.yOffset;

    const container = this.add.container(baseX, baseY).setDepth(tierCfg.depth);
    const image = this.add.image(0, 0, asset.pulling[0]).setOrigin(0.5, 1).setFlipX(team === "VERMELHO");
    const scale = (FIGHTER_HEIGHT / image.height) * tierCfg.scale;
    image.setScale(scale);
    container.add(image);

    const bob = this.tweens.add({
      targets: image,
      y: -4,
      duration: 380 + Math.random() * 160,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    return { team, container, image, asset, baseX, baseY, scale, bob };
  }

  private handsY(): number {
    return FEET_Y - FIGHTER_HEIGHT * HANDS_FRACTION;
  }

  private buildBottomPanel() {
    const barY = BAR_Y;
    this.add.rectangle(CENTER_X, barY, 600, 22, 0x1f2733).setStrokeStyle(2, 0x3a4556);
    this.add.rectangle(CENTER_X, barY, 2, 30, 0xffffff, 0.7);
    this.forceBar = this.add.graphics();

    this.positionLabel = this.add
      .text(CENTER_X, barY + 32, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "20px",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.superForceBanner = this.add
      .text(CENTER_X, barY + 66, "", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "22px",
        color: "#ffd166"
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.legendContainer = this.add.container(0, LEGEND_Y);

    this.overlayContainer = this.add.container(0, 0).setDepth(70);
  }

  private buildVictoryOverlay() {
    this.victoryContainer = this.add.container(0, 0).setVisible(false).setDepth(100);
    const bg = this.add.rectangle(CENTER_X, BAND_TOP + 130, WIDTH, 160, 0x000000, 0.7);
    this.victoryText = this.add
      .text(CENTER_X, BAND_TOP + 130, "", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "40px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: WIDTH - 60 }
      })
      .setOrigin(0.5);
    this.victoryContainer.add([bg, this.victoryText]);
  }

  private buildMuteButton() {
    const label = () => (sound.isMuted() ? "🔇" : "🔊");
    const btn = this.add
      .text(16, 10, label(), { fontSize: "26px" })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        sound.toggle();
        btn.setText(label());
      });
  }

  private buildConnectionBanner() {
    this.connectionBanner = this.add
      .text(CENTER_X, 122, "SEM CONEXÃO COM O SERVIDOR DO JOGO", {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#8b1e1e",
        padding: { x: 10, y: 6 }
      })
      .setOrigin(0.5)
      .setDepth(120)
      .setVisible(false);
  }

  // ---------------------------------------------------------------- eventos

  /**
   * Legenda no topo: figurinhas dos presentes nos cantos (AZUL a esquerda, VERMELHO a
   * direita, como os lados da corda) com selo "PUXA <nome>", e a chamada no meio.
   * Gerada dos presentes mapeados no servidor.
   */
  private updateLegend(legend: EngineSnapshot["giftLegend"], commentsEnabled: boolean, likesEnabled: boolean) {
    const key = JSON.stringify([legend, commentsEnabled, likesEnabled]);
    if (key === this.legendKey) return;
    this.legendKey = key;
    this.legendContainer.removeAll(true);

    const items: Phaser.GameObjects.GameObject[] = [];
    const stickerW = 150;
    let height = 120;
    (["AZUL", "VERMELHO"] as const).forEach((team) => {
      const gifts = legend.filter((g) => g.team === team);
      gifts.forEach((g, i) => {
        // Do canto para o centro: AZUL a partir da esquerda, VERMELHO da direita.
        const x = team === "AZUL" ? 12 + stickerW / 2 + i * stickerW : WIDTH - 12 - stickerW / 2 - i * stickerW;
        const { objects, bottom } = this.buildGiftSticker(g, team, x);
        items.push(...objects);
        height = Math.max(height, bottom);
      });
    });

    const sideCount = Math.max(1, ...(["AZUL", "VERMELHO"] as const).map((t) => legend.filter((g) => g.team === t).length));
    const centerW = WIDTH - 24 - 2 * sideCount * stickerW;
    // Descreve a regra, sem pedir presente: texto fixo pedindo presente conta como
    // "solicitacao de presente" nas Diretrizes de Monetizacao de LIVE do TikTok (gera restricao).
    const centerLines = ["COMO", "FUNCIONA"];
    items.push(
      this.add
        .text(CENTER_X, 4, centerLines.join("\n"), {
          fontFamily: "Arial Black, sans-serif",
          fontSize: centerW > 260 ? "26px" : "22px",
          color: "#ffd166",
          align: "center",
          stroke: "#000000",
          strokeThickness: 5,
          lineSpacing: -4,
          wordWrap: { width: Math.max(140, centerW) }
        })
        .setOrigin(0.5, 0)
    );
    // Jogar de graca em destaque: o presente aparece como opcional, nao como a unica forma de participar.
    const freeLines: { text: string; size: string; color: string }[] = [];
    if (commentsEnabled) {
      freeLines.push({ text: `Comente "22" → ${LEGEND_TEAM_NAME.AZUL}\nComente "13" → ${LEGEND_TEAM_NAME.VERMELHO}`, size: "17px", color: "#ffffff" });
      if (likesEnabled) freeLines.push({ text: "❤ curtir ajuda o seu time", size: "15px", color: "#ff9fa8" });
      freeLines.push({ text: "grátis · presente é opcional", size: "14px", color: "#b8c2cc" });
    }
    let y = 70;
    for (const line of freeLines) {
      const t = this.add
        .text(CENTER_X, y, line.text, {
          fontFamily: "Arial, sans-serif",
          fontSize: line.size,
          fontStyle: "bold",
          color: line.color,
          align: "center",
          stroke: "#000000",
          strokeThickness: 3
        })
        .setOrigin(0.5, 0);
      items.push(t);
      y += t.height + 2;
    }
    height = Math.max(height, y);
    this.legendContainer.add(items);
  }

  /** Figurinha: icone grande com brilho na cor do time + selo "PUXA <nome>". */
  private buildGiftSticker(g: EngineSnapshot["giftLegend"][number], team: Team, x: number) {
    const color = team === "AZUL" ? COLOR_AZUL : COLOR_VERMELHO;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const iconSize = 112;
    const iconY = 4 + iconSize / 2;

    const icon = SHOW_GIFT_ICONS ? resolveGiftIcon(g.icon, g.giftName, g.label) : null;
    // Disco na cor do time atras do icone (funciona tambem sem WebGL).
    objects.push(this.add.circle(x, iconY, iconSize / 2 - 2, color, 0.35).setStrokeStyle(4, color, 0.9));
    if (icon) {
      const img = this.add.image(x, iconY, `gift_${icon}`);
      img.setScale((iconSize - 8) / Math.max(img.width, img.height));
      img.preFX?.addGlow(0xffffff, 3, 0, false, 0.1, 10);
      img.setAlpha(0);
      this.scheduleGiftBlink(img);
      objects.push(img);
    } else {
      objects.push(
        this.add
          .text(x, iconY, g.label, {
            fontFamily: "Arial Black, sans-serif",
            fontSize: "20px",
            color: "#ffffff",
            align: "center",
            wordWrap: { width: iconSize - 10 }
          })
          .setOrigin(0.5)
      );
    }

    // Selo inclinado, como figurinha.
    const badgeY = iconY + iconSize / 2 + 26;
    const badgeW = 140;
    const badgeH = 58;
    const badge = this.add.graphics({ x, y: badgeY });
    badge.fillStyle(0x000000, 0.35).fillRoundedRect(-badgeW / 2 + 3, -badgeH / 2 + 4, badgeW, badgeH, 14);
    badge.fillStyle(color, 1).fillRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 14);
    badge.lineStyle(4, 0xffffff, 1).strokeRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 14);
    const name = LEGEND_TEAM_NAME[team];
    const label = this.add
      .text(x, badgeY, `PUXA\n${name}`, {
        fontFamily: "Arial Black, sans-serif",
        fontSize: name.length > 6 ? "19px" : "22px",
        color: "#ffffff",
        align: "center",
        stroke: "#000000",
        strokeThickness: 4,
        lineSpacing: -4
      })
      .setOrigin(0.5);
    const tilt = team === "AZUL" ? -0.06 : 0.06;
    badge.setRotation(tilt);
    label.setRotation(tilt);
    objects.push(badge, label);
    return { objects, bottom: badgeY + badgeH / 2 + 6 };
  }

  /** Uma piscada do icone apos um intervalo aleatorio; reagenda a proxima ate a legenda ser refeita. */
  private scheduleGiftBlink(img: Phaser.GameObjects.Image) {
    const gap = Phaser.Math.Between(GIFT_BLINK_GAP_MS.min, GIFT_BLINK_GAP_MS.max);
    this.time.delayedCall(gap, () => {
      if (!img.active) return; // legenda refeita: figurinha antiga destruida
      this.tweens.add({
        targets: img,
        alpha: 1,
        duration: GIFT_BLINK_FADE_MS,
        yoyo: true,
        hold: Phaser.Math.Between(GIFT_BLINK_SHOW_MS.min, GIFT_BLINK_SHOW_MS.max),
        onComplete: () => {
          if (img.active) this.scheduleGiftBlink(img);
        }
      });
    });
  }

  private handleOverlay(message: OverlayMessage) {
    const text = this.add
      .text(24, 0, message.text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
        color: message.team === "AZUL" ? "#9fc2ff" : message.team === "VERMELHO" ? "#ff9fa8" : "#e6e6e6",
        wordWrap: { width: WIDTH - 48 }
      })
      .setAlpha(0)
      .setDepth(70);
    this.overlayContainer.add(text);
    this.overlayEntries.push({ message, text, expiresAt: this.time.now + 4500 });

    const isGift = message.kind === "gift" || message.kind === "superforce";
    if (isGift) {
      sound.gift();
      if (message.kind === "superforce") sound.superForce();
      this.spawnParticles(message.team);
    } else if (message.team) {
      sound.tick();
    }
    if (message.team && this.snapshot?.phase === "ROUND") {
      // Tranco: o time ajudado da um puxao visivel para tras.
      this.teamAnim[message.team].yank = isGift ? 22 : 9;
      this.teamAnim[message.team].frameElapsed = FRAME_MS_FAST;
    }
  }

  private spawnParticles(team: Team | null) {
    const x = team === "AZUL" ? CENTER_X - SLOT_OFFSETS[1] : team === "VERMELHO" ? CENTER_X + SLOT_OFFSETS[1] : CENTER_X;
    const color = team === "AZUL" ? COLOR_AZUL : team === "VERMELHO" ? COLOR_VERMELHO : 0xffd166;
    const emitter = this.add
      .particles(x, FEET_Y - FIGHTER_HEIGHT * 0.8, "particle", {
        speed: { min: 120, max: 260 },
        angle: { min: 220, max: 320 },
        lifespan: 700,
        scale: { start: 1, end: 0 },
        quantity: 18,
        tint: color,
        emitting: false
      })
      .setDepth(60);
    emitter.explode(18);
    this.time.delayedCall(800, () => emitter.destroy());
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 100) / 1000;
    this.layoutOverlayQueue();
    this.connectionBanner.setVisible(!this.connected);

    if (!this.snapshot) return;
    const snap = this.snapshot;

    this.updateHud(snap);

    // Interpolacao exponencial ate a posicao do servidor (sem "pulos" de 20Hz).
    const prev = this.displayPos;
    this.displayPos += (snap.rope.position - this.displayPos) * (1 - Math.exp(-dt * 10));
    const instVel = dt > 0 ? (this.displayPos - prev) / dt : 0;
    this.displayVel += (instVel - this.displayVel) * (1 - Math.exp(-dt * 6));

    this.handlePhaseTransition(snap);

    const shift = (Phaser.Math.Clamp(this.displayPos, -100, 100) / 100) * ROPE_RANGE_PX;
    this.drawForceBar(this.displayPos);
    this.positionLabel.setText(
      Math.abs(snap.rope.position) < 0.5
        ? "Equilibrado"
        : snap.rope.position < 0
        ? `Vantagem AZUL (${Math.abs(Math.round(snap.rope.position))})`
        : `Vantagem VERMELHO (${Math.round(snap.rope.position)})`
    );

    this.knot.setPosition(CENTER_X + shift, this.handsY());

    if (!this.celebrating) {
      this.animateFighters(snap.phase, shift, deltaMs);
    }
    this.drawRope(shift);
  }

  private updateHud(snap: EngineSnapshot) {
    this.roundText.setText(`ROUND ${snap.roundNumber || 1}`);
    this.timerText.setText(formatTime(snap.timeRemainingSeconds));
    this.scoreText.setText(`AZUL ${snap.score.AZUL} x ${snap.score.VERMELHO} VERM.`);
    this.modeText.setText(snap.mode === "REAL" ? (snap.tiktokConnected ? "AO VIVO" : "REAL (reconectando)") : "DEMO");
    this.modeText.setColor(snap.mode === "REAL" && snap.tiktokConnected ? "#5fd17a" : "#ffd166");

    if (snap.superForce) {
      const secondsLeft = Math.max(0, Math.ceil((snap.superForce.expiresAt - snap.serverTimeMs) / 1000));
      this.superForceBanner
        .setVisible(true)
        .setText(`⚡ SUPERFORÇA ${snap.superForce.team} (${secondsLeft}s)`)
        .setColor(snap.superForce.team === "AZUL" ? "#9fc2ff" : "#ff9fa8");
    } else {
      this.superForceBanner.setVisible(false);
    }
  }

  /**
   * Postura por time: quem ganha terreno inclina mais para tras e puxa rapido;
   * quem cede fica mais ereto, puxa devagar e "escorrega" (tremida). Todos andam
   * junto com a corda (mesmo deslocamento do no).
   */
  private animateFighters(phase: RoundPhase, shift: number, deltaMs: number) {
    const inRound = phase === "ROUND";
    // displayVel < 0 => corda indo para a esquerda => AZUL ganhando terreno.
    const momentum = Phaser.Math.Clamp(-this.displayVel / 25, -1, 1); // +1 azul ganhando, -1 vermelho ganhando

    (["AZUL", "VERMELHO"] as Team[]).forEach((team) => {
      const anim = this.teamAnim[team];
      anim.yank *= Math.exp(-deltaMs / 120);
      const winning = team === "AZUL" ? momentum : -momentum; // -1..1
      if (!inRound) return;
      const frameMs = winning > 0.25 ? FRAME_MS_FAST : winning < -0.25 ? FRAME_MS_SLOW : FRAME_MS_NORMAL;
      anim.frameElapsed += deltaMs;
      if (anim.frameElapsed >= frameMs) {
        anim.frameElapsed = 0;
        anim.frameIndex = (anim.frameIndex + 1) % 4;
      }
    });

    for (const f of this.fighters) {
      const dir = f.team === "AZUL" ? -1 : 1; // para "tras" (longe do centro)
      const anim = this.teamAnim[f.team];
      const winning = f.team === "AZUL" ? momentum : -momentum;

      if (inRound) {
        f.image.setTexture(f.asset.pulling[anim.frameIndex]);
        const lean = winning >= 0 ? LEAN_BASE + (LEAN_WINNING - LEAN_BASE) * winning : LEAN_BASE + (LEAN_BASE - LEAN_LOSING) * winning;
        // Origem nos pes; rotacao com o sinal de "dir" inclina o topo para tras (longe do centro).
        f.container.rotation = dir * lean;
        const slip = winning < -0.3 ? Math.sin(this.time.now / 35 + f.baseX) * 2.5 * -winning : 0;
        f.container.x = f.baseX + shift + dir * anim.yank + slip;
      } else {
        f.container.rotation = 0;
        f.container.x = f.baseX + shift;
      }
      f.container.y = f.baseY;
    }
  }

  /** Corda: passa pelas maos de todos, do ultimo Azul ao ultimo Vermelho, e anda com o no. */
  private drawRope(shift: number) {
    this.rope.clear();
    if (this.celebrating) return;
    const y = this.handsY();
    const leftEnd = CENTER_X - SLOT_OFFSETS[0] + shift;
    const rightEnd = CENTER_X + SLOT_OFFSETS[0] + shift;
    this.rope.lineStyle(9, 0x6b4a22, 1);
    this.rope.lineBetween(leftEnd, y, rightEnd, y);
    this.rope.lineStyle(3, 0xd9b26a, 0.9);
    this.rope.lineBetween(leftEnd, y - 2, rightEnd, y - 2);
  }

  private drawForceBar(position: number) {
    this.forceBar.clear();
    const half = 300;
    const filled = (Phaser.Math.Clamp(position, -100, 100) / 100) * half;
    this.forceBar.fillStyle(position < 0 ? COLOR_AZUL : COLOR_VERMELHO, 0.9);
    if (filled >= 0) this.forceBar.fillRect(CENTER_X, BAR_Y - 11, filled, 22);
    else this.forceBar.fillRect(CENTER_X + filled, BAR_Y - 11, -filled, 22);
  }

  private layoutOverlayQueue() {
    const now = this.time.now;
    this.overlayEntries = this.overlayEntries.filter((entry) => {
      const alive = entry.expiresAt > now;
      if (!alive) entry.text.destroy();
      return alive;
    });
    const visible = this.overlayEntries.slice(-5);
    this.overlayEntries.slice(0, -5).forEach((e) => e.text.setAlpha(0));
    visible.forEach((entry, i) => {
      entry.text.setY(EVENTS_Y + i * 30);
      const remaining = entry.expiresAt - now;
      entry.text.setAlpha(remaining < 500 ? remaining / 500 : 1);
    });
  }

  // ---------------------------------------------------------------- fases

  private handlePhaseTransition(snap: EngineSnapshot) {
    if (snap.phase === this.lastPhase) return;
    this.lastPhase = snap.phase;

    if (snap.phase === "VICTORY") {
      const label =
        snap.lastWinner === "EMPATE"
          ? "EMPATE TÉCNICO!"
          : snap.lastWinner === "AZUL"
          ? "TIME AZUL VENCEU!"
          : "TIME VERMELHO VENCEU!";
      this.victoryText.setText(label);
      this.victoryText.setColor(
        snap.lastWinner === "AZUL" ? "#9fc2ff" : snap.lastWinner === "VERMELHO" ? "#ff9fa8" : "#ffd166"
      );
      this.victoryContainer.setVisible(true);
      if (snap.lastWinner === "AZUL" || snap.lastWinner === "VERMELHO") sound.victoryMusic(snap.lastWinner);
      else sound.victory();
      this.playCelebration(snap.lastWinner);
      return;
    }

    // A musica de vitoria toca durante a tela de vitoria e o intervalo; some quando o round recomeca.
    if (snap.phase === "ROUND" || snap.phase === "PAUSED") sound.fadeOutMusic();
    this.victoryContainer.setVisible(false);
    this.resetFighters(snap.phase === "ROUND" ? "pulling" : "idle");
    if (snap.phase === "ROUND") this.displayPos = snap.rope.position;
  }

  private resetFighters(pose: "pulling" | "idle") {
    this.celebrating = false;
    for (const f of this.fighters) {
      this.tweens.killTweensOf(f.container);
      f.container.setAlpha(1).setRotation(0).setPosition(f.baseX, f.baseY);
      const key = pose === "pulling" ? f.asset.pulling[0] : f.asset.idle[0];
      this.setFighterTexture(f, key);
      f.bob.resume();
    }
    this.teamAnim.AZUL = { frameIndex: 0, frameElapsed: 0, yank: 0 };
    this.teamAnim.VERMELHO = { frameIndex: 0, frameElapsed: 0, yank: 0 };
  }

  /** Troca a pose mantendo a altura relativa do personagem (quadros tem tamanhos diferentes). */
  private setFighterTexture(f: Fighter, key: string, heightMul = 1) {
    f.image.setTexture(key);
    if (f.asset.pulling.includes(key)) {
      f.image.setScale(f.scale);
    } else {
      // Em pe/comemorando eh mais alto que o "puxando" agachado: ~12% acima da altura dele.
      const pullH = this.textures.get(f.asset.pulling[0]).getSourceImage().height * f.scale;
      const poseH = this.textures.get(key).getSourceImage().height;
      f.image.setScale(((pullH * 1.12) / poseH) * heightMul);
    }
    f.image.y = 0;
  }

  private playCelebration(winner: Team | "EMPATE" | null) {
    this.celebrating = true;
    this.rope.clear();
    for (const f of this.fighters) {
      f.bob.pause();
      f.image.y = 0;
      this.tweens.killTweensOf(f.container);
      f.container.setRotation(0);
    }
    if (winner === "EMPATE" || winner === null) {
      this.fighters.forEach((f) => this.setFighterTexture(f, f.asset.idle[0]));
      return;
    }
    this.fighters.forEach((f, i) => {
      const dir = f.team === "AZUL" ? -1 : 1;
      if (f.team === winner) {
        this.setFighterTexture(f, f.asset.victory);
        this.tweens.add({
          targets: f.container,
          y: f.baseY - 26,
          duration: 260,
          yoyo: true,
          repeat: -1,
          ease: "Quad.easeOut",
          delay: (i % 3) * 90
        });
      } else {
        this.setFighterTexture(f, f.asset.defeat, 0.75);
        // Cai para a frente (em direcao ao centro), puxado pelo time vencedor.
        this.tweens.add({
          targets: f.container,
          x: f.container.x - dir * 30,
          duration: 450,
          ease: "Cubic.easeOut"
        });
      }
    });
  }
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
