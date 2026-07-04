/**
 * Levels 11–15: the endgame.
 * 11 minefield+summon · 12 husband+dog decoy · 13 cats+toddler library ·
 * 14 midnight kitchen · 15 everything at once
 */

import type { LevelSpec } from "../types";

export const level11: LevelSpec = {
  id: 11,
  name: "The Minefield",
  subtitle: "Every toy squeaks. Every squeak summons her.",
  theme: "lamplight",
  grid: { w: 32, h: 26 },
  rooms: [{ x: 0, z: 0, w: 32, h: 26 }],
  windows: [[12, 0], [13, 0], [24, 0]],
  furniture: [
    { shape: "shelf",        x: 1,  z: 1,  w: 1, h: 5, rot: 1, label: "snackShelf", hasDecoy: true },
    { shape: "toybox",       x: 28, z: 1,  w: 2, h: 2 },
    { shape: "toyBlocks",    x: 6,  z: 8,  w: 2, h: 2 },
    { shape: "toyBlocks",    x: 22, z: 7,  w: 2, h: 2 },
    { shape: "toyBlocks",    x: 12, z: 18, w: 2, h: 2 },
    { shape: "toyBlocks",    x: 25, z: 17, w: 2, h: 2 },
    { shape: "floorCushion", x: 28, z: 22, w: 1, h: 1, label: "cushion" },
    { shape: "lamp",         x: 16, z: 1,  w: 1, h: 1 },
    { shape: "plant",        x: 1,  z: 24, w: 1, h: 1 },
  ],
  rugs: [{ x: 12, z: 9, w: 8, h: 8, round: true }],
  start: [2, 2],
  goal: { x: 27, z: 23, label: "The Quiet Corner" },
  npcs: [
    { type: "cat", x: 18, z: 16 },
  ],
  tokens: [
    { x: 3,  z: 22, type: "coffee" },
    { x: 16, z: 13, type: "book" },
    { x: 29, z: 8,  type: "chocolate" },
  ],
  traps: [
    [5, 5], [10, 3], [15, 6], [20, 4], [26, 6],
    [8, 12], [14, 11], [19, 13], [24, 12],
    [6, 19], [13, 21], [20, 19],
    [2, 9], [2, 16], [7, 24], [15, 24], [22, 24],
    [14, 2], [27, 14],
  ],
  summonNpc: { type: "toddler", x: 16, z: 2 },
  decoyItems: [
    {
      itemName: "Juice Box", itemEmoji: "🧃",
      sourceLabel: "snackShelf", meshColor: "#E8843A", targetNpc: "toddler",
    },
  ],
  relax: {
    pose: "lounge", prop: "phone", particles: "sparkles",
    quote: "93 unread notifications. Heaven.",
    seat: [28, 22], face: -Math.PI / 2, seatHeight: 0.1,
  },
  intro: "2% battery. This is life or death.",
  winText: "Not one squeak. Surgical.",
  caughtLines: ["One squeak. Three children awake. Physics."],
};

