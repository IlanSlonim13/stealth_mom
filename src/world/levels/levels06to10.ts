/**
 * Levels 6–10: the plot thickens.
 * 6 cats · 7 squeaky traps · 8 dog+toddler · 9 husband+traps · 10 double toddlers
 */

import type { LevelSpec } from "../types";

export const level06: LevelSpec = {
  id: 6,
  name: "Cat Nap",
  subtitle: "The cat is not asleep. The cat is never asleep.",
  theme: "goldenStudy",
  grid: { w: 30, h: 22 },
  rooms: [{ x: 0, z: 0, w: 30, h: 22 }],
  windows: [[8, 0], [9, 0], [22, 0], [0, 14], [0, 15]],
  furniture: [
    { shape: "fireplace",    x: 1,  z: 8,  w: 1, h: 4, rot: 1, label: "fireplace" },
    { shape: "armchair",     x: 4,  z: 9,  w: 2, h: 2, rot: 3, label: "armchair" },
    { shape: "sideTable",    x: 4,  z: 11, w: 1, h: 1, label: "teaTable" },
    { shape: "bookcase",     x: 1,  z: 2,  w: 1, h: 4, rot: 1 },
    { shape: "bookcase",     x: 12, z: 1,  w: 6, h: 1 },
    { shape: "pianoUpright", x: 19, z: 1,  w: 3, h: 1 },
    { shape: "desk",         x: 24, z: 1,  w: 4, h: 2 },
    { shape: "diningChair",  x: 25, z: 3,  w: 1, h: 1, rot: 2 },
    { shape: "catTree",      x: 27, z: 18, w: 1, h: 1 },
    { shape: "plant",        x: 1,  z: 20, w: 1, h: 1 },
    { shape: "plant",        x: 28, z: 1,  w: 1, h: 1 },
  ],
  rugs: [{ x: 3, z: 8, w: 6, h: 5 }],
  start: [2, 19],
  goal: { x: 4, z: 8, label: "The Armchair" },
  npcs: [
    { type: "cat", x: 14, z: 10, patrol: [[14, 10], [24, 16], [8, 16]] },
    { type: "dog", x: 20, z: 7 },
  ],
  tokens: [
    { x: 2,  z: 7,  type: "coffee" },
    { x: 16, z: 19, type: "book" },
    { x: 27, z: 4,  type: "chocolate" },
  ],
  relax: {
    pose: "sit", prop: "teapot", particles: "steam",
    quote: "Tea. Silence. Cat hair. Perfect.",
    seat: [4, 9], face: -Math.PI / 2, seatHeight: 0.17,
  },
  intro: "Step on zero tails. Zero.",
  winText: "Stealth level: parental.",
  caughtLines: ["MRRROWWW. Everyone's awake now."],
};

export const level07: LevelSpec = {
  id: 7,
  name: "Squeaky Floor",
  subtitle: "A minefield of beloved toys.",
  theme: "playPop",
  grid: { w: 28, h: 22 },
  rooms: [{ x: 0, z: 0, w: 28, h: 22 }],
  windows: [[7, 0], [8, 0], [19, 0]],
  furniture: [
    { shape: "toybox",    x: 1,  z: 1,  w: 2, h: 2 },
    { shape: "shelf",     x: 24, z: 1,  w: 3, h: 1 },
    { shape: "toyBlocks", x: 8,  z: 4,  w: 2, h: 2 },
    { shape: "toyBlocks", x: 18, z: 14, w: 2, h: 2 },
    { shape: "beanbag",   x: 25, z: 18, w: 2, h: 2, label: "beanbag" },
    { shape: "plant",     x: 1,  z: 19, w: 1, h: 1 },
  ],
  rugs: [{ x: 10, z: 7, w: 8, h: 8, round: true }],
  start: [2, 10],
  goal: { x: 24, z: 19, label: "The Nook" },
  npcs: [],
  tokens: [
    { x: 3,  z: 18, type: "coffee" },
    { x: 22, z: 3,  type: "book" },
    { x: 13, z: 10, type: "chocolate" },
  ],
  traps: [
    [6, 6], [12, 5], [16, 8], [9, 12], [14, 14],
    [20, 10], [22, 16], [10, 17], [17, 18], [5, 15],
  ],
  relax: {
    pose: "lounge", prop: "headphones", particles: "notes",
    quote: "Volume: 100%. World: 0%.",
    seat: [25, 18], face: Math.PI / 4, seatHeight: 0.12,
  },
  intro: "One squeak and it's all over.",
  winText: "Not a single squeak. Legend.",
  caughtLines: ["The squeaky giraffe. Your old nemesis."],
};

