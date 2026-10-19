# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cabo de Guerra Presidencial": a vertical 720x1600 (phone ratio ~400x900) tug-of-war game for TikTok LIVE, captured in OBS / TikTok LIVE Studio. Two teams of Brazilian public figures (Azul: Flávio Bolsonaro, Nikolas Ferreira, Michele Bolsonaro; Vermelho: Lula, Haddad, Janja) are pulled by live comments/gifts. The original spec is `PROMPT_MESTRE_CABO_DE_GUERRA_TIKTOK.md`; `README.md` tracks what is done vs. pending. Code, comments, logs and UI text are in Portuguese — keep it that way.

Hard content constraints from the spec (do not violate when editing UI/text): it is explicitly **parody/entertainment**, never a poll or election forecast — no vote-intention percentages, no official campaign logos, no quotes attributed to the people depicted. `13`/`22` are "game commands", not votes. Never fabricate users/events or claim a real LIVE connection works without a confirmed `CONNECTED` status and real events in the log.

## Commands

All commands run inside `server/` or `game/` (each has its own `package.json`/`node_modules`). `INICIAR_JOGO.bat` installs deps if missing and launches both in separate windows.

```powershell
# server/  (Node + TS, ESM)
npm run dev          # tsx watch src/index.ts → HTTP admin API :8080, game WebSocket :8081
npm run build        # tsc → dist/
npm run start        # node dist/index.js
npm test             # vitest run (server/test/)
npm run simulate     # fake LIVE: real protobuf messages through TiktokBridge -> GameEngine; must end "RESULTADO: OK"
npm run probe -- <user> [--chat] [--raw]   # connect to a real public LIVE, print/log raw gifts (data/tiktok-raw.log)
npx vitest run test/physics.test.ts      # single file
npx vitest run -t "nome do teste"         # single test by name

# game/  (Vite + TS + Phaser 3)
npm run dev          # http://localhost:5173 (strictPort) — index.html = game scene, admin.html = admin panel
npm run build        # tsc --noEmit && vite build → game/dist (two entry points: main + admin)
```

Ports are configurable via `server/.env` (`GAME_WS_PORT`, `ADMIN_HTTP_PORT`). Client overrides: `index.html?ws=ws://host:port`, `admin.html?api=http://host:port`.

There is no lint setup; type checking is the `tsc` step of each build.

`tools/` (asset preparation, not part of the game) is a third package with its own `npm install` (only `pngjs`). The `INICIAR_JOGO.bat` launcher and PowerShell snippets assume Windows; on macOS/Linux run `npm run dev` in `server/` and `game/` manually.

## Architecture

**Server is the single source of truth.** All physics, rules, rounds and win/draw decisions run in `server/`; the Phaser client is a thin renderer that never decides outcomes.

- `server/src/index.ts` wires everything: a 50ms tick loop calls `GameEngine.tick(dt)`, broadcasts a full `snapshot` over WebSocket at ~20Hz, plus `overlay` messages (event toasts) as they happen; persists every 10s and on SIGINT.
- `gameEngine.ts` — round state machine (`PAUSED → ROUND → VICTORY → INTERMISSION → ROUND…`), scoreboard, userId→team map (per round), superforce, pending gifts. `processEvent(NormalizedEvent)` is the single entry point for every input source.
- `events.ts` — `NormalizedEvent` is the common format for both DEMO (admin simulation endpoints) and REAL (TikTok) events. Any new input source must produce this shape and go through `emitEvent` in `index.ts`.
- `physics.ts` — rope position in [-100, +100] (negative = AZUL, positive = VERMELHO); impulses change velocity (clamped, damped), never position directly. Hitting ±100 ends the round immediately.
- `commandParser.ts` (exact match `13`→VERMELHO, `22`→AZUL after whitespace normalization; no substrings), `rateLimit.ts` (per-user cooldown + window cap), `dedupe.ts` (eventId + time window), `giftMap.ts` (giftId → effect from config).
- `config.ts` — `GameConfig` + `DEFAULT_CONFIG`. **The gift defines the team** (`GiftEffectConfig.team`); matched by `giftId` or `giftName` (case-insensitive). Default: only Rose (5655/"Rose") → AZUL; the VERMELHO gift is mapped from the admin panel (unmapped gifts are listed via `/api/state.unknownGifts`). `commentsEnabled` (default false) gates 13/22. `configVersion` bump makes `persistence.ts` reset `V2_RESET_FIELDS` in old saved configs.
- `httpApi.ts` — admin REST API (`/api/state`, `/api/log`, `/api/round/{start,pause,reset}`, `/api/config`, `/api/simulate/{comment,gift,load}`, `/api/tiktok/{connect,disconnect}`).
- `tiktokBridge.ts` — uses the unofficial `tiktok-live-connector` v2 (an `optionalDependency`; message shape documented in `scripts/tiktokDebug.ts`: `common.msgId`, `user.{id,nickname}`, `content`, `gift.{name,diamondCount}`). Gift combos arrive with cumulative `repeatCount` plus a final `repeatEnd` event; `giftStreak.ts` turns them into increments so the engine never double counts. Listens to public events only, never logs in; optional `TIKTOK_SIGN_API_KEY` in `.env`.
- `persistence.ts` — JSON in `server/data/state.json` (atomic temp-file + rename); chosen over SQLite to avoid native builds on Windows. `data/events.log` is the event log.

