export interface RopePhysicsState {
  /** posicao normalizada [-100, +100]; -100 = vitoria azul, +100 = vitoria vermelho */
  position: number;
  velocity: number;
}

export interface PhysicsParams {
  maxVelocity: number;
  damping: number;
  impulseToVelocityFactor: number;
}

export const LIMIT = 100;

/** Impulso positivo favorece VERMELHO (+), negativo favorece AZUL (-). */
export function applyImpulse(
  state: RopePhysicsState,
  signedImpulse: number,
  params: PhysicsParams
): RopePhysicsState {
  const nextVelocity = clamp(
    state.velocity + signedImpulse * params.impulseToVelocityFactor,
    -params.maxVelocity,
    params.maxVelocity
  );
  return { position: state.position, velocity: nextVelocity };
}

/** Avanca a simulacao em dtSeconds: aplica amortecimento e integra posicao, sem teletransporte. */
export function stepPhysics(
  state: RopePhysicsState,
  dtSeconds: number,
  params: PhysicsParams
): RopePhysicsState {
  const dampedVelocity = state.velocity * Math.pow(params.damping, dtSeconds * 60);
  const nextPositionRaw = state.position + dampedVelocity * dtSeconds;
  const nextPosition = clamp(nextPositionRaw, -LIMIT, LIMIT);
  // Se bateu no limite, zera velocidade residual (evita "vibrar" no muro).
  const hitLimit = Math.abs(nextPosition) >= LIMIT;
  return {
    position: nextPosition,
    velocity: hitLimit ? 0 : dampedVelocity
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