export const level08: LevelSpec = {
  id: 8,
  name: "Double Trouble",
  subtitle: "Two of them. One of you.",
  theme: "blueHour",
  grid: { w: 32, h: 26 },
  rooms: [{ x: 0, z: 0, w: 32, h: 26 }],
  windows: [[6, 0], [7, 0], [26, 0], [0, 16], [0, 17]],
  furniture: [
    { shape: "couch",       x: 12, z: 18, w: 5, h: 2, label: "couch" },
    { shape: "coffeeTable", x: 13, z: 21, w: 3, h: 1 },
    { shape: "sideTable",   x: 17, z: 18, w: 1, h: 1, label: "sideTable" },
    { shape: "fireplace",   x: 1,  z: 10, w: 1, h: 4, rot: 1 },
    { shape: "diningTable", x: 24, z: 6,  w: 4, h: 3 },
    { shape: "diningChair", x: 23, z: 7,  w: 1, h: 1, rot: 1 },
    { shape: "diningChair", x: 28, z: 7,  w: 1, h: 1, rot: 3 },
    { shape: "bookcase",    x: 1,  z: 2,  w: 1, h: 4, rot: 1 },
    { shape: "dresser",     x: 20, z: 1,  w: 4, h: 1 },
    { shape: "lamp",        x: 11, z: 18, w: 1, h: 1 },
    { shape: "plant",       x: 30, z: 1,  w: 1, h: 1 },
    { shape: "plant",       x: 1,  z: 24, w: 1, h: 1 },
  ],
  rugs: [{ x: 10, z: 16, w: 9, h: 7 }],
  start: [2, 2],
  goal: { x: 17, z: 20, label: "The Couch (Again)" },
  npcs: [
    { type: "dog", x: 8, z: 14 },
    { type: "toddler", x: 16, z: 6, patrol: [[16, 6], [16, 14], [26, 14], [26, 20]] },
  ],
  tokens: [
    { x: 3,  z: 22, type: "coffee" },
    { x: 28, z: 3,  type: "book" },
    { x: 14, z: 16, type: "chocolate" },
  ],
  relax: {
    pose: "sit", prop: "cheese", particles: "hearts",
    quote: "A cheese board for one. Heaven.",
    seat: [14, 19], face: 0, seatHeight: 0.17,
  },
  intro: "Two guards. One cheese board at stake.",
  winText: "Mom: 1. Chaos: 0. (For now.)",
  caughtLines: ["Tiny footsteps. Maximum consequences."],
};

