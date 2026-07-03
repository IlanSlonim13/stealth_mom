# CLAUDE.md

## Project: Stealth Mom — Operation Peace & Quiet

Hyper-casual isometric stealth game with a Monument Valley-inspired look:
floating diorama plinths, curated pastel palettes per level, arched windows,
soft flat-shaded geometry. Metal Gear Solid meets suburban motherhood.
Target: Android (via Capacitor), Web.

## Setup

```bash
npm install
npm run dev          # dev server on localhost:5173
npm run build        # production build → dist/ (runs tsc + vite build)
npm run cap:sync     # sync web build to Android project
npm run cap:open     # open Android Studio
```

No tests or linting configured. TypeScript strict mode (`noEmit: true` — Vite bundles).
Level layouts self-validate at module load (see Level Builder below) — a broken
level throws immediately on boot.

## Architecture

| Layer | Tech |
|-------|------|
| Rendering | Three.js (isometric orthographic camera, flat Lambert + pastel palettes) |
| UI/Screens | React 18 + TypeScript |
| State | Zustand (`src/state/gameStore.ts`, `src/state/progressStore.ts` — persisted) |
| Audio | Howler.js (`src/engine/AudioManager.ts`, silent skip if files missing) |
| Pathfinding | A* (`src/pathfinding/Pathfinder.ts`) |
| Mobile | Capacitor 6 (`capacitor.config.ts`) |
| Build | Vite 6 with React plugin |

## Source Structure

```
src/
├── App.tsx                    — Screen router (menu | game | caught)
├── main.tsx                   — React DOM entry + touch prevention
├── engine/
│   ├── Game.ts               — Orchestrator: scene, frame loop, state machine
│   │                           (intro → play → caught | winZoom → relax),
│   │                           camera, input (tap / pinch / pan / wheel)
│   ├── SceneryBuilder.ts     — Diorama: plinth, vertex-colored floor, walls
│   │                           with camera-aware heights, arches, windows, rugs
│   ├── FurnitureFactory.ts   — Registry of ~45 furniture shape builders
│   ├── CharacterFactory.ts   — Rigs for Mom, dog, toddler, husband, cat
│   ├── NpcSystem.ts          — Patrols, lures, chases, suspicion detection
│   ├── EffectsSystem.ts      — Ripples, path dots, sparkles, confetti,
│   │                           looping emitters (hearts/steam/bubbles/notes/zzz)
│   ├── RelaxDirector.ts      — Win-scene choreography + prop registry
│   ├── helpers.ts            — mat/box/rbox/cyl/sphere, cones, discs, sprites
│   └── AudioManager.ts       — Howler pool
├── world/
│   ├── types.ts              — LevelSpec (authored) / LevelData (compiled)
│   ├── themes.ts             — 15 Monument Valley palettes (one per level)
│   ├── builder.ts            — buildLevel(): spec → tiles + validation
│   ├── dialog.ts             — All humor: thoughts, caught lines, prop quips
│   └── levels/               — index.ts (registry) + levels01to05/06to10/11to15
├── state/
│   ├── gameStore.ts          — Run state: screen, tokens, held decoy, throw mode
│   └── progressStore.ts      — Persisted stars per level (localStorage), unlocks
├── ui/
│   ├── GameView.tsx          — Owns Game instance; intro bubble, relax overlay,
│   │                           star reveal, floating feedback
│   ├── MainMenu.tsx          — Level select grid with stars/locks + Continue
│   ├── HUD.tsx               — Token pips, menu/retry, GRAB/THROW buttons
│   └── CaughtScreen.tsx      — Busted screen
├── pathfinding/Pathfinder.ts — A* on tile grid
└── utils/                    — constants (all tuning), coordinates, easing
```

## Screens / Flow

```
menu → startLevel → intro (hold close-up 1.1s + zoom-out 2.1s + speech bubble) → play
play → caught  → caught screen → retry / menu
play → goal    → winZoom (1.7s dolly to seat) → relax scene → next / menu
```

The win flow stays on `screen="game"` with `relaxActive=true`; there is no
separate win screen. Stars (= me-time tokens collected, 0–3) are written to
`progressStore` the moment the goal is reached.

## Levels (15)

Escalating mechanics: 1 move+dog · 2 tokens · 3 vision cones · 4 hiding spots ·
5 decoys · 6 cat · 7 squeaky traps · 8 dog+toddler · 9 husband+traps ·
10 two toddlers · 11 minefield+summon · 12 husband+dog+decoy ·
13 cats+toddler · 14 midnight kitchen · 15 everything at once.

