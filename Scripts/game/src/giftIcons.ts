/**
 * Icones dos presentes (public/assets/gifts/<slug>.png), recortados de uma captura
 * do painel de presentes do TikTok por tools/prepare_gifts.mjs. Usados na legenda
 * da cena e escolhidos por presente no painel admin (GiftEffectConfig.icon).
 */
export interface GiftIcon {
  slug: string;
  label: string;
  /** Pedacos do nome (PT/EN, minusculo, sem acento) para adivinhar o icone pelo nome do presente */
  keywords: string[];
}

export const GIFT_ICONS: GiftIcon[] = [
  { slug: "rosa_branca", label: "Rosa branca", keywords: ["white rose", "rosa branca"] },
  { slug: "rosa", label: "Rosa", keywords: ["rose", "rosa"] },
  { slug: "incrivel", label: "Incrível (gato)", keywords: ["incrivel", "awesome", "amazing"] },
  { slug: "mini_dino", label: "Mini dino", keywords: ["dino"] },
  { slug: "heart_me", label: "Heart Me", keywords: ["heart me"] },
  { slug: "capivara", label: "Capybara", keywords: ["capybara", "capivara"] },
  { slug: "coracao_dedos", label: "Coração com os dedos", keywords: ["finger heart", "dedos"] },
  { slug: "fogos", label: "Fogos de artifício", keywords: ["firework", "fogos"] },
  { slug: "palmas", label: "Palmas", keywords: ["clap", "palma", "aplauso"] },
  { slug: "buque", label: "Buquê de flores", keywords: ["bouquet", "buque", "flores"] },
  { slug: "chapeu", label: "Chapéu e bigode", keywords: ["hat", "chapeu", "mustache", "bigode"] },
  { slug: "coracao", label: "Coração", keywords: ["heart", "coracao"] }
];

export const giftIconUrl = (slug: string) => `/assets/gifts/${slug}.png`;

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Icone explicito do presente, ou palpite pelo nome/rotulo; null se nenhum bater. */
export function resolveGiftIcon(icon: string | undefined, ...names: (string | undefined)[]): string | null {
  if (icon && GIFT_ICONS.some((g) => g.slug === icon)) return icon;
  for (const raw of names) {
    if (!raw) continue;
    const name = normalize(raw);
    // Ordem da lista importa: "white rose" antes de "rose", "heart me"/"finger heart" antes de "heart".
    const hit = GIFT_ICONS.find((g) => g.keywords.some((k) => name.includes(k)));
    if (hit) return hit.slug;
  }
  return null;
}
