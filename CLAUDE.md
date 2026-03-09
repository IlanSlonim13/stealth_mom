# CLAUDE.md

## Project: Stealth Mom — Operation Peace & Quiet

Hyper-casual isometric stealth game. Metal Gear Solid meets suburban motherhood.
Target: Android (via Capacitor), Web.

## Setup

```bash
npm install
npm run dev          # dev server on localhost:5173
npm run build        # production build → dist/ (runs tsc + vite build)
npm run cap:sync     # sync web build to Android project
npm run cap:open     # open Android Studio
```

Capacitor Android setup (first time):
```bash
npx cap add android
npm run build
npm run cap:sync
```

No tests, linting, or formatting configured. TypeScript strict mode is enabled (`noEmit: true` — Vite handles bundling).

## Architecture

| Layer | Tech |
|-------|------|
| Rendering | Three.js (isometric orthographic camera, toon shading) |
| UI/Screens | React 18 + TypeScript |
| State | Zustand (`src/state/gameStore.ts`, `src/state/progressStore.ts`) |
| Audio | Howler.js (`src/engine/AudioManager.ts`) |
| Pathfinding | A* (`src/pathfinding/Pathfinder.ts`) |
| Mobile | Capacitor 6 (`capacitor.config.ts`) |
| Build | Vite 6 with React plugin |

## Source Structure

```
src/
├── App.tsx                    — Screen router (menu|game|caught screens)
├── main.tsx                   — React DOM entry + touch prevention
├── engine/
│   ├── Game.ts               — Main game class (~4500 lines): Three.js scene,
│   │                           game loop, NPC AI, furniture building, relax scene
│   └── AudioManager.ts        — Howler.js audio pool (silent skip if files missing)
├── state/
│   ├── gameStore.ts          — Zustand: screen routing, decoy/inventory state
│   └── progressStore.ts      — Zustand: completed levels, adFree flag
├── ui/
│   ├── GameView.tsx          — React wrapper owning Game instance + overlays
│   ├── MainMenu.tsx          — Level select with NPC icons
│   ├── HUD.tsx               — Action buttons (GRAB, THROW)
│   ├── CaughtScreen.tsx      — Busted screen with shake animation
│   └── LevelComplete.tsx     — Win screen with confetti
├── world/
│   ├── LevelTypes.ts         — All TS interfaces, FurnitureShape union, PALETTES, MOM_OUTFITS
│   ├── levels.ts             — LEVELS array (5 levels with all grid/furniture/NPC data)
│   ├── introData.ts          — INTRO_QUOTES per level
│   ├── relaxData.ts          — RELAX_DATA per level (3D scene for L1, emoji overlay L2-5)
│   └── tutorialData.ts       — LEVEL1_TUTORIAL cards (currently disabled)
├── pathfinding/
│   └── Pathfinder.ts         — A* on tile grid
└── utils/
    ├── constants.ts          — Game tuning (speeds, ranges, delays, radii)
    ├── coordinates.ts        — dist2d, pointInCone, gridToWorld
    ├── easing.ts             — easeOutQuad, easeInOutQuad, lerp
    └── humor.ts              — randomTagline, pickRandom
```

## Screens / Flow

```
menu → (startLevel) → intro (2.2s zoom + speech bubble) → game
game → (caught) → caught screen → retry / menu
game → (won)    → relax zoom → relax scene → next level / menu
```

The win flow does NOT go through a "win" screen — it stays on `screen="game"` with `relaxActive=true` overlay until user clicks Next/Menu.

## Levels

| ID | Name | Scene | Grid | NPCs | Traps | Decoys | Special |
|----|------|-------|------|------|-------|--------|---------|
| 1 | The Couch | livingRoom | 40×36 | Dog | — | TV Remote→dog | 3D relax scene (wine/cheese) |
| 2 | The Bubble Bath | hallway | 48×36 | Toddler | — | Stuffed Bear→toddler | 4 hiding spots |
| 3 | The Decoy | kitchen | 48×40 | Husband | — | Car Keys→husband | — |
| 4 | The Minefield | playroom | 48×40 | (summoned) | 10 squeaky toys | Juice Box→toddler | Toddler spawns on trap |
| 5 | The Delivery | frontDoor | 56×48 | Dog+Toddler+Husband | 2 toys | Remote+Beer→husband | Final level, 2 decoys |

## NPC Types

