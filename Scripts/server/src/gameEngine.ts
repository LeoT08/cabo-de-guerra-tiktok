import { GameConfig } from "./config.js";
import { ScoreBoard } from "./persistence.js";
import { NormalizedEvent, OverlayMessage, Team } from "./events.js";
import { RopePhysicsState, applyImpulse, stepPhysics, LIMIT } from "./physics.js";
import { parseTeamCommand } from "./commandParser.js";
import { EventDeduper } from "./dedupe.js";
import { CommentRateLimiter } from "./rateLimit.js";
import { resolveGiftEffect } from "./giftMap.js";
import { logger } from "./logger.js";

export type RoundPhase = "ROUND" | "VICTORY" | "INTERMISSION" | "PAUSED";

export interface SuperForceState {
  team: Team;
  expiresAt: number;
  multiplier: number;
}

export interface EngineSnapshot {
  phase: RoundPhase;
  roundNumber: number;
  timeRemainingSeconds: number;
  rope: RopePhysicsState;
  score: ScoreBoard;
  lastWinner: Team | "EMPATE" | null;
  superForce: SuperForceState | null;
  /** Legenda "presente -> time" gerada da config, para a tela do jogo */
  giftLegend: { label: string; giftName?: string; icon?: string; team: Team; impulse: number }[];
  commentsEnabled: boolean;
  likesEnabled: boolean;
  mode: GameConfig["mode"];
  tiktokConnected: boolean;
  teamNames: GameConfig["teamNames"];
  serverTimeMs: number;
}

/** Presente recebido que nao esta mapeado na config (para o operador mapear no painel). */
export interface UnknownGift {
  giftId: string;
  giftName: string;
  diamondCount: number | null;
  units: number;
  lastSeenAt: number;
}

const MAX_UNKNOWN_GIFTS = 20;

export interface EngineCallbacks {
  onPersist: () => void;
}

export class GameEngine {
  private config: GameConfig;
  private score: ScoreBoard;
  private roundsPlayed: number;

  private phase: RoundPhase = "PAUSED";
  private roundNumber = 0;
  private timeRemainingSeconds: number;
  private rope: RopePhysicsState = { position: 0, velocity: 0 };
  private lastWinner: Team | "EMPATE" | null = null;
  private superForce: SuperForceState | null = null;
  private phaseEndsAt = 0;
  private unknownGifts = new Map<string, UnknownGift>();

  private teamOf = new Map<string, Team>();
  private deduper = new EventDeduper();
  private rateLimiter: CommentRateLimiter;
  private tiktokConnectedFlag = false;

  constructor(config: GameConfig, score: ScoreBoard, roundsPlayed: number, private callbacks: EngineCallbacks) {
    this.config = config;
    this.score = score;
    this.roundsPlayed = roundsPlayed;
    this.timeRemainingSeconds = config.roundDurationSeconds;
    this.rateLimiter = new CommentRateLimiter(
      config.commentCooldownSeconds,
      config.commentWindowSeconds,
      config.commentWindowMaxCount
    );
  }

  updateConfig(partial: Partial<GameConfig>) {
    this.config = { ...this.config, ...partial };
    this.rateLimiter.updateLimits(
      this.config.commentCooldownSeconds,
      this.config.commentWindowSeconds,
      this.config.commentWindowMaxCount
    );
  }

  getConfig(): GameConfig {
    return this.config;
  }

  setTiktokConnected(connected: boolean) {
    this.tiktokConnectedFlag = connected;
  }

  startRound() {
    this.roundNumber += 1;
    this.rope = { position: 0, velocity: 0 };
    this.timeRemainingSeconds = this.config.roundDurationSeconds;
    this.teamOf.clear();
    this.superForce = null;
    this.lastWinner = null;
    this.deduper.reset();
    this.rateLimiter.reset();
    this.phase = "ROUND";
    logger.info(`Round ${this.roundNumber} iniciado`);
  }

  pause() {
    if (this.phase !== "PAUSED") {
      this.phase = "PAUSED";
      logger.info("Jogo pausado");
    }
  }

  resume() {
    if (this.phase !== "PAUSED") return;
    if (this.roundNumber === 0) {
      this.startRound();
    } else {
      this.phase = "ROUND";
    }
    logger.info("Jogo retomado");
  }

  resetAll(keepHistory: boolean) {
    this.roundNumber = 0;
    this.rope = { position: 0, velocity: 0 };
    this.timeRemainingSeconds = this.config.roundDurationSeconds;
    this.teamOf.clear();
    this.superForce = null;
    this.lastWinner = null;
    this.phase = "PAUSED";
    if (!keepHistory) {
      this.score = { AZUL: 0, VERMELHO: 0, draws: 0 };
      this.roundsPlayed = 0;
    }
    this.callbacks.onPersist();
    logger.info(`Reset geral (historico ${keepHistory ? "mantido" : "zerado"})`);
  }

