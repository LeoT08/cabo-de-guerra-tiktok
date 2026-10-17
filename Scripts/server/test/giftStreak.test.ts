import { describe, it, expect } from "vitest";
import { GiftStreakTracker } from "../src/giftStreak.js";

describe("GiftStreakTracker - combos do TikTok", () => {
  it("combo 1..5 + evento final conta 5, nao 15 nem 20", () => {
    const t = new GiftStreakTracker();
    const deltas = [1, 2, 3, 4, 5].map((n) => t.increment("k", n, false));
    deltas.push(t.increment("k", 5, true));
    expect(deltas).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it("combo que pula contagens soma a diferenca", () => {
    const t = new GiftStreakTracker();
    expect([t.increment("k", 1, false), t.increment("k", 4, false), t.increment("k", 10, true)]).toEqual([1, 3, 6]);
  });

  it("presente sem combo (so evento final) conta repeatCount", () => {
    const t = new GiftStreakTracker();
    expect(t.increment("k", 1, true)).toBe(1);
    expect(t.increment("k", 1, true)).toBe(1);
  });

  it("combo novo apos o anterior terminar comeca do zero", () => {
    const t = new GiftStreakTracker();
    t.increment("k", 3, false);
    t.increment("k", 3, true);
    expect(t.increment("k", 1, false)).toBe(1);
  });

  it("contagem menor que a anterior (final perdido) e tratada como combo novo", () => {
    const t = new GiftStreakTracker();
    t.increment("k", 7, false);
    expect(t.increment("k", 2, false)).toBe(2);
  });

  it("chaves diferentes nao se misturam", () => {
    const t = new GiftStreakTracker();
    t.increment("a", 5, false);
    expect(t.increment("b", 5, false)).toBe(5);
  });
});
