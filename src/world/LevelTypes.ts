export type SceneKey = "livingRoom" | "hallway" | "kitchen" | "playroom" | "frontDoor";

export interface GridPos {
  x: number;
  z: number;
}

export interface DecoyItemDef {
  itemName: string;        // "TV Remote", "Car Keys"
  itemEmoji: string;       // "📺", "🔑"
  sourceFurniture: string; // label of furniture to grab from
  meshColor: string;       // color of the 3D decoy mesh
  targetNpc: NpcType;      // which NPC type this distracts
  lureMessage: string;     // e.g. "Ooh, is that the remote?"
}

export interface MomOutfit {
  pantsColor: string;
  topColor: string;
  topStyle: "fitted" | "oversized" | "robe" | "nightgown";
  hair: "ponytail" | "messyBun" | "down";
}

export type FurnitureShape =
  | "table" | "shelf" | "fridge" | "counter" | "lamp" | "plant"
  | "toybox" | "stool" | "shoeRack" | "couch" | "tv" | "dresser"
  | "bed" | "bathtub" | "bookcase" | "desk" | "tvUnit"
  | "coffeeTable" | "ottoman" | "laundryBasket" | "toys" | "mirror" | "clock"
  | "pictureFrame" | "flowerVase" | "sink" | "oven" | "microwave"
  | "nightstand" | "curtains" | "coatRack" | "sideTableGlass"
  | "kitchenIsland" | "toiletries" | "rugDecor"
  | "fireplace" | "toilet" | "vanity" | "roundGlassTable" | "diningChair"
  | "diningTable" | "credenza" | "chaiseLounge"
  | "window" | "door";

export interface FurnitureDef {
  x: number;
  z: number;
  w: number;
  h: number;
  label: string;
  col: string;
  shape?: FurnitureShape;
  hasDecoy?: boolean;
  /** Rotation around Y axis in radians */
  rot?: number;
}

export interface RugDef {
  x: number;
  z: number;
  w: number;
  h: number;
}

export type NpcType = "dog" | "toddler" | "husband";

export interface NpcDef {
  type: NpcType;
  x: number;
  z: number;
  /** Dog only */
  radius?: number;
  /** Toddler / husband patrol waypoints as [x, z] pairs */
  patrol?: [number, number][];
  /** Initial facing angle in radians */
  facing?: number;
  /** Husband only */
  thought?: string;
}

export interface SummonNpcDef {
  type: NpcType;
  x: number;
  z: number;
  label: string;
}

export interface LevelData {
  id: number;
  name: string;
  scene: SceneKey;
  subtitle: string;
  winText: string;
  grid: { w: number; h: number };
  walls: [number, number][];
  interiorWalls?: [number, number][];
  furniture: FurnitureDef[];
  rug: RugDef | null;
  playerStart: GridPos;
  goal: GridPos & { label: string };
  npcs: NpcDef[];
  traps: GridPos[];
  decoys: number;
  decoyItems?: DecoyItemDef[];
  hidingSpots?: GridPos[];
  /** Wall tiles that render as windows instead of solid panels */
  windowWalls?: [number, number][];
  summonNpc?: SummonNpcDef;
  caughtLines: string[];
}

export const PALETTES: Record<SceneKey, {
  floor1: string; floor2: string; wall: string; rug: string;
  furniture: string; goal: string; accent: string; bg: string; ambient: string;
  grass: string; fence: string; baseboard: string;
}> = {
  livingRoom: {
    floor1: "#D4A574", floor2: "#C9975F", wall: "#F5E6D3", rug: "#8B6F5C",
    furniture: "#6B4226", goal: "#722F37", accent: "#D4AF37",
    bg: "#2A1F14", ambient: "#FFF0DB",
    grass: "#5A8A3A", fence: "#E8E0D0", baseboard: "#C4A882",
  },
  hallway: {
    floor1: "#B8AFA6", floor2: "#A89E94", wall: "#E8E0D8", rug: "#7A8B8B",
    furniture: "#5C4A3A", goal: "#4A90D9", accent: "#87CEEB",
    bg: "#1A1A2E", ambient: "#E8E4F0",
    grass: "#4A7A30", fence: "#E0D8C8", baseboard: "#C0B8B0",
  },
  kitchen: {
    floor1: "#C8D8D8", floor2: "#B8C8C8", wall: "#F0F0E8", rug: "#A0B0A0",
    furniture: "#505050", goal: "#4A2820", accent: "#D4956B",
    bg: "#1A2420", ambient: "#F0F8F0",
    grass: "#508A38", fence: "#E8E4D4", baseboard: "#C8C8C0",
  },
  playroom: {
    floor1: "#E8D8C8", floor2: "#DCC8B8", wall: "#FFF5EA", rug: "#E8A0A0",
    furniture: "#C06040", goal: "#333333", accent: "#FF6B6B",
    bg: "#2A1A2A", ambient: "#FFF0F0",
    grass: "#6A9A40", fence: "#EEE8D8", baseboard: "#D4C4B0",
  },
  frontDoor: {
    floor1: "#B0A090", floor2: "#A09080", wall: "#D8D0C0", rug: "#706050",
    furniture: "#504030", goal: "#8B6914", accent: "#DAA520",
    bg: "#0F1520", ambient: "#E0D8D0",
    grass: "#4A8030", fence: "#ECE4D4", baseboard: "#B8A890",
  },
};

export const MOM_OUTFITS: Record<SceneKey, MomOutfit> = {
  livingRoom: { pantsColor: "#6B2D3A", topColor: "#D4B896", topStyle: "oversized", hair: "ponytail" },
  hallway:    { pantsColor: "#7BA7C4", topColor: "#8BB8D4", topStyle: "robe",      hair: "messyBun" },
  kitchen:    { pantsColor: "#2A2A2A", topColor: "#E86B6B", topStyle: "fitted",    hair: "ponytail" },
  playroom:   { pantsColor: "#7A7A8A", topColor: "#5A7A5A", topStyle: "oversized", hair: "messyBun" },
  frontDoor:  { pantsColor: "#C4A0B8", topColor: "#D4B0C8", topStyle: "nightgown", hair: "down" },
};
