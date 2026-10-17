import { describe, it, expect } from "vitest";
import { applyImpulse, stepPhysics, LIMIT, RopePhysicsState, PhysicsParams } from "../src/physics.js";

const params: PhysicsParams = { maxVelocity: 40, damping: 0.88, impulseToVelocityFactor: 1 };

describe("physics", () => {
  it("impulso positivo move velocidade para o lado vermelho", () => {
    const state: RopePhysicsState = { position: 0, velocity: 0 };
    const next = applyImpulse(state, 10, params);
    expect(next.velocity).toBeGreaterThan(0);
  });

  it("impulso negativo move velocidade para o lado azul", () => {
    const state: RopePhysicsState = { position: 0, velocity: 0 };
    const next = applyImpulse(state, -10, params);
    expect(next.velocity).toBeLessThan(0);
  });

  it("velocidade nunca ultrapassa maxVelocity (impulso extremo)", () => {
    const state: RopePhysicsState = { position: 0, velocity: 0 };
    const next = applyImpulse(state, 999999, params);
    expect(next.velocity).toBeLessThanOrEqual(params.maxVelocity);
  });

  it("posicao nao teletransporta: avanco por passo e limitado por dt e velocidade", () => {
    let state: RopePhysicsState = { position: 0, velocity: 40 };
    const before = state.position;
    state = stepPhysics(state, 1 / 60, params);
    const delta = Math.abs(state.position - before);
    expect(delta).toBeLessThan(40 * (1 / 60) + 0.001);
  });

  it("amortecimento reduz velocidade ao longo do tempo sem novo impulso", () => {
    let state: RopePhysicsState = { position: 0, velocity: 40 };
    for (let i = 0; i < 60; i++) {
      state = stepPhysics(state, 1 / 60, params);
    }
    expect(Math.abs(state.velocity)).toBeLessThan(40);
  });

  it("posicao fica sempre dentro de [-100, 100]", () => {
    let state: RopePhysicsState = { position: 0, velocity: 40 };
    for (let i = 0; i < 1000; i++) {
      state = applyImpulse(state, 10, params);
      state = stepPhysics(state, 1 / 20, params);
      expect(state.position).toBeGreaterThanOrEqual(-LIMIT);
      expect(state.position).toBeLessThanOrEqual(LIMIT);
    }
  });
});