export const level12: LevelSpec = {
  id: 12,
  name: "Wine O'Clock",
  subtitle: "The good bottle. The one behind the vinegar.",
  theme: "wineNight",
  grid: { w: 34, h: 26 },
  rooms: [{ x: 0, z: 0, w: 34, h: 26 }],
  walls: [[16, 1, 16, 9], [16, 16, 16, 24]],
  windows: [[6, 0], [7, 0], [22, 0], [23, 0], [0, 10], [0, 11]],
  furniture: [
    // living side
    { shape: "couch",       x: 2,  z: 6,  w: 2, h: 5, rot: 1, label: "couch" },
    { shape: "coffeeTable", x: 6,  z: 7,  w: 2, h: 3 },
    { shape: "fireplace",   x: 1,  z: 14, w: 1, h: 4, rot: 1 },
    { shape: "armchair",    x: 6,  z: 16, w: 2, h: 2 },
    { shape: "plant",       x: 1,  z: 1,  w: 1, h: 1 },
    { shape: "plant",       x: 14, z: 22, w: 1, h: 1 },
    // dining side
    { shape: "diningTable", x: 22, z: 8,  w: 6, h: 4, label: "table" },
    { shape: "diningChair", x: 21, z: 9,  w: 1, h: 1, rot: 1 },
    { shape: "diningChair", x: 28, z: 10, w: 1, h: 1, rot: 3 },
    { shape: "diningChair", x: 23, z: 7,  w: 1, h: 1 },
    { shape: "diningChair", x: 26, z: 7,  w: 1, h: 1 },
    { shape: "diningChair", x: 23, z: 12, w: 1, h: 1, rot: 2 },
    { shape: "diningChair", x: 26, z: 12, w: 1, h: 1, rot: 2 },
    { shape: "dresser",     x: 29, z: 1,  w: 4, h: 1, label: "credenza", hasDecoy: true },
    { shape: "plant",       x: 32, z: 22, w: 1, h: 1 },
  ],
  rugs: [{ x: 20, z: 6, w: 10, h: 8 }],
  start: [2, 23],
  goal: { x: 24, z: 13, label: "The Good Wine" },
  npcs: [
    { type: "dog", x: 8, z: 20 },
    { type: "husband", x: 19, z: 5, patrol: [[19, 5], [19, 20]] },
  ],
  tokens: [
    { x: 2,  z: 12, type: "coffee" },
    { x: 30, z: 20, type: "book" },
    { x: 10, z: 2,  type: "chocolate" },
  ],
  decoyItems: [
    {
      itemName: "Cheese Plate", itemEmoji: "🧀",
      sourceLabel: "credenza", meshColor: "#E8C44E", targetNpc: "husband",
    },
  ],
  relax: {
    pose: "sit", prop: "wine", particles: "hearts",
    quote: "The good bottle. Tonight, we feast.",
    seat: [23, 12], face: Math.PI, seatHeight: 0.16,
  },
  intro: "The good wine. Behind enemy lines.",
  winText: "Don't judge the pour.",
  caughtLines: ["He just wanted to show you a meme."],
};

export const level13: LevelSpec = {
  id: 13,
  name: "Book Nook",
  subtitle: "Rain outside. Cats everywhere. One free window seat.",
  theme: "rainLibrary",
  grid: { w: 32, h: 26 },
  rooms: [{ x: 0, z: 0, w: 32, h: 26 }],
  windows: [[10, 0], [11, 0], [21, 0], [22, 0], [0, 19], [0, 20]],
  furniture: [
    { shape: "bookcase",     x: 1,  z: 1,  w: 1, h: 6, rot: 1 },
    { shape: "bookcase",     x: 1,  z: 9,  w: 1, h: 6, rot: 1 },
    { shape: "bookcase",     x: 6,  z: 1,  w: 6, h: 1 },
    { shape: "bookcase",     x: 14, z: 1,  w: 6, h: 1 },
    { shape: "pianoUpright", x: 24, z: 1,  w: 3, h: 1 },
    { shape: "windowSeat",   x: 1,  z: 18, w: 2, h: 3, rot: 1, label: "nook" },
    { shape: "desk",         x: 20, z: 8,  w: 4, h: 2 },
    { shape: "diningChair",  x: 21, z: 10, w: 1, h: 1, rot: 2 },
    { shape: "armchair",     x: 10, z: 12, w: 2, h: 2, rot: 1 },
    { shape: "catTree",      x: 28, z: 3,  w: 1, h: 1 },
    { shape: "plant",        x: 30, z: 22, w: 1, h: 1 },
    { shape: "plant",        x: 6,  z: 22, w: 1, h: 1 },
  ],
  rugs: [{ x: 8, z: 8, w: 10, h: 8 }],
  start: [30, 24],
  goal: { x: 3, z: 19, label: "The Window Nook" },
  npcs: [
    { type: "cat", x: 14, z: 7,  patrol: [[14, 7], [6, 16]] },
    { type: "cat", x: 24, z: 18, patrol: [[24, 18], [28, 10]] },
    { type: "toddler", x: 6, z: 20, patrol: [[6, 20], [26, 20]] },
  ],
  tokens: [
    { x: 4,  z: 22, type: "coffee" },
    { x: 16, z: 3,  type: "book" },
    { x: 30, z: 16, type: "chocolate" },
  ],
  hidingSpots: [[4, 4], [18, 15], [26, 22]],
  relax: {
    pose: "sit", prop: "book", particles: "sparkles",
    quote: "Rain outside. Book inside. Balance.",
    seat: [2, 19], face: Math.PI / 2, seatHeight: 0.15,
  },
  intro: "Shhh. This is a library. Perfect.",
  winText: "Shhh, plot twist.",
  caughtLines: ["You stepped near HIS floor."],
};

