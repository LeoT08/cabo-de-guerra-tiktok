import { Team } from "./events.js";

/**
 * Identifica comandos EXATOS de jogo "13" (Vermelho) e "22" (Azul).
 * Nao sao votos eleitorais, apenas comandos de interacao no jogo.
 * Precisa ser match exato apos trim/normalizacao de espacos internos,
 * nunca substring (ex: "113", "130" ou "22h" nao contam).
 */
export function parseTeamCommand(rawComment: string): Team | null {
  const normalized = rawComment.trim().replace(/\s+/g, "");
  if (normalized === "13") return "VERMELHO";
  if (normalized === "22") return "AZUL";
  return null;
}