- **Dog:** Circular sound radius (default 8.8 tiles). Pulsing red circle visualization.
- **Toddler:** Vision cone (60° angle, range 14). Green triangle. Patrols waypoints at 4.8 u/s.
- **Husband:** Vision cone (40° angle, range 16). Orange triangle. Slower (2.8 u/s). Has thought bubble.
- All NPCs can be lured by matching decoy items for 3 seconds.

## Game Mechanics

- Tap tiles to move Mom along A* path (speed: 11.2 grid units/sec)
- Dog: avoid sound radius (pulsing red circle)
- Toddler: avoid vision cone (green triangle, patrolling)
- Husband: avoid vision cone (orange triangle) — distract with decoy throw
- Squeaky toys (level 4): trigger on step → caught
- Hiding spots (level 2): entering one makes Mom invisible to vision cones
- Decoys: pick up from glowing furniture → throw to lure target NPC

## Relax / Win Scene

Two modes controlled by `RELAX_DATA[levelId].sceneMode`:

- **"3d"** (Level 1): `Game.enterRelaxScene()` builds interactive 3D scene. Mom walks to couch via 7-phase sit animation. Clickable items: wine glass (sip animation + "Momma needed her bottle"), cheese (eat animation + "That's some Goud-a cheese!"), TV (flash). Wine bottle sits next to glass on side table.
- **"overlay"** (Levels 2-5): Semi-transparent emoji grid overlay. Click emojis for feedback text.

Timing: momQuote appears 200ms after relax starts; Next button after 6s (`RELAX_BUTTON_DELAY_MS`).

## Furniture System

Furniture defined in `levels.ts` as `{ x, z, w, h, label, col, shape, rot? }`:
- `x, z`: top-left grid tile. `w, h`: tile dimensions.
- `shape`: one of 44+ FurnitureShape values (see `LevelTypes.ts`).
- `rot`: optional rotation in radians (`g.rotation.y = f.rot`).
- `label`: used by `enterRelaxScene()` to find couch/coffeeTable/tv/sideTable.
- Furniture blocks tiles (lines 216-221 in Game.ts), except `shape === "door"`.
- All furniture meshes stored in `furnitureGroups[]` with `userData.label`.

Built via `buildFurnitureShape()` — a large switch/case in Game.ts. To add a new shape:
1. Add the name to the `FurnitureShape` union in `LevelTypes.ts`
2. Add a `case` in `buildFurnitureShape()` in `Game.ts`
3. Reference it in a level's furniture array in `levels.ts`

## Audio

Drop `.mp3` files into `public/assets/audio/`. `AudioManager.play("key")` silently skips if file not present.

Sound keys: `footstep-soft`, `squeak`, `caught-mommy`, `caught-dog`, `caught-husband`, `success` (→ success-confetti.mp3), `decoy-throw`, `ambient-hum`, `mom-sigh`.

## Key Constants (`src/utils/constants.ts`)

```
TILE_SIZE = 0.25     TILE_H = 0.15        SNEAK_SPEED = 11.2
DOG_SOUND_RADIUS = 8.8
TODDLER_CONE_RANGE/ANGLE/SPEED = 14.0 / π/3 / 4.8
HUSBAND_CONE_RANGE/ANGLE/SPEED = 16.0 / π/4.5 / 2.8
CAUGHT_DELAY_MS = 500    INTRO_ZOOM_SECS = 2.0
PICKUP_RANGE = 5.6       RELAX_BUTTON_DELAY_MS = 6000
```

## Non-obvious Conventions

- **Game.ts owns all Three.js objects.** React never touches Three directly.
- **`Game.handleTap()`** returns `"thrown"` when a decoy was thrown (so `GameView` can call `throwDecoy()`).
- **Detection delays** (caught/won) are applied inside `Game.ts` via `setTimeout` before invoking callbacks — do not add extra delays in React.
- **All NPC meshes** stored in `npcs[]` array in `Game.ts`, updated each frame in `updateNpcs()`.
- **Intro speech bubble** uses `getMomScreenPos()` which projects mom's base position then offsets 80px up in screen-space (avoids isometric horizontal shift from world-space Y offset).
- **Furniture group positions** are computed as center of the tile footprint: `centerX = (f.x + f.w/2 - 0.5 - cx) * TILE_SIZE`.
- **`cx`/`cz`** = grid center (`W/2 - 0.5`, `H/2 - 0.5`), used to center the world at origin.
- **Relax click detection** uses raycasting with invisible hitbox spheres (opacity=0, depthWrite=false) for small objects like wine glasses.
- **Dog thought bubble** contains a canvas-drawn bone sprite with `depthTest: false` and `renderOrder: 1` to render on top of the bubble sphere.