export const level14: LevelSpec = {
  id: 14,
  name: "Midnight Snack",
  subtitle: "The fridge light is the only witness.",
  theme: "midnight",
  grid: { w: 34, h: 28 },
  rooms: [{ x: 0, z: 0, w: 34, h: 28 }],
  windows: [[6, 0], [7, 0], [24, 0], [25, 0], [0, 12], [0, 13]],
  furniture: [
    { shape: "counter",       x: 2,  z: 1,  w: 11, h: 1 },
    { shape: "stove",         x: 13, z: 1,  w: 2,  h: 1 },
    { shape: "counter",       x: 15, z: 1,  w: 3,  h: 1 },
    { shape: "fridge",        x: 20, z: 1,  w: 2,  h: 2, label: "fridge", hasDecoy: true },
    { shape: "cabinet",       x: 26, z: 1,  w: 4,  h: 1 },
    { shape: "kitchenIsland", x: 10, z: 9,  w: 8,  h: 3, label: "island" },
    { shape: "barStool",      x: 11, z: 13, w: 1,  h: 1 },
    { shape: "barStool",      x: 14, z: 13, w: 1,  h: 1, label: "snackStool" },
    { shape: "barStool",      x: 17, z: 13, w: 1,  h: 1 },
    { shape: "diningTable",   x: 26, z: 8,  w: 4,  h: 3 },
    { shape: "diningChair",   x: 25, z: 9,  w: 1,  h: 1, rot: 1 },
    { shape: "diningChair",   x: 31, z: 9,  w: 1,  h: 1, rot: 3 },
    { shape: "pantryShelf",   x: 1,  z: 16, w: 1,  h: 5, rot: 1 },
    { shape: "plant",         x: 1,  z: 25, w: 1,  h: 1 },
    { shape: "plant",         x: 32, z: 1,  w: 1,  h: 1 },
  ],
  rugs: [{ x: 10, z: 13, w: 8, h: 2 }],
  start: [2, 24],
  goal: { x: 14, z: 12, label: "The Secret Snack" },
  npcs: [
    { type: "dog", x: 6, z: 8 },
    { type: "husband", x: 22, z: 6, patrol: [[22, 6], [22, 20]] },
  ],
  tokens: [
    { x: 3,  z: 13, type: "coffee" },
    { x: 31, z: 20, type: "book" },
    { x: 16, z: 6,  type: "chocolate" },
  ],
  traps: [[8, 16], [13, 17], [18, 18], [24, 12], [27, 16], [20, 22]],
  decoyItems: [
    {
      itemName: "Cold Beer", itemEmoji: "🍺",
      sourceLabel: "fridge", meshColor: "#C9A03A", targetNpc: "husband",
    },
  ],
  relax: {
    pose: "sit", prop: "chocolate", particles: "sparkles",
    quote: "Midnight. Kitchen. No witnesses.",
    seat: [14, 13], face: Math.PI, seatHeight: 0.2,
  },
  intro: "The tracking says everyone's asleep. It's go time.",
  winText: "They'll never find the wrapper.",
  caughtLines: ["\"Ooh, midnight snack? Make me one?\""],
};

