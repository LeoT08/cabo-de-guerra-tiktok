/**
 * Evita contar o mesmo evento duas vezes. Usa eventId quando fornecido;
 * caso contrario, cai para uma janela temporal por chave sintetica.
 */
export class EventDeduper {
  private seenIds = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }

  /** Retorna true se o evento ja foi visto (deve ser ignorado). */
  seen(eventId: string, now = Date.now()): boolean {
    this.cleanup(now);
    if (this.seenIds.has(eventId)) return true;
    this.seenIds.set(eventId, now);
    return false;
  }

  private cleanup(now: number) {
    for (const [id, ts] of this.seenIds) {
      if (now - ts > this.windowMs) this.seenIds.delete(id);
    }
  }

  reset() {
    this.seenIds.clear();
  }
}
