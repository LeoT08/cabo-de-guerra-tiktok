import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { GameConfig, DEFAULT_CONFIG, CONFIG_VERSION, V2_RESET_FIELDS } from "./config.js";

export interface ScoreBoard {
  AZUL: number;
  VERMELHO: number;
  draws: number;
}

export interface PersistedState {
  config: GameConfig;
  score: ScoreBoard;
  roundsPlayed: number;
}

const dataDir = join(process.cwd(), "data");
const stateFile = join(dataDir, "state.json");
const tmpFile = join(dataDir, "state.json.tmp");

export const DEFAULT_SCORE: ScoreBoard = { AZUL: 0, VERMELHO: 0, draws: 0 };

export function defaultState(): PersistedState {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    score: { ...DEFAULT_SCORE },
    roundsPlayed: 0
  };
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await readFile(stateFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const fallback = defaultState();
    const saved: Partial<GameConfig> = { ...(parsed.config ?? {}) };
    if ((saved.configVersion ?? 1) < CONFIG_VERSION) {
      // Config antiga: presentes eram "placeholder_*" sem time e a fisica era fraca demais.
      for (const key of V2_RESET_FIELDS) delete saved[key];
      saved.configVersion = CONFIG_VERSION;
    }
    return {
      config: { ...fallback.config, ...saved },
      score: { ...fallback.score, ...(parsed.score ?? {}) },
      roundsPlayed: parsed.roundsPlayed ?? 0
    };
  } catch {
    return defaultState();
  }
}

let saveQueue: Promise<void> = Promise.resolve();

/** Escrita atomica (arquivo temporario + rename) para evitar JSON corrompido em caso de crash. */
export function saveState(state: PersistedState): Promise<void> {
  saveQueue = saveQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(tmpFile, JSON.stringify(state, null, 2), "utf-8");
    await rename(tmpFile, stateFile);
  });
  return saveQueue;
}
