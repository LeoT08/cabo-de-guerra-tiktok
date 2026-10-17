import { GiftEffectConfig } from "./config.js";

export interface ResolvedGiftEffect extends GiftEffectConfig {
  found: true;
}

/**
 * Resolve o efeito de um presente segundo o mapeamento configuravel no painel.
 * Casa pelo giftId OU pelo nome (sem diferenciar maiusculas), porque o ID real
 * de cada presente so e conhecido observando uma LIVE; o nome ("Rose") e estavel.
 */
export function resolveGiftEffect(
  giftId: string,
  gifts: GiftEffectConfig[],
  giftName?: string
): ResolvedGiftEffect | null {
  const name = giftName?.trim().toLowerCase();
  const match =
    gifts.find((g) => g.giftId && g.giftId === giftId) ??
    (name ? gifts.find((g) => g.giftName && g.giftName.trim().toLowerCase() === name) : undefined);
  if (!match) return null;
  return { ...match, found: true };
}
