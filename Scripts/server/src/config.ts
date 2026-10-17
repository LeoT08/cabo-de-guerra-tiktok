import { Team } from "./events.js";

export interface GiftEffectConfig {
  /** ID do presente na plataforma (ex.: "5655"). Pode ficar vazio se o mapeamento for so pelo nome. */
  giftId: string;
  /** Nome do presente como a plataforma envia (ex.: "Rose"); casa sem diferenciar maiusculas. */
  giftName?: string;
  label: string;
  /** Icone da legenda na tela (slug de game/src/giftIcons.ts); vazio = palpite pelo nome */
  icon?: string;
  /** Time que este presente faz puxar. O presente define o time, nao o usuario. */
  team: Team;
  /** Impulso por unidade (um combo x10 aplica 10 vezes) */
  impulse: number;
  /** segundos de superforca (0 = sem efeito temporal) */
  superForceSeconds: number;
  superForceMultiplier: number;
  particles: boolean;
}

/** Versao do formato da config salva; ao subir, campos migrados sao resetados ao padrao (persistence.ts). */
export const CONFIG_VERSION = 2;

export interface GameConfig {
  configVersion: number;
  roundDurationSeconds: number;
  intervalSeconds: number;
  victoryScreenSeconds: number;
  /** Comentarios 13/22 movem a corda. Desligado: so presentes contam. */
  commentsEnabled: boolean;
  commentImpulse: number;
  commentCooldownSeconds: number;
  commentWindowSeconds: number;
  commentWindowMaxCount: number;
  likeImpulse: number;
  likesEnabled: boolean;
  giftsEnabled: boolean;
  drawToleranceAbs: number;
  maxVelocity: number;
  damping: number;
  impulseToVelocityFactor: number;
  gifts: GiftEffectConfig[];
  teamNames: {
    AZUL: { title: string; members: string[] };
    VERMELHO: { title: string; members: string[] };
  };
  soundMuted: boolean;
  tiktokUsername: string;
  mode: "DEMO" | "REAL";
}

export const DEFAULT_CONFIG: GameConfig = {
  configVersion: CONFIG_VERSION,
  roundDurationSeconds: 300,
  intervalSeconds: 15,
  victoryScreenSeconds: 12,
  // Comentar e curtir puxam de graca: jogo que so anda com presente parece "pedido de presente"
  // (Diretrizes de Monetizacao de LIVE do TikTok). Comentario vale o mesmo que 1 Rosa.
  commentsEnabled: true,
  commentImpulse: 5,
  commentCooldownSeconds: 2,
  commentWindowSeconds: 10,
  commentWindowMaxCount: 5,
  likeImpulse: 1,
  likesEnabled: true,
  giftsEnabled: true,
  drawToleranceAbs: 3,
  // Cada unidade de impulso desloca a corda ~0,55 (impulso x tau, tau = 1/(60*ln(1/damping)) s):
  // 1 Rosa (impulso 5) ~ 2,7 de 100.
  maxVelocity: 120,
  damping: 0.97,
  impulseToVelocityFactor: 1,
  gifts: [
    {
      giftId: "5655",
      giftName: "Rose",
      label: "Rosa",
      icon: "rosa",
      team: "AZUL",
      impulse: 5,
      superForceSeconds: 0,
      superForceMultiplier: 1,
      particles: true
    }
  ],
  teamNames: {
    AZUL: { title: "Time Azul", members: ["Flavio Bolsonaro", "Nikolas Ferreira", "Michele Bolsonaro"] },
    VERMELHO: { title: "Time Vermelho", members: ["Lula", "Fernando Haddad", "Janja"] }
  },
  soundMuted: false,
  tiktokUsername: "",
  mode: "DEMO"
};

/** Campos que mudaram de significado/padrao na v2 e sao resetados ao migrar uma config v1. */
export const V2_RESET_FIELDS = ["gifts", "commentsEnabled", "maxVelocity", "damping"] as const;
