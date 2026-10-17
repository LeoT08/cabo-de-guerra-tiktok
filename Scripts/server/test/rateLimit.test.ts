import { describe, it, expect } from "vitest";
import { CommentRateLimiter } from "../src/rateLimit.js";

describe("CommentRateLimiter", () => {
  it("permite o primeiro comentario de um usuario", () => {
    const limiter = new CommentRateLimiter(2, 10, 5);
    const result = limiter.check("user1", 1000);
    expect(result.allowed).toBe(true);
  });

  it("bloqueia comentario do mesmo usuario dentro do cooldown", () => {
    const limiter = new CommentRateLimiter(2, 10, 5);
    limiter.check("user1", 1000);
    const result = limiter.check("user1", 1500);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("cooldown");
  });

  it("permite novamente apos o cooldown passar", () => {
    const limiter = new CommentRateLimiter(2, 10, 5);
    limiter.check("user1", 1000);
    const result = limiter.check("user1", 3200);
    expect(result.allowed).toBe(true);
  });

  it("aplica teto por janela mesmo respeitando cooldown", () => {
    const limiter = new CommentRateLimiter(1, 5, 2);
    expect(limiter.check("user1", 0).allowed).toBe(true);
    expect(limiter.check("user1", 1100).allowed).toBe(true);
    const third = limiter.check("user1", 2200);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("window-cap");
  });

  it("usuarios diferentes nao interferem entre si", () => {
    const limiter = new CommentRateLimiter(2, 10, 5);
    limiter.check("user1", 1000);
    const result = limiter.check("user2", 1000);
    expect(result.allowed).toBe(true);
  });
});
