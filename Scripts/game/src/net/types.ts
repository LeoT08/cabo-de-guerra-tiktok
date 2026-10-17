export type Team = "AZUL" | "VERMELHO";
export type RoundPhase = "ROUND" | "VICTORY" | "INTERMISSION" | "PAUSED";

export interface RopePhysicsState {
  position: number;
  velocity: number;
}

export interface SuperForceState {
  team: Team;
  expiresAt: number;
  multiplier: number;
}

export interface TeamNamesConfig {
  AZUL: { title: string; members: string[] };
  VERMELHO: { title: string; members: string[] };
}

export interface ScoreBoard {
  AZUL: number;
  VERMELHO: number;
  draws: number;
}

export interface EngineSnapshot {
  phase: RoundPhase;
  roundNumber: number;
  timeRemainingSeconds: number;
  rope: RopePhysicsState;
  score: ScoreBoard;
  lastWinner: Team | "EMPATE" | null;
  superForce: SuperForceState | null;
  giftLegend: { label: string; giftName?: string; icon?: string; team: Team; impulse: number }[];
  commentsEnabled: boolean;
  likesEnabled: boolean;
  mode: "DEMO" | "REAL";
  tiktokConnected: boolean;
  teamNames: TeamNamesConfig;
  serverTimeMs: number;
}

export interface OverlayMessage {
  id: string;
  kind: "comment" | "gift" | "superforce" | "round";
  text: string;
  team: Team | null;
  timestamp: number;
}

export type InboundMessage =
  | { kind: "snapshot"; data: EngineSnapshot }
  | { kind: "overlay"; data: OverlayMessage };