**Client (`game/`)**: `src/scenes/MainScene.ts` renders the snapshot (interpolating rope movement), `src/net/wsClient.ts` reconnects with backoff and shows "SEM CONEXÃO" instead of inventing state. `src/net/types.ts` and `src/admin/adminTypes.ts` duplicate server types by hand — keep them in sync with `server/src/gameEngine.ts`/`config.ts` when changing the snapshot or config shape. The admin panel (`admin.html`, `src/admin/`) talks to the server via HTTP polling (1.5s), not the game WebSocket, and must never be captured in OBS. Sound is synthesized with WebAudio (`src/sound.ts`).

**Assets**: `game/public/assets/characters/<slug>/` (`puxando_01..04`, `vista_01`, `retrato_01`, `vitoria_01`, `derrota_01`) and `background/brasilia_hd.png`, mapped in `src/scenes/characterAssets.ts`. They are generated from the HD originals in `../Cenarios e Personagens/` (white background) by `node tools/prepare_hd.mjs "../../Cenarios e Personagens" "../game/public/assets"` (run from `tools/`): removes the white background, crops all 4 `puxando` frames of a character with the same box (keeps the animation aligned), downscales. Per-character thresholds live in `CHARACTER_OPTS` (Michelle's white suit touches the white background: exact-white threshold + octagonal closing). Enclosed white pockets become transparent (gaps inside the rope loop / between arm and body) except those centred in `SHIRT_ZONE` — the white shirts between the lapels, which otherwise turned see-through like a chroma key; colour/shading cannot tell the two apart in this art, position can. All sprites are drawn facing right: the AZUL team (left) uses them as-is and VERMELHO (right) is mirrored with `setFlipX`. Character art is bound to fixed slots (0,1,2) per team in the same order as `DEFAULT_CONFIG.teamNames`; display names come from the snapshot. `expressao_0X.png` files are intentionally unused. Gift icons for the on-screen legend live in `game/public/assets/gifts/<slug>.png`, cut from a screenshot of the TikTok gift panel by `tools/prepare_gifts.mjs`; the slug list is `game/src/giftIcons.ts` (shared by scene and admin; `GiftEffectConfig.icon`, falling back to a guess from the gift name). The old low-res assets are kept in `assets_backup_lowres/`.

**Scene (`MainScene.ts`)**: logical size 720x1600 (`WIDTH`/`HEIGHT` exported from `MainScene.ts`, Phaser `Scale.FIT`; the "1080x1920" in `game/package.json`'s description and `tools/README.md`'s `remove_bg.mjs`-only description are stale). The rope position shown on screen is interpolated from the 20Hz snapshots (`displayPos`); the rope, the knot and both teams shift together by the same amount. Each team has its own frame timer and lean, driven by which side is gaining ground. During `VICTORY`, `celebrating` stops the per-frame layout so the win/fall tweens aren't overwritten.

`docs/OBS_SETUP.md` covers OBS capture setup and the pre-stream checklist.
