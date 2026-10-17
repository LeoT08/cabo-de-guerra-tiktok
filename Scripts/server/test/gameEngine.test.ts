import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/gameEngine.js";
import { DEFAULT_CONFIG, GameConfig } from "../src/config.js";
import { ScoreBoard } from "../src/persistence.js";
import { NormalizedEvent } from "../src/events.js";

function makeEngine(overrides: Partial<GameConfig> = {}) {
  const config: GameConfig = structuredClone(DEFAULT_CONFIG);
  // Os testes de comando/rounds usam comentarios; a regra de producao (so presentes) e testada a parte.
  config.commentsEnabled = true;
  Object.assign(config, overrides);
  const score: ScoreBoard = { AZUL: 0, VERMELHO: 0, draws: 0 };
  const engine = new GameEngine(config, score, 0, { onPersist: () => {} });
  engine.startRound();
  return engine;
}

function commentEvent(text: string, userId: string, eventId = `evt-${Math.random()}`): NormalizedEvent {
  return {
    eventId,
    type: "comment",
    userId,
    nickname: userId,
    team: null,
    giftId: null,
    repeatCount: 1,
    timestamp: Date.now(),
    text
  };
}

function giftEvent(giftId: string, userId: string, extra: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: `evt-${Math.random()}`,
    type: "gift",
    userId,
    nickname: userId,
    team: null,
    giftId,
    repeatCount: 1,
    timestamp: Date.now(),
    ...extra
  };
}

describe("GameEngine - comandos movem a corda", () => {
  it("13 empurra a corda para o lado VERMELHO (positivo)", () => {
    const engine = makeEngine();
    engine.processEvent(commentEvent("13", "u1"));
    for (let i = 0; i < 10; i++) engine.tick(0.1);
    expect(engine.getSnapshot().rope.position).toBeGreaterThan(0);
  });

  it("22 empurra a corda para o lado AZUL (negativo)", () => {
    const engine = makeEngine();
    engine.processEvent(commentEvent("22", "u1"));
    for (let i = 0; i < 10; i++) engine.tick(0.1);
    expect(engine.getSnapshot().rope.position).toBeLessThan(0);
  });
});

describe("GameEngine - comentarios invalidos e spam", () => {
  it("comentario sem relacao nao gera impulso", () => {
    const engine = makeEngine();
    engine.processEvent(commentEvent("boa noite", "u1"));
    engine.tick(0.1);
    expect(engine.getSnapshot().rope.position).toBe(0);
    expect(engine.getSnapshot().rope.velocity).toBe(0);
  });

  it("spam do mesmo usuario em cooldown nao soma impulso duplicado", () => {
    const engine = makeEngine({ commentCooldownSeconds: 2 });
    engine.processEvent(commentEvent("13", "spammer", "e1"));
    const afterFirst = engine.getSnapshot().rope.velocity;
    engine.processEvent(commentEvent("13", "spammer", "e2"));
    const afterSecond = engine.getSnapshot().rope.velocity;
    expect(afterSecond).toBe(afterFirst);
  });

  it("eventId duplicado nao conta duas vezes", () => {
    const engine = makeEngine();
    engine.processEvent(commentEvent("13", "u1", "dup-1"));
    const after1 = engine.getSnapshot().rope.velocity;
    engine.processEvent(commentEvent("13", "u1", "dup-1"));
    const after2 = engine.getSnapshot().rope.velocity;
    expect(after2).toBe(after1);
  });
});

describe("GameEngine - vitoria por limite, por tempo e empate", () => {
  it("atinge o limite e termina o round imediatamente com vitoria", () => {
    const engine = makeEngine({ maxVelocity: 1000, commentImpulse: 1000, damping: 1 });
    engine.processEvent(commentEvent("13", "u1"));
    let overlay = null;
    for (let i = 0; i < 20 && !overlay; i++) {
      overlay = engine.tick(0.5);
    }
    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("VICTORY");
    expect(snapshot.lastWinner).toBe("VERMELHO");
    expect(snapshot.score.VERMELHO).toBe(1);
  });

  it("termina por cronometro com vantagem de um lado", () => {
    const engine = makeEngine({
      roundDurationSeconds: 1,
      drawToleranceAbs: 1,
      commentImpulse: 2,
      maxVelocity: 5,
      damping: 0.99
    });
    engine.processEvent(commentEvent("13", "u1"));
    engine.tick(0.1);
    const overlay = engine.tick(2);
    expect(overlay).not.toBeNull();
    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("VICTORY");
    expect(["VERMELHO", "AZUL"]).toContain(snapshot.lastWinner);
  });

  it("termina em empate quando nao ha movimento (sem publico)", () => {
    const engine = makeEngine({ roundDurationSeconds: 1 });
    const overlay = engine.tick(2);
    expect(overlay).not.toBeNull();
    const snapshot = engine.getSnapshot();
    expect(snapshot.lastWinner).toBe("EMPATE");
    expect(snapshot.score.draws).toBe(1);
  });
});

