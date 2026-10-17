export interface CharacterAsset {
  slug: string;
  displayName: string;
  pulling: string[];
  idle: string[];
  portrait: string;
  victory: string;
  defeat: string;
}

function build(slug: string, displayName: string): CharacterAsset {
  const base = `/assets/characters/${slug}`;
  return {
    slug,
    displayName,
    pulling: [1, 2, 3, 4].map((n) => `${base}/puxando_0${n}.png`),
    // So vista_01: as variantes 02-04 vem com o braco desenhado separado do
    // corpo na prancha original (nao e defeito do recorte de fundo) e nao
    // sao usadas em lugar nenhum do jogo.
    idle: [`${base}/vista_01.png`],
    portrait: `${base}/retrato_01.png`,
    victory: `${base}/vitoria_01.png`,
    defeat: `${base}/derrota_01.png`
  };
}

/**
 * Slots fixos (0,1,2) por time, na mesma ordem dos membros padrao do servidor
 * (server/src/config.ts). Os nomes exibidos no jogo vêm do snapshot (editáveis
 * no painel admin); os retratos ficam presos ao slot, não ao texto do nome.
 */
export const AZUL_CHARACTERS: CharacterAsset[] = [
  build("flavio", "Flavio Bolsonaro"),
  build("nikolas", "Nikolas Ferreira"),
  build("michelle", "Michele Bolsonaro")
];

export const VERMELHO_CHARACTERS: CharacterAsset[] = [
  build("lula", "Lula"),
  build("haddad", "Fernando Haddad"),
  build("janja", "Janja")
];

export const BACKGROUND_IMAGE = "/assets/background/brasilia_hd.png";

export type StageTier = "back" | "mid" | "front";

export interface StageSlot {
  asset: CharacterAsset;
  tier: StageTier;
}

/**
 * Arranjo de palco (profundidade/ordem), separado da ordem de exibicao no
 * cabecalho. Homens ficam nas posicoes centrais/frente (mais perto da corda,
 * desenhados por cima); mulheres ficam nas posicoes externas/fundo (mais
 * longe da corda, desenhadas por baixo, levemente menores).
 */
export const AZUL_STAGE: StageSlot[] = [
  { asset: AZUL_CHARACTERS[2], tier: "back" }, // Michele - fundo (externa)
  { asset: AZUL_CHARACTERS[1], tier: "mid" }, // Nikolas - meio
  { asset: AZUL_CHARACTERS[0], tier: "front" } // Flavio - frente, mais perto da corda
];

export const VERMELHO_STAGE: StageSlot[] = [
  { asset: VERMELHO_CHARACTERS[0], tier: "front" }, // Lula - frente, mais perto da corda
  { asset: VERMELHO_CHARACTERS[1], tier: "mid" }, // Haddad - meio
  { asset: VERMELHO_CHARACTERS[2], tier: "back" } // Janja - fundo (externa)
];