  getScore(): ScoreBoard {
    return this.score;
  }

  getRoundsPlayed(): number {
    return this.roundsPlayed;
  }

  /** Processa um NormalizedEvent (DEMO ou REAL) e retorna overlay opcional. */
  processEvent(event: NormalizedEvent): OverlayMessage | null {
    if (this.deduper.seen(event.eventId)) {
      return null;
    }

    if (event.type === "comment" && event.text) {
      return this.handleComment(event);
    }
    if (event.type === "gift") {
      return this.handleGift(event);
    }
    if (event.type === "like") {
      return this.handleLike(event);
    }
    return null;
  }

  private handleComment(event: NormalizedEvent): OverlayMessage | null {
    const team = parseTeamCommand(event.text ?? "");
    if (!team) return null;
    if (!this.config.commentsEnabled) {
      logger.info(`Comentario "${event.text}" de @${event.nickname} recebido (comentarios desligados: nao move a corda)`);
      return null;
    }

    if (this.phase !== "ROUND") return null;

    const decision = this.rateLimiter.check(event.userId);
    if (!decision.allowed) {
      logger.info(`Comentario de ${event.nickname} ignorado (${decision.reason})`);
      return null;
    }

    this.teamOf.set(event.userId, team);
    const signedImpulse = team === "VERMELHO" ? this.config.commentImpulse : -this.config.commentImpulse;
    this.applySignedImpulse(signedImpulse);

    return {
      id: event.eventId,
      kind: "comment",
      text: `@${event.nickname} ajudou ${team} +${this.config.commentImpulse}`,
      team,
      timestamp: Date.now()
    };
  }

  private handleGift(event: NormalizedEvent): OverlayMessage | null {
    if (!this.config.giftsEnabled || !event.giftId) return null;

    const effect = resolveGiftEffect(event.giftId, this.config.gifts, event.giftName);
    if (!effect) {
      this.recordUnknownGift(event);
      return null;
    }
    if (this.phase !== "ROUND") {
      logger.info(`Presente ${effect.label} de @${event.nickname} recebido fora do round (fase ${this.phase})`);
      return null;
    }

    // O presente define o time (Rosa -> AZUL etc.), sem depender de comentario previo.
    const team = effect.team;
    const repeat = Math.max(1, event.repeatCount || 1);
    const totalImpulse = effect.impulse * repeat;
    if (totalImpulse !== 0) {
      const signed = team === "VERMELHO" ? totalImpulse : -totalImpulse;
      this.applySignedImpulse(signed);
    }

    logger.info(`Presente: @${event.nickname} mandou ${effect.label}${repeat > 1 ? ` x${repeat}` : ""} -> ${team} (impulso ${totalImpulse})`);
    const isSuper = effect.superForceSeconds > 0;
    if (isSuper) {
      this.superForce = {
        team,
        multiplier: effect.superForceMultiplier,
        expiresAt: Date.now() + effect.superForceSeconds * 1000
      };
    }

    return {
      id: event.eventId,
      kind: isSuper ? "superforce" : "gift",
      text: `@${event.nickname} mandou ${effect.label}${repeat > 1 ? ` x${repeat}` : ""} para ${team}`,
      team,
      timestamp: Date.now()
    };
  }

  private recordUnknownGift(event: NormalizedEvent) {
    const id = event.giftId ?? "?";
    const name = event.giftName ?? "";
    const entry = this.unknownGifts.get(id) ?? {
      giftId: id,
      giftName: name,
      diamondCount: event.diamondCount ?? null,
      units: 0,
      lastSeenAt: 0
    };
    if (!entry.units) {
      logger.warn(`Presente nao mapeado: id=${id} nome="${name}". Mapeie para um time no painel admin.`);
    }
    entry.units += Math.max(1, event.repeatCount || 1);
    entry.lastSeenAt = Date.now();
    if (name) entry.giftName = name;
    this.unknownGifts.delete(id);
    this.unknownGifts.set(id, entry);
    while (this.unknownGifts.size > MAX_UNKNOWN_GIFTS) {
      this.unknownGifts.delete(this.unknownGifts.keys().next().value!);
    }
  }

  /** Presentes nao mapeados, do mais recente para o mais antigo (somem quando forem mapeados). */
  getUnknownGifts(): UnknownGift[] {
    return [...this.unknownGifts.values()]
      .filter((g) => !resolveGiftEffect(g.giftId, this.config.gifts, g.giftName))
      .reverse();
  }