### Adding a level

Write a `LevelSpec` (~60 lines, declarative) in `src/world/levels/` and add it
to `SPECS` in `levels/index.ts`. A spec declares: theme name, grid size,
`rooms` (rect perimeters become walls), extra `walls` segments, `doors`
(carved openings, rendered as arches), `windows`, furniture, rugs, start,
goal, npcs, exactly 3 tokens, optional traps/hidingSpots/decoyItems/summonNpc,
plus a `relax` config and dialog strings. `buildLevel()` computes wall tiles
and **throws at load** if the goal/tokens/hiding spots are unreachable from
start, a door isn't on a wall, a decoy source is missing, etc.

Wall render heights are automatic (camera-aware): floor behind only → tall
back wall; floor in front only → low front lip; floor both sides → mid
divider; neither → corner post.

## NPC Types (`NPC_PARAMS` in constants.ts)

- **Dog** — sound radius 4.6 tiles, sleeps (Zzz) until lured.
- **Cat** — small radius 3.1, strolls between nap spots with long pauses.
- **Toddler** — vision cone 65°, range 6.6, quick patrols (green cone).
- **Husband** — narrow cone 43°, range 8.6, slow patrols (orange cone).
- Detection is **suspicion-based**: Mom must stay exposed `SUSPICION_SECS`
  (0.35s) before a catch — a "!" pops and the cone flushes red first.
- Decoys lure their `targetNpc` to the thrown tile for `LURE_INVESTIGATE_SECS`.

## Relax / Win Scenes

Every level ends in a 3D relax scene driven by its `relax` spec:
`{ pose, prop, particles, quote, seat, face, seatHeight }`.

- Poses: `sit` (couch/chair/stool), `soak` (bathtub, legs hidden), `lounge`
  (beanbag recline). Choreography: walk → turn → settle (eased) → ambient loop
  with breathing + camera drift + dimmed key light + warm spotlight.
- Props (`RelaxDirector` registry): wine, coffee, book, bath (duck), phone,
  chocolate, headphones, teapot, package, cheese. Tapping a prop plays a use
  animation and floats a quip from `PROP_FEEDBACK` in dialog.ts.
- Particles loop from the seat: hearts/steam/bubbles/notes/zzz/sparkles.
- Level 15 additionally fires confetti.

## Themes

`src/world/themes.ts` — one palette per level (sky gradient stops, plinth,
floor pair, wall trio, rug pair, wood/fabric/metal families, accent, light
tints, Mom's outfit, HUD text color). The sky is a CSS gradient behind a
transparent WebGL canvas. The accent color marks everything interactive:
goal ring, tap ripples, tokens' glow, decoy markers.

## Key Constants (`src/utils/constants.ts`)

```
TILE_SIZE = 0.25      FLOOR_TOP = 0.06     MOM_SPEED = 6.8 (grid units/s)
WALL_TALL/MID/LIP = 0.92 / 0.38 / 0.13
SUSPICION_SECS = 0.35    LURE_INVESTIGATE_SECS = 3.2
PICKUP_RANGE = 2.6       TOKEN_RANGE = 0.85
INTRO_HOLD/ZOOM = 1.1 / 2.1s    WIN_ZOOM_SECS = 1.7
```

## Non-obvious Conventions

- **Game.ts owns all Three.js objects.** React never touches Three directly;
  it talks through `GameCallbacks` + a small public API (`pickUpItem`,
  `setThrowMode`, `getMomScreenPos`, `debugWarp`/`debugTapTile` in dev).
- **Angles:** math heading = `atan2(dz,dx)` everywhere in AI/detection;
  convert to model yaw with `headingToYaw()`. `relax.face` is a raw
  `rotation.y` yaw.
- **Furniture rot** is quarter-turns (0–3); the factory swaps the local
  footprint for odd rotations, so builders always see un-rotated `lw × lh`.
- **Materials are cached by color** (`mat()` in helpers). Anything that
  animates color/opacity must use `liveMat()` instead.
- **Input is pointer-events on the canvas** (tap/pinch/pan/wheel) handled
  inside Game — the React layer only renders overlay buttons.
- **Headless testing:** in dev, `window.__game` exposes the Game instance;
  rAF throttling makes game time run slower than wall time under headless
  Chromium — wait on `__game.state`, not timeouts.

## Audio

Drop `.mp3` files into `public/assets/audio/`; playback silently skips missing
files. Keys: footstep-soft, squeak, caught-mommy, caught-dog, caught-husband,
success (success-confetti.mp3), decoy-throw, ambient-hum, mom-sigh, token-pickup.