export const level15: LevelSpec = {
  id: 15,
  name: "The Delivery",
  subtitle: "It said 'delivered' 20 minutes ago.",
  theme: "sunrise",
  grid: { w: 38, h: 30 },
  rooms: [{ x: 0, z: 0, w: 38, h: 30 }],
  walls: [[12, 1, 12, 10], [12, 17, 12, 28], [26, 1, 26, 12], [26, 19, 26, 28]],
  windows: [[4, 0], [5, 0], [16, 0], [17, 0], [31, 0], [32, 0], [0, 14], [0, 15]],
  furniture: [
    // living (west)
    { shape: "couch",       x: 1,  z: 8,  w: 2, h: 5, rot: 1, label: "couch" },
    { shape: "coffeeTable", x: 4,  z: 9,  w: 2, h: 3 },
    { shape: "bookcase",    x: 1,  z: 1,  w: 1, h: 4, rot: 1 },
    { shape: "toybox",      x: 8,  z: 24, w: 2, h: 2 },
    { shape: "plant",       x: 1,  z: 26, w: 1, h: 1 },
    // hall (center)
    { shape: "sideTable",   x: 13, z: 2,  w: 1, h: 1, label: "keysTable", hasDecoy: true },
    { shape: "coatRack",    x: 15, z: 1,  w: 1, h: 1 },
    { shape: "shoeRack",    x: 23, z: 1,  w: 2, h: 1 },
    { shape: "bench",       x: 21, z: 27, w: 3, h: 1, label: "doorBench" },
    // dining (east)
    { shape: "diningTable", x: 29, z: 6,  w: 5, h: 3 },
    { shape: "diningChair", x: 28, z: 7,  w: 1, h: 1, rot: 1 },
    { shape: "diningChair", x: 35, z: 7,  w: 1, h: 1, rot: 3 },
    { shape: "dresser",     x: 30, z: 27, w: 4, h: 1, label: "sideboard", hasDecoy: true },
    { shape: "plant",       x: 36, z: 1,  w: 1, h: 1 },
    { shape: "dresser",     x: 36, z: 14, w: 1, h: 4, rot: 3 },
  ],
  rugs: [{ x: 17, z: 24, w: 5, h: 4 }],
  start: [19, 2],
  goal: { x: 19, z: 26, label: "The Package" },
  npcs: [
    { type: "dog", x: 19, z: 8 },
    { type: "toddler", x: 4, z: 17, patrol: [[4, 17], [4, 26]] },
    { type: "husband", x: 22, z: 12, patrol: [[22, 12], [22, 24]] },
  ],
  tokens: [
    { x: 2,  z: 21, type: "coffee" },
    { x: 33, z: 3,  type: "book" },
    { x: 19, z: 17, type: "chocolate" },
  ],
  traps: [[15, 20], [24, 18], [17, 12], [28, 22]],
  decoyItems: [
    {
      itemName: "Squeaky Bone", itemEmoji: "🦴",
      sourceLabel: "keysTable", meshColor: "#F0E8D4", targetNpc: "dog",
    },
    {
      itemName: "TV Remote", itemEmoji: "📺",
      sourceLabel: "sideboard", meshColor: "#4E5E6E", targetNpc: "husband",
    },
  ],
  relax: {
    pose: "sit", prop: "package", particles: "hearts",
    quote: "Best. Delivery. Ever.",
    seat: [22, 27], face: 0, seatHeight: 0.15,
  },
  intro: "The tracking says delivered. It's go time.",
  winText: "Operation Peace & Quiet: complete.",
  caughtLines: ["So close. SO CLOSE.", "The doorbell. Who rings a DOORBELL?"],
};
