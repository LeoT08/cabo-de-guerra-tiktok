const STORAGE_KEY = "cdg_muted";

let audioCtx: AudioContext | null = null;
let muted = localStorage.getItem(STORAGE_KEY) === "1";

function ctx(): AudioContext | null {
  if (muted) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** Beep sintetizado via WebAudio: evita depender de arquivos de audio externos. */
function beep(freq: number, durationMs: number, volume = 0.08, type: OscillatorType = "sine") {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(c.destination);
  const now = c.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

/** Musicas de vitoria (public/assets/sounds/, copiadas de ../Sons/). Sorteia uma das opcoes do time vencedor. */
const VICTORY_TRACKS = {
  AZUL: ["/assets/sounds/vitoria_azul_1.mp3", "/assets/sounds/vitoria_azul_2.mp3"],
  VERMELHO: ["/assets/sounds/vitoria_vermelho_1.mp3", "/assets/sounds/vitoria_vermelho_2.mp3"]
};
const MUSIC_VOLUME = 0.8;

let music: HTMLAudioElement | null = null;
let fadeTimer: number | null = null;

function stopMusicNow() {
  if (fadeTimer !== null) clearInterval(fadeTimer);
  fadeTimer = null;
  music?.pause();
  music = null;
}

function playVictoryMusic(team: "AZUL" | "VERMELHO") {
  stopMusicNow();
  if (muted) return;
  const options = VICTORY_TRACKS[team];
  const audio = new Audio(options[Math.floor(Math.random() * options.length)]);
  audio.volume = MUSIC_VOLUME;
  // Bloqueio de autoplay do navegador: abra a cena com --autoplay-policy=no-user-gesture-required (docs/OBS_SETUP.md).
  audio.play().catch((err) => console.warn("Musica de vitoria bloqueada pelo navegador:", err));
  music = audio;
}

/** Abaixa o volume ate parar (usado quando o proximo round comeca). */
function fadeOutMusic(durationMs = 1500) {
  const audio = music;
  if (!audio || fadeTimer !== null) return;
  const steps = 15;
  const delta = audio.volume / steps;
  fadeTimer = window.setInterval(() => {
    audio.volume = Math.max(0, audio.volume - delta);
    if (audio.volume <= 0.001) stopMusicNow();
  }, durationMs / steps);
}

export const sound = {
  tick: () => beep(440, 90, 0.05),
  gift: () => beep(760, 180, 0.09, "triangle"),
  superForce: () => {
    beep(520, 120, 0.1, "sawtooth");
    setTimeout(() => beep(720, 150, 0.1, "sawtooth"), 110);
  },
  victory: () => {
    beep(523, 150, 0.12);
    setTimeout(() => beep(659, 150, 0.12), 150);
    setTimeout(() => beep(784, 250, 0.12), 300);
  },
  victoryMusic: playVictoryMusic,
  fadeOutMusic,
  isMuted: () => muted,
  setMuted: (value: boolean) => {
    muted = value;
    if (muted) stopMusicNow();
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  },
  toggle: () => {
    sound.setMuted(!muted);
    return muted;
  }
};
