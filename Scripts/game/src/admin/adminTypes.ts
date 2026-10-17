export type Team = "AZUL" | "VERMELHO";

export interface GiftEffectConfig {
  giftId: string;
  giftName?: string;
  label: string;
  icon?: string;
  team: Team;
  impulse: number;
  superForceSeconds: number;
  superForceMultiplier: number;
  particles: boolean;
}

export interface GameConfig {
  configVersion: number;
  roundDurationSeconds: number;
  commentsEnabled: boolean;
  intervalSeconds: number;
  victoryScreenSeconds: number;
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

export interface ApiStateResponse {
  snapshot: {
    phase: string;
    roundNumber: number;
    timeRemainingSeconds: number;
    rope: { position: number; velocity: number };
    score: { AZUL: number; VERMELHO: number; draws: number };
    lastWinner: string | null;
    mode: "DEMO" | "REAL";
    tiktokConnected: boolean;
  };
  config: GameConfig;
  score: { AZUL: number; VERMELHO: number; draws: number };
  roundsPlayed: number;
  unknownGifts: UnknownGift[];
  tiktokStatus: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  log: { timestamp: number; level: string; message: string }[];
}

export interface UnknownGift {
  giftId: string;
  giftName: string;
  diamondCount: number | null;
  units: number;
  lastSeenAt: number;
}
