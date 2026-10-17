interface UserWindow {
  lastCommentAt: number;
  windowStart: number;
  windowCount: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  reason?: "cooldown" | "window-cap";
}

/**
 * Cooldown por usuario (ex.: 2s entre comentarios validos) + teto de eventos
 * por janela deslizante simples, para impedir spam de comandos de time.
 */
export class CommentRateLimiter {
  private users = new Map<string, UserWindow>();

  constructor(
    private cooldownSeconds: number,
    private windowSeconds: number,
    private windowMaxCount: number
  ) {}

  updateLimits(cooldownSeconds: number, windowSeconds: number, windowMaxCount: number) {
    this.cooldownSeconds = cooldownSeconds;
    this.windowSeconds = windowSeconds;
    this.windowMaxCount = windowMaxCount;
  }

  check(userId: string, now = Date.now()): RateLimitDecision {
    const entry = this.users.get(userId);
    if (!entry) {
      this.users.set(userId, { lastCommentAt: now, windowStart: now, windowCount: 1 });
      return { allowed: true };
    }

    if (now - entry.lastCommentAt < this.cooldownSeconds * 1000) {
      return { allowed: false, reason: "cooldown" };
    }

    if (now - entry.windowStart > this.windowSeconds * 1000) {
      entry.windowStart = now;
      entry.windowCount = 0;
    }

    if (entry.windowCount >= this.windowMaxCount) {
      return { allowed: false, reason: "window-cap" };
    }

    entry.lastCommentAt = now;
    entry.windowCount += 1;
    return { allowed: true };
  }

  reset() {
    this.users.clear();
  }
}
