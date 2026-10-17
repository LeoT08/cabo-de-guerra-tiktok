import { describe, it, expect } from "vitest";
import { EventDeduper } from "../src/dedupe.js";

describe("EventDeduper", () => {
  it("permite um eventId na primeira vez", () => {
    const deduper = new EventDeduper(60_000);
    expect(deduper.seen("evt-1", 1000)).toBe(false);
  });

  it("detecta o mesmo eventId como duplicado", () => {
    const deduper = new EventDeduper(60_000);
    deduper.seen("evt-1", 1000);
    expect(deduper.seen("evt-1", 2000)).toBe(true);
  });

  it("expira o id fora da janela temporal", () => {
    const deduper = new EventDeduper(1000);
    deduper.seen("evt-1", 0);
    expect(deduper.seen("evt-1", 5000)).toBe(false);
  });
});