describe("GameEngine - reinicio automatico e placar persistente", () => {
  it("reinicia sozinho apos a tela de vitoria/intervalo e mantem o placar", () => {
    const engine = makeEngine({ roundDurationSeconds: 1, victoryScreenSeconds: 0, intervalSeconds: 0 });
    engine.tick(2);
    expect(engine.getSnapshot().phase).toBe("VICTORY");
    expect(engine.getSnapshot().score.draws).toBe(1);

    engine.tick(0.01);
    expect(engine.getSnapshot().phase).toBe("INTERMISSION");

    engine.tick(0.01);
    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("ROUND");
    expect(snapshot.roundNumber).toBe(2);
    expect(snapshot.score.draws).toBe(1);
  });
});

describe("GameEngine - presente define o time", () => {
  const coqueiro = { ...DEFAULT_CONFIG.gifts[0], giftId: "8888", giftName: "Coqueiro", label: "Coqueiro", team: "VERMELHO" as const };

  it("Rosa puxa AZUL sem o usuario ter comentado antes", () => {
    const engine = makeEngine({ commentsEnabled: false });
    const overlay = engine.processEvent(giftEvent("5655", "novo"));
    expect(overlay?.kind).toBe("gift");
    expect(overlay?.team).toBe("AZUL");
    expect(engine.getSnapshot().rope.velocity).toBeLessThan(0);
  });

  it("presente mapeado para VERMELHO puxa VERMELHO", () => {
    const engine = makeEngine({ gifts: [...DEFAULT_CONFIG.gifts, coqueiro] });
    engine.processEvent(giftEvent("8888", "u2"));
    expect(engine.getSnapshot().rope.velocity).toBeGreaterThan(0);
  });

  it("casa pelo nome quando o id nao bate", () => {
    const engine = makeEngine();
    engine.processEvent(giftEvent("123456", "u3", { giftName: "rose" }));
    expect(engine.getSnapshot().rope.velocity).toBeLessThan(0);
  });

  it("repeatCount multiplica o impulso", () => {
    const one = makeEngine({ maxVelocity: 1e6 });
    const three = makeEngine({ maxVelocity: 1e6 });
    one.processEvent(giftEvent("5655", "u"));
    three.processEvent(giftEvent("5655", "u", { repeatCount: 3 }));
    expect(three.getSnapshot().rope.velocity).toBeCloseTo(one.getSnapshot().rope.velocity * 3);
  });

  it("comentario 22 nao move a corda com commentsEnabled=false", () => {
    const engine = makeEngine({ commentsEnabled: false });
    engine.processEvent(commentEvent("22", "u1"));
    expect(engine.getSnapshot().rope.velocity).toBe(0);
  });

  it("presente nao mapeado nao move a corda e vai para a lista do painel", () => {
    const engine = makeEngine();
    engine.processEvent(giftEvent("7777", "u1", { giftName: "Galaxy", diamondCount: 1000, repeatCount: 2 }));
    engine.processEvent(giftEvent("7777", "u2", { giftName: "Galaxy" }));
    expect(engine.getSnapshot().rope.velocity).toBe(0);
    expect(engine.getUnknownGifts()).toEqual([
      expect.objectContaining({ giftId: "7777", giftName: "Galaxy", diamondCount: 1000, units: 3 })
    ]);
    engine.updateConfig({ gifts: [...DEFAULT_CONFIG.gifts, { ...coqueiro, giftId: "7777", giftName: "Galaxy" }] });
    expect(engine.getUnknownGifts()).toEqual([]);
  });
});