  private handleLike(event: NormalizedEvent): OverlayMessage | null {
    if (!this.config.likesEnabled || this.phase !== "ROUND") return null;
    const team = this.teamOf.get(event.userId) ?? event.team;
    if (!team) return null;
    const signed = team === "VERMELHO" ? this.config.likeImpulse : -this.config.likeImpulse;
    this.applySignedImpulse(signed);
    return null;
  }

  private applySignedImpulse(signedImpulse: number) {
    const multiplier = this.superForceActiveMultiplierFor(signedImpulse);
    this.rope = applyImpulse(this.rope, signedImpulse * multiplier, {
      maxVelocity: this.config.maxVelocity,
      damping: this.config.damping,
      impulseToVelocityFactor: this.config.impulseToVelocityFactor
    });
  }

  private superForceActiveMultiplierFor(signedImpulse: number): number {
    if (!this.superForce || this.superForce.expiresAt < Date.now()) return 1;
    const favorsVermelho = signedImpulse > 0 && this.superForce.team === "VERMELHO";
    const favorsAzul = signedImpulse < 0 && this.superForce.team === "AZUL";
    return favorsVermelho || favorsAzul ? this.superForce.multiplier : 1;
  }

  /** Avanca o loop de jogo. Deve ser chamado em um intervalo fixo (ex.: 50ms). */
  tick(dtSeconds: number): OverlayMessage | null {
    const now = Date.now();
    if (this.superForce && this.superForce.expiresAt < now) {
      this.superForce = null;
    }

    if (this.phase === "ROUND") {
      this.rope = stepPhysics(this.rope, dtSeconds, {
        maxVelocity: this.config.maxVelocity,
        damping: this.config.damping,
        impulseToVelocityFactor: this.config.impulseToVelocityFactor
      });

      if (Math.abs(this.rope.position) >= LIMIT) {
        return this.endRoundByLimit();
      }

      this.timeRemainingSeconds -= dtSeconds;
      if (this.timeRemainingSeconds <= 0) {
        this.timeRemainingSeconds = 0;
        return this.endRoundByTimer();
      }
    } else if (this.phase === "VICTORY") {
      if (now >= this.phaseEndsAt) {
        this.phase = "INTERMISSION";
        this.phaseEndsAt = now + this.config.intervalSeconds * 1000;
        logger.info(`Intervalo de ${this.config.intervalSeconds}s antes do proximo round`);
      }
    } else if (this.phase === "INTERMISSION") {
      if (now >= this.phaseEndsAt) {
        this.startRound();
      }
    }
    return null;
  }

  private endRoundByLimit(): OverlayMessage {
    const winner: Team = this.rope.position <= -LIMIT ? "AZUL" : "VERMELHO";
    return this.finishRound(winner);
  }

  private endRoundByTimer(): OverlayMessage {
    if (Math.abs(this.rope.position) <= this.config.drawToleranceAbs) {
      return this.finishRound("EMPATE");
    }
    const winner: Team = this.rope.position < 0 ? "AZUL" : "VERMELHO";
    return this.finishRound(winner);
  }

  private finishRound(result: Team | "EMPATE"): OverlayMessage {
    this.lastWinner = result;
    this.roundsPlayed += 1;
    if (result === "EMPATE") {
      this.score.draws += 1;
    } else {
      this.score[result] += 1;
    }
    this.phase = "VICTORY";
    this.phaseEndsAt = Date.now() + this.config.victoryScreenSeconds * 1000;
    this.callbacks.onPersist();
    logger.info(`Round ${this.roundNumber} encerrado: ${result}`);
    return {
      id: `round-end-${this.roundNumber}-${Date.now()}`,
      kind: "round",
      text: result === "EMPATE" ? "Round terminou em EMPATE" : `Round vencido por ${result}`,
      team: result === "EMPATE" ? null : result,
      timestamp: Date.now()
    };
  }

  getSnapshot(): EngineSnapshot {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      timeRemainingSeconds: Math.max(0, Math.ceil(this.timeRemainingSeconds)),
      rope: this.rope,
      score: this.score,
      lastWinner: this.lastWinner,
      superForce: this.superForce,
      giftLegend: this.config.gifts.map((g) => ({
        label: g.label,
        giftName: g.giftName,
        icon: g.icon,
        team: g.team,
        impulse: g.impulse
      })),
      commentsEnabled: this.config.commentsEnabled,
      likesEnabled: this.config.likesEnabled,
      mode: this.config.mode,
      tiktokConnected: this.tiktokConnectedFlag,
      teamNames: this.config.teamNames,
      serverTimeMs: Date.now()
    };
  }
}
