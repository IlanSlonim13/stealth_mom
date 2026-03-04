# CLAUDE.md

## Project: Stealth Mom — Operation Peace & Quiet

Hyper-casual isometric stealth game. Metal Gear Solid meets suburban motherhood.
Target: Android (via Capacitor), Web.

## Setup

```bash
npm install
npm run dev          # dev server on localhost:5173
npm run build        # production build → dist/
npm run cap:sync     # sync web build to Android project
npm run cap:open     # open Android Studio
```

Capacitor Android setup (first time):
```bash
npx cap add android
npm run build
npm run cap:sync
```

## Architecture

| Layer | Tech |
|-------|------|
| Rendering | Three.js (isometric orthographic, toon shading) |
| UI/Screens | React 18 + TypeScript |
| State | Zustand (`src/state/gameStore.ts`) |
| Audio | Howler.js (`src/engine/AudioManager.ts`) |
| Mobile | Capacitor (`capacitor.config.ts`) |
| Build | Vite |

## Key Files

- `src/engine/Game.ts` — main game class (Three.js scene + game loop)
- `src/world/levels.ts` — all 5 level definitions
- `src/world/LevelTypes.ts` — TypeScript types + color PALETTES
- `src/state/gameStore.ts` — Zustand store (screen routing, decoy state)
- `src/App.tsx` — screen router (menu → intro → game → caught/win)
- `src/ui/GameView.tsx` — React wrapper that owns the Game instance

## Screens / Flow

```
menu → (startLevel) → intro (2.2s) → game
game → (caught) → caught screen → retry / menu
game → (won)    → win screen    → next level / menu
```

## Game Mechanics

- Tap tiles to move Mom along A* path
- Dog: avoid sound radius (pulsing red circle)
- Toddler: avoid vision cone (green triangle, patrolling)
- Husband: avoid vision cone (orange triangle) — distract with decoy key throw
- Squeaky toys (level 4): trigger on step → caught
- Hiding spots (level 2): entering one makes Mom invisible to vision cones

## Adding Audio

Drop `.mp3` files into `public/assets/audio/`. See `public/assets/audio/README.md` for filenames.
`AudioManager.play("key")` silently skips if file not present.

## Non-obvious Conventions

- `Game.ts` owns all Three.js objects. React never touches Three directly.
- `Game.handleTap()` returns `true` when a decoy was thrown (so `GameView` can call `useDecoy()`).
- Detection delays (caught/won) are applied inside `Game.ts` via `setTimeout` before invoking callbacks — do not add extra delays in React.
- All NPC meshes are stored in `npcs[]` array in `Game.ts`, updated each frame in `updateNpcs()`.