export const level09: LevelSpec = {
  id: 9,
  name: "Laundry Gauntlet",
  subtitle: "Warm towels wait for no one.",
  theme: "powder",
  grid: { w: 30, h: 24 },
  rooms: [
    { x: 0,  z: 0, w: 18, h: 24 },
    { x: 17, z: 0, w: 13, h: 24 },
  ],
  doors: [[17, 6], [17, 7]],
  windows: [[10, 0], [11, 0], [23, 0], [0, 18], [0, 19]],
  furniture: [
    // hallway
    { shape: "coatRack",  x: 1,  z: 1,  w: 1, h: 1 },
    { shape: "shoeRack",  x: 1,  z: 4,  w: 1, h: 3, rot: 1 },
    { shape: "bench",     x: 6,  z: 1,  w: 4, h: 1, label: "benchHall", hasDecoy: true },
    { shape: "mirror",    x: 0,  z: 10, w: 1, h: 1, walkable: true },
    { shape: "dresser",   x: 1,  z: 14, w: 1, h: 4, rot: 1 },
    { shape: "plant",     x: 1,  z: 22, w: 1, h: 1 },
    { shape: "toybox",    x: 12, z: 20, w: 2, h: 2 },
    // laundry room
    { shape: "counter",       x: 18, z: 1,  w: 4, h: 1 },
    { shape: "washer",        x: 24, z: 1,  w: 2, h: 2 },
    { shape: "washer",        x: 27, z: 1,  w: 2, h: 2 },
    { shape: "laundryBasket", x: 19, z: 12, w: 1, h: 1 },
    { shape: "laundryBasket", x: 28, z: 8,  w: 1, h: 1 },
    { shape: "shelf",         x: 28, z: 14, w: 1, h: 4, rot: 3 },
    { shape: "bench",         x: 22, z: 20, w: 4, h: 1, label: "warmBench" },
  ],
  rugs: [{ x: 4, z: 8, w: 8, h: 8, round: true }],
  start: [3, 20],
  goal: { x: 24, z: 21, label: "The Warm Towels" },
  npcs: [
    { type: "husband", x: 22, z: 5, patrol: [[22, 5], [22, 17]] },
  ],
  tokens: [
    { x: 3,  z: 12, type: "coffee" },
    { x: 15, z: 3,  type: "book" },
    { x: 26, z: 21, type: "chocolate" },
  ],
  traps: [[14, 10], [9, 16], [19, 9], [20, 16], [25, 12], [26, 18]],
  decoyItems: [
    {
      itemName: "TV Remote", itemEmoji: "📺",
      sourceLabel: "benchHall", meshColor: "#4E5E6E", targetNpc: "husband",
    },
  ],
  relax: {
    pose: "sit", prop: "phone", particles: "steam",
    quote: "Sitting on warm towels. Reading everything.",
    seat: [24, 20], face: 0, seatHeight: 0.15,
  },
  intro: "The dryer just sang its song. GO.",
  winText: "Warm. Towels. Victory.",
  caughtLines: ["\"While you're up, can you…\""],
};

export const level10: LevelSpec = {
  id: 10,
  name: "Nap Window",
  subtitle: "Both napping. You have 20 minutes. Use them.",
  theme: "lavenderDusk",
  grid: { w: 32, h: 26 },
  rooms: [{ x: 0, z: 0, w: 32, h: 26 }],
  windows: [[8, 0], [9, 0], [22, 0], [23, 0], [0, 15], [0, 16]],
  furniture: [
    { shape: "crib",         x: 1,  z: 1,  w: 4, h: 3, label: "crib1" },
    { shape: "crib",         x: 27, z: 1,  w: 4, h: 3, label: "crib2" },
    { shape: "rockingChair", x: 1,  z: 20, w: 2, h: 2, rot: 1, label: "rocker" },
    { shape: "dresser",      x: 14, z: 1,  w: 4, h: 1 },
    { shape: "toybox",       x: 28, z: 19, w: 2, h: 2 },
    { shape: "bookcase",     x: 1,  z: 8,  w: 1, h: 4, rot: 1 },
    { shape: "toyBlocks",    x: 20, z: 10, w: 2, h: 2 },
    { shape: "toyBlocks",    x: 9,  z: 14, w: 2, h: 2 },
    { shape: "plant",        x: 30, z: 12, w: 1, h: 1 },
  ],
  rugs: [{ x: 12, z: 10, w: 8, h: 8, round: true }],
  start: [29, 23],
  goal: { x: 2, z: 19, label: "The Rocking Chair" },
  npcs: [
    { type: "toddler", x: 8,  z: 5, patrol: [[8, 5], [24, 5]] },
    { type: "toddler", x: 26, z: 9, patrol: [[26, 9], [26, 22]] },
  ],
  tokens: [
    { x: 3,  z: 13, type: "coffee" },
    { x: 18, z: 21, type: "book" },
    { x: 29, z: 10, type: "chocolate" },
  ],
  hidingSpots: [[7, 7], [16, 17], [24, 6]],
  relax: {
    pose: "sit", prop: "book", particles: "zzz",
    quote: "Both cribs. Silent. Unprecedented.",
    seat: [2, 20], face: Math.PI / 2, seatHeight: 0.16,
  },
  intro: "Two toddlers. Twenty minutes. One rocking chair.",
  winText: "Sanctuary status: REACHED.",
  caughtLines: ["She told her brother. He told everyone."],
};
