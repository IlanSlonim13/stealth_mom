/**
 * Core world types. A level is authored as a compact `LevelSpec`
 * (see builder.ts) and compiled into a `LevelData` used by the engine.
 */

export type NpcType = "dog" | "toddler" | "husband" | "cat";
export type TokenType = "coffee" | "chocolate" | "book";
export type RelaxPose = "sit" | "soak" | "lounge";
export type RelaxProp =
  | "wine" | "coffee" | "book" | "bath" | "phone"
  | "chocolate" | "headphones" | "teapot" | "package" | "cheese";
export type RelaxParticles = "hearts" | "steam" | "bubbles" | "notes" | "zzz" | "sparkles";

export interface GridPos { x: number; z: number }

export type FurnitureShape =
  | "couch" | "armchair" | "coffeeTable" | "sideTable" | "tv" | "tvUnit"
  | "bookcase" | "shelf" | "plant" | "lamp" | "rugChair" | "ottoman"
  | "diningTable" | "diningChair" | "kitchenIsland" | "counter" | "stove"
  | "fridge" | "sink" | "cabinet" | "barStool" | "bed" | "crib"
  | "toybox" | "toyBlocks" | "rockingChair" | "dresser" | "bathtub"
  | "vanity" | "toilet" | "washer" | "laundryBasket" | "desk" | "beanbag"
  | "windowSeat" | "pianoUpright" | "coatRack" | "shoeRack" | "bench"
  | "floorCushion" | "catTree" | "pantryShelf" | "fireplace" | "mirror"
  | "clock" | "pictureFrame";

export interface FurnitureDef {
  shape: FurnitureShape;
  x: number;
  z: number;
  w: number;
  h: number;
  /** Rotation around Y in quarter-turns (0-3). */
  rot?: 0 | 1 | 2 | 3;
  /** Unique label for lookup (decoy sources, relax seat...). */
  label?: string;
  /** Override the theme's furniture tint. */
  tint?: string;
  /** Glows and offers a decoy pickup. */
  hasDecoy?: boolean;
  /** If true, does not block movement (rugs, wall decor). */
  walkable?: boolean;
}

export interface RugDef { x: number; z: number; w: number; h: number; round?: boolean }

export interface NpcDef {
  type: NpcType;
  x: number;
  z: number;
  /** dog/cat: override sound radius (grid units). */
  radius?: number;
  /** toddler/husband/cat patrol waypoints. NPC walks the loop. */
  patrol?: [number, number][];
  /** Initial facing (radians, atan2(dx,dz) convention). */
  facing?: number;
  /** Vision range/angle overrides (toddler/husband). */
  range?: number;
  angle?: number;
  speed?: number;
}

export interface TokenDef { x: number; z: number; type: TokenType }

export interface DecoyItemDef {
  itemName: string;
  itemEmoji: string;
  sourceLabel: string;   // furniture label to grab from
  meshColor: string;
  targetNpc: NpcType;
}

export interface SummonNpcDef { type: NpcType; x: number; z: number }

export interface RelaxSpec {
  pose: RelaxPose;
  prop: RelaxProp;
  particles: RelaxParticles;
  quote: string;
  /** Grid position Mom settles at (the seat). */
  seat: [number, number];
  /** Facing angle when settled (radians, atan2(dx,dz)). Default: toward camera. */
  face?: number;
  /** Seat height in world units (couch ≈ 0.16, floor cushion ≈ 0.07, tub ≈ 0.1). */
  seatHeight?: number;
}

/** Wall segment: straight line of wall tiles (inclusive endpoints). */
export type WallSeg = [number, number, number, number]; // x1, z1, x2, z2

export interface RoomSpec { x: number; z: number; w: number; h: number }

/** What level authors write. Compiled by buildLevel(). */
export interface LevelSpec {
  id: number;
  name: string;
  subtitle: string;
  theme: string; // key into THEMES
  grid: { w: number; h: number };
  /** Rectangular rooms — perimeters become walls. */
  rooms: RoomSpec[];
  /** Extra interior wall segments. */
  walls?: WallSeg[];
  /** Tiles carved out of walls (walkable openings, rendered as arches). */
  doors?: [number, number][];
  /** Wall tiles rendered as windows (visual only, still block). */
  windows?: [number, number][];
  furniture: FurnitureDef[];
  rugs?: RugDef[];
  start: [number, number];
  goal: { x: number; z: number; label: string };
  npcs: NpcDef[];
  tokens: TokenDef[];
  traps?: [number, number][];
  hidingSpots?: [number, number][];
  decoyItems?: DecoyItemDef[];
  summonNpc?: SummonNpcDef;
  relax: RelaxSpec;
  intro: string;
  winText: string;
  caughtLines: string[];
}

/** Compiled level, consumed by the engine. */
export interface LevelData extends Omit<LevelSpec, "rooms" | "walls" | "doors"> {
  /** Every wall tile (doors already carved out). */
  wallTiles: [number, number][];
  /** Tiles that are walkable openings in walls (render arches). */
  doorTiles: [number, number][];
  /** Walkable floor tiles (inside a room, not wall). */
  floorTiles: Set<string>;
  /** Blocked set for pathfinding: walls + furniture footprints. */
  blocked: Set<string>;
}

export interface GameCallbacks {
  onIntroDone: () => void;
  onCaught: (line: string, npcType: NpcType | "trap") => void;
  /** Goal reached — win zoom starts. `tokens` = me-time tokens collected (0-3). */
  onWon: (tokens: number) => void;
  /** Win zoom finished, relax scene is playing. */
  onRelaxStarted: () => void;
  onToken: (count: number) => void;
  onNearPickup: (itemName: string | null) => void;
  onDecoyThrown: () => void;
  onRelaxFeedback: (text: string, screenX: number, screenY: number) => void;
}
