// ── World scale ──────────────────────────────────────────────────────────────
export const TILE_SIZE = 0.25;   // world units per grid tile
export const FLOOR_TOP = 0.06;   // floor slab height (y of walkable surface)

export const WALL_TALL = 0.92;   // back walls (away from camera)
export const WALL_MID  = 0.38;   // interior dividers
export const WALL_LIP  = 0.13;   // front rim walls (toward camera)

// ── Movement ─────────────────────────────────────────────────────────────────
export const MOM_SPEED = 6.8;    // grid units / sec

// ── NPC tuning (per type) ────────────────────────────────────────────────────
export const NPC_PARAMS = {
  dog:     { radius: 4.6, speed: 3.0 },
  cat:     { radius: 3.1, speed: 1.4 },
  toddler: { range: 6.6, angle: Math.PI * 0.36, speed: 2.3 },
  husband: { range: 8.6, angle: Math.PI * 0.24, speed: 1.7 },
} as const;

/** Continuous exposure needed before an NPC actually catches Mom. */
export const SUSPICION_SECS = 0.35;
export const SUSPICION_DECAY = 2.5; // how fast suspicion drains when hidden again

export const LURE_INVESTIGATE_SECS = 3.2;
export const LURE_SPEED_MULT = 1.7;
export const SUMMON_CHASE_SPEED = 3.4;

// ── Interactions ─────────────────────────────────────────────────────────────
export const PICKUP_RANGE = 2.6;   // grid units to grab a decoy
export const TOKEN_RANGE = 0.85;   // grid units to collect a token

// ── Pacing ───────────────────────────────────────────────────────────────────
export const CAUGHT_DELAY_MS = 1100;
export const INTRO_HOLD_SECS = 1.1;
export const INTRO_ZOOM_SECS = 2.1;
export const WIN_ZOOM_SECS = 1.7;
export const RELAX_QUOTE_DELAY_MS = 1400;
export const RELAX_BUTTON_DELAY_MS = 4500;
