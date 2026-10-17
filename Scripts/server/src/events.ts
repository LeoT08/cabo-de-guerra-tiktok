export type Team = "AZUL" | "VERMELHO";

export type NormalizedEventType =
  | "comment"
  | "gift"
  | "like"
  | "connection"
  | "system";

/**
 * Formato interno normalizado exigido pelo prompt mestre, usado tanto pelo
 * modo DEMO (simulação via painel) quanto pela ponte real do TikTok LIVE.
 */
export interface NormalizedEvent {
  eventId: string;
  type: NormalizedEventType;
  userId: string;
  nickname: string;
  team: Team | null;
  giftId: string | null;
  repeatCount: number;
  timestamp: number;
  /** Comentário original (apenas para type === "comment") */
  text?: string;
  /** Nome do presente como veio da plataforma (ex.: "Rose"); casa com GiftEffectConfig.giftName */
  giftName?: string;
  /** Valor unitario do presente em diamantes, quando a plataforma informa */
  diamondCount?: number;
}

export type OverlayKind = "comment" | "gift" | "superforce" | "round";

export interface OverlayMessage {
  id: string;
  kind: OverlayKind;
  text: string;
  team: Team | null;
  timestamp: number;
}
