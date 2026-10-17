/**
 * Combos de presente do TikTok: um combo de N rosas chega como varios eventos
 * com repeatCount ACUMULADO (1, 2, ..., N) e um evento final repetindo N com
 * repeatEnd=1. Este rastreador converte isso em incrementos (1, 1, ..., 1, 0),
 * para a corda reagir durante o combo sem contar a mesma rosa mais de uma vez.
 */
const STALE_MS = 120_000;

export class GiftStreakTracker {
  private last = new Map<string, { count: number; at: number }>();

  /** Retorna quantas unidades NOVAS este evento representa (0 = nada novo). */
  increment(key: string, repeatCount: number, repeatEnd: boolean, now = Date.now()): number {
    this.prune(now);
    const count = Math.max(1, Math.floor(repeatCount) || 1);
    const prev = this.last.get(key);
    // Contagem menor que a anterior = combo novo (o final do anterior se perdeu).
    const delta = prev && count >= prev.count ? count - prev.count : count;
    if (repeatEnd) this.last.delete(key);
    else this.last.set(key, { count, at: now });
    return delta;
  }

  private prune(now: number) {
    for (const [key, entry] of this.last) {
      if (now - entry.at > STALE_MS) this.last.delete(key);
    }
  }
}
