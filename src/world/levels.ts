import { DOG_SOUND_RADIUS } from "../utils/constants";
import type { LevelData } from "./LevelTypes";

export const LEVELS: LevelData[] = [
  // ── Level 1 ─ "The Couch" ── Living Room (x=2..13) + Hallway (x=14..19) ── 22×18
  {
    id: 1,
    name: "The Couch",
    scene: "livingRoom",
    subtitle: "The wine is poured. The couch is calling.",
    winText: "Achievement Unlocked: 47 Seconds of Silence",
    grid: { w: 22, h: 18 },
    walls: [
      // top row z=0
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
      [12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],
      // bottom row z=17
      [0,17],[1,17],[2,17],[3,17],[4,17],[5,17],[6,17],[7,17],[8,17],[9,17],[10,17],[11,17],
      [12,17],[13,17],[14,17],[15,17],[16,17],[17,17],[18,17],[19,17],[20,17],[21,17],
      // left col x=0
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[0,15],[0,16],
      // right col x=21
      [21,1],[21,2],[21,3],[21,4],[21,5],[21,6],[21,7],[21,8],[21,9],[21,10],[21,11],[21,12],[21,13],[21,14],[21,15],[21,16],
    ],
    // Interior wall at x=14 — doorway at z=7,8
    interiorWalls: [
      [14,1],[14,2],[14,3],[14,4],[14,5],[14,6],
      [14,9],[14,10],[14,11],[14,12],[14,13],[14,14],[14,15],[14,16],
    ],
    furniture: [
      { x:5,  z:2,  w:4, h:2, label:"tv",           col:"#2A2A3A", shape:"tvUnit"              },
      { x:5,  z:8,  w:4, h:2, label:"couch",         col:"#8B6F5C", shape:"couch"              },
      { x:3,  z:8,  w:2, h:2, label:"sideTable",     col:"#5C3A1E", shape:"table"              },
      { x:3,  z:11, w:2, h:2, label:"lamp",           col:"#D4AF37", shape:"lamp"              },
      { x:2,  z:5,  w:2, h:2, label:"shelf",          col:"#8B5A2B", shape:"shelf", hasDecoy:true },
      { x:16, z:10, w:2, h:2, label:"table",          col:"#5C3A1E", shape:"table"             },
      // Extra furniture
      { x:6,  z:6,  w:2, h:1, label:"coffeeTable",   col:"#5C3A1E", shape:"coffeeTable"       },
      { x:10, z:8,  w:2, h:2, label:"ottoman",        col:"#8B6F5C", shape:"ottoman"           },
      { x:2,  z:14, w:2, h:2, label:"bookcase",       col:"#8B5A2B", shape:"bookcase"          },
      { x:16, z:2,  w:2, h:2, label:"hallPlant",      col:"#4A7A4A", shape:"plant"             },
      { x:10, z:2,  w:2, h:2, label:"clock",          col:"#C0C0C0", shape:"clock"             },
      { x:16, z:14, w:2, h:2, label:"hallToys",       col:"#E06040", shape:"toys"              },
    ],
    rug: { x:4, z:4, w:6, h:4 },
    playerStart: { x:18, z:12 },
    goal: { x:8, z:10, label:"The Couch" },
    npcs: [
      { type:"dog", x:18, z:4, radius: DOG_SOUND_RADIUS },
    ],
    traps: [],
    decoys: 1,
    decoyItems: [{
      itemName: "TV Remote",
      itemEmoji: "📺",
      sourceFurniture: "shelf",
      meshColor: "#444466",
      targetNpc: "dog",
      lureMessage: "Is that the remote?!",
    }],
    caughtLines: [
      "WOOF WOOF WOOF!",
      "The dog leaps onto you. No couch tonight.",
      "So close to freedom...",
    ],
  },

  // ── Level 2 ─ "The Bubble Bath" ── Bedroom + Hallway + Bathroom ── 24×18
  {
    id: 2,
    name: "The Bubble Bath",
    scene: "hallway",
    subtitle: "The bath bombs are ready. Just get past the tiny human.",
    winText: "Achievement Unlocked: Pruney Fingers of Bliss",
    grid: { w: 24, h: 18 },
    walls: [
      // top row z=0
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
      [12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0],
      // bottom row z=17
      [0,17],[1,17],[2,17],[3,17],[4,17],[5,17],[6,17],[7,17],[8,17],[9,17],[10,17],[11,17],
      [12,17],[13,17],[14,17],[15,17],[16,17],[17,17],[18,17],[19,17],[20,17],[21,17],[22,17],[23,17],
      // left col x=0
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[0,15],[0,16],
      // right col x=23
      [23,1],[23,2],[23,3],[23,4],[23,5],[23,6],[23,7],[23,8],[23,9],[23,10],[23,11],[23,12],[23,13],[23,14],[23,15],[23,16],
    ],
    // Bedroom(x=1-7) | Hallway(x=9-15) | Bathroom(x=17-22)
    // x=8 doorway z=7,8 ; x=16 doorway z=9,10
    interiorWalls: [
      [8,1],[8,2],[8,3],[8,4],[8,5],[8,6],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[8,15],[8,16],
      [16,1],[16,2],[16,3],[16,4],[16,5],[16,6],[16,7],[16,8],[16,11],[16,12],[16,13],[16,14],[16,15],[16,16],
    ],
    furniture: [
      { x:2,  z:2,  w:4, h:4, label:"bed",        col:"#F0EAE0", shape:"bed"               },
      { x:6,  z:12, w:2, h:2, label:"dresser",     col:"#8B6914", shape:"dresser", hasDecoy:true },
      { x:10, z:4,  w:2, h:2, label:"plant",       col:"#4A7A4A", shape:"plant"             },
      { x:10, z:12, w:2, h:2, label:"plant2",      col:"#4A7A4A", shape:"plant"             },
      { x:18, z:4,  w:4, h:2, label:"bathtub",     col:"#E8F0F0", shape:"bathtub"          },
      // Extra furniture
      { x:2,  z:7,  w:2, h:2, label:"bedroomLamp", col:"#D4AF37", shape:"lamp"             },
      { x:6,  z:8,  w:2, h:2, label:"laundry",     col:"#E8D8C0", shape:"laundryBasket"    },
      { x:18, z:8,  w:2, h:2, label:"mirror",      col:"#C0D0E0", shape:"mirror"           },
      { x:14, z:8,  w:2, h:2, label:"hallToys",    col:"#E06040", shape:"toys"             },
      { x:2,  z:14, w:2, h:2, label:"bedroomRug",  col:"#8B6F5C", shape:"ottoman"          },
      { x:20, z:8,  w:2, h:2, label:"bathPlant",   col:"#4A7A4A", shape:"plant"            },
    ],
    rug: null,
    playerStart: { x:4, z:8 },
    goal: { x:20, z:10, label:"The Bathroom" },
    npcs: [
      { type:"toddler", x:12, z:8, patrol:[[12,2],[12,14]], facing: Math.PI/2 },
    ],
    traps: [],
    decoys: 1,
    decoyItems: [{
      itemName: "Stuffed Bear",
      itemEmoji: "🧸",
      sourceFurniture: "dresser",
      meshColor: "#C4956A",
      targetNpc: "toddler",
      lureMessage: "Mr. Bear!! MINE!!",
    }],
    hidingSpots: [{x:6,z:6},{x:6,z:10},{x:12,z:4},{x:12,z:12}],
    caughtLines: [
      "MOMMY!! MOMMY MOMMY MOMMY!!",
      "Tiny hands grab your leg. Bath cancelled.",
      "The toddler radar is undefeated.",
    ],
  },

  // ── Level 3 ─ "The Decoy" ── Kitchen + Dining + Pantry ── 24×20
  {
    id: 3,
    name: "The Decoy",
    scene: "kitchen",
    subtitle: "The dark chocolate is behind the oatmeal. He must never know.",
    winText: "Achievement Unlocked: Secret Chocolate Stash Secured",
    grid: { w: 24, h: 20 },
    walls: [
      // top row z=0
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
      [12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0],
      // bottom row z=19
      [0,19],[1,19],[2,19],[3,19],[4,19],[5,19],[6,19],[7,19],[8,19],[9,19],[10,19],[11,19],
      [12,19],[13,19],[14,19],[15,19],[16,19],[17,19],[18,19],[19,19],[20,19],[21,19],[22,19],[23,19],
      // left col x=0
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[0,15],[0,16],[0,17],[0,18],
      // right col x=23
      [23,1],[23,2],[23,3],[23,4],[23,5],[23,6],[23,7],[23,8],[23,9],[23,10],[23,11],[23,12],[23,13],[23,14],[23,15],[23,16],[23,17],[23,18],
    ],
    // Kitchen(x=1-9) | Dining(x=11-17) | Pantry(x=19-22)
    // x=10 doorway z=9,10 ; x=18 doorway z=5,6
    interiorWalls: [
      [10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],[10,11],[10,12],[10,13],[10,14],[10,15],[10,16],[10,17],[10,18],
      [18,1],[18,2],[18,3],[18,4],[18,7],[18,8],[18,9],[18,10],[18,11],[18,12],[18,13],[18,14],[18,15],[18,16],[18,17],[18,18],
    ],
    furniture: [
      { x:2,  z:2,  w:6, h:2, label:"counter",    col:"#E8E0D0", shape:"counter", hasDecoy:true },
      { x:8,  z:2,  w:2, h:4, label:"fridge",     col:"#C8C8C8", shape:"fridge"                },
      { x:12, z:6,  w:4, h:4, label:"table",      col:"#8B6914", shape:"table"                 },
      { x:12, z:14, w:2, h:2, label:"stool1",     col:"#8B6F5C", shape:"stool"                 },
      { x:14, z:14, w:2, h:2, label:"stool2",     col:"#8B6F5C", shape:"stool"                 },
      // Extra furniture
      { x:16, z:6,  w:2, h:2, label:"diningPlant",col:"#4A7A4A", shape:"plant"                 },
      { x:20, z:8,  w:2, h:2, label:"pantryShelf",col:"#8B5A2B", shape:"shelf"                 },
      { x:4,  z:6,  w:2, h:2, label:"kitchenClock",col:"#C0C0C0", shape:"clock"                },
      { x:16, z:14, w:2, h:2, label:"stool3",     col:"#8B6F5C", shape:"stool"                 },
      { x:2,  z:16, w:2, h:2, label:"kitchenToys",col:"#FF6B6B", shape:"toys"                  },
      { x:20, z:14, w:2, h:2, label:"pantryLamp", col:"#D4AF37", shape:"lamp"                  },
    ],
    rug: null,
    playerStart: { x:4, z:12 },
    goal: { x:20, z:4, label:"The Pantry" },
    npcs: [
      { type:"husband", x:14, z:12, patrol:[[12,12],[16,10]], facing:0, thought:"Where are my keys?" },
    ],
    traps: [],
    decoys: 1,
    decoyItems: [{
      itemName: "Car Keys",
      itemEmoji: "🔑",
      sourceFurniture: "counter",
      meshColor: "#C0C0C0",
      targetNpc: "husband",
      lureMessage: "Are those my keys?!",
    }],
    caughtLines: [
      "Hey honey, what's for dinner?",
      "He spots you. Chocolate mission compromised.",
      "Busted. He wants to know why you are sneaking.",
    ],
  },

  // ── Level 4 ─ "The Minefield" ── Hallway + Playroom + Study ── 24×20
  {
    id: 4,
    name: "The Minefield",
    scene: "playroom",
    subtitle: "The phone charger is in there. So are 47 squeaky toys.",
    winText: "Achievement Unlocked: Silent But Deadly (Footwork)",
    grid: { w: 24, h: 20 },
    walls: [
      // top row z=0
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],
      [12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0],
      // bottom row z=19
      [0,19],[1,19],[2,19],[3,19],[4,19],[5,19],[6,19],[7,19],[8,19],[9,19],[10,19],[11,19],
      [12,19],[13,19],[14,19],[15,19],[16,19],[17,19],[18,19],[19,19],[20,19],[21,19],[22,19],[23,19],
      // left col x=0
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[0,15],[0,16],[0,17],[0,18],
      // right col x=23
      [23,1],[23,2],[23,3],[23,4],[23,5],[23,6],[23,7],[23,8],[23,9],[23,10],[23,11],[23,12],[23,13],[23,14],[23,15],[23,16],[23,17],[23,18],
    ],
    // Hallway(x=1-5) | Playroom(x=7-17) | Study(x=19-22)
    // x=6 doorway z=9,10 ; x=18 doorway z=15,16
    interiorWalls: [
      [6,1],[6,2],[6,3],[6,4],[6,5],[6,6],[6,7],[6,8],[6,11],[6,12],[6,13],[6,14],[6,15],[6,16],[6,17],[6,18],
      [18,1],[18,2],[18,3],[18,4],[18,5],[18,6],[18,7],[18,8],[18,9],[18,10],[18,11],[18,12],[18,13],[18,14],[18,17],[18,18],
    ],
    furniture: [
      { x:2,  z:6,  w:2, h:2, label:"lamp",       col:"#D4AF37", shape:"lamp"                  },
      { x:8,  z:4,  w:2, h:2, label:"toybox",     col:"#E06040", shape:"toybox",  hasDecoy:true },
      { x:20, z:4,  w:4, h:2, label:"bookcase",   col:"#8B5A2B", shape:"bookcase"               },
      { x:20, z:8,  w:2, h:2, label:"desk",       col:"#8B6914", shape:"desk"                   },
      // Extra furniture
      { x:12, z:2,  w:2, h:2, label:"playToys1",  col:"#4A90D9", shape:"toys"                   },
      { x:14, z:16, w:2, h:2, label:"playToys2",  col:"#E8A040", shape:"toys"                   },
      { x:20, z:12, w:2, h:2, label:"studyPlant", col:"#4A7A4A", shape:"plant"                  },
      { x:2,  z:14, w:2, h:2, label:"hallOttoman",col:"#8B6F5C", shape:"ottoman"                },
      { x:2,  z:2,  w:2, h:2, label:"hallMirror", col:"#C0D0E0", shape:"mirror"                 },
      { x:8,  z:16, w:2, h:2, label:"playLaundry",col:"#E8D8C0", shape:"laundryBasket"          },
    ],
    rug: { x:8, z:6, w:10, h:8 },
    playerStart: { x:2, z:10 },
    goal: { x:20, z:10, label:"Phone Charger" },
    npcs: [],
    traps: [
      {x:10,z:6},{x:12,z:8},{x:10,z:12},{x:14,z:6},{x:16,z:10},
      {x:12,z:14},{x:14,z:12},{x:8,z:10},{x:16,z:6},{x:10,z:10},
    ],
    decoys: 1,
    decoyItems: [{
      itemName: "Juice Box",
      itemEmoji: "🧃",
      sourceFurniture: "toybox",
      meshColor: "#E86B3A",
      targetNpc: "toddler",
      lureMessage: "JUICE! JUICE! JUICE!",
    }],
    summonNpc: { type:"toddler", x:12, z:0, label:"Toddler hears the squeak!" },
    caughtLines: [
      "SQUEEEAK! The toddler comes running.",
      "You stepped on Mr. Quackers. It is over.",
      "The squeaky toy betrayed you.",
    ],
  },

  // ── Level 5 ─ "The Delivery" ── 3-room house ── 28×24
  {
    id: 5,
    name: "The Delivery",
    scene: "frontDoor",
    subtitle: "The Amazon package has arrived. This is the final mission.",
    winText: "GAME COMPLETE: Mom of the Year",
    grid: { w: 28, h: 24 },
    walls: [
      // top row z=0
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],
      [14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0],[24,0],[25,0],[26,0],[27,0],
      // bottom row z=23
      [0,23],[1,23],[2,23],[3,23],[4,23],[5,23],[6,23],[7,23],[8,23],[9,23],[10,23],[11,23],[12,23],[13,23],
      [14,23],[15,23],[16,23],[17,23],[18,23],[19,23],[20,23],[21,23],[22,23],[23,23],[24,23],[25,23],[26,23],[27,23],
      // left col x=0
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[0,11],[0,12],[0,13],[0,14],[0,15],[0,16],[0,17],[0,18],[0,19],[0,20],[0,21],[0,22],
      // right col x=27
      [27,1],[27,2],[27,3],[27,4],[27,5],[27,6],[27,7],[27,8],[27,9],[27,10],[27,11],[27,12],[27,13],[27,14],[27,15],[27,16],[27,17],[27,18],[27,19],[27,20],[27,21],[27,22],
    ],
    // Kitchen(x=1-9) | Living Room(x=11-21) | Entryway(x=23-26)
    // x=10 doorway z=11,12 ; x=22 doorway z=17,18
    interiorWalls: [
      [10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],[10,9],[10,10],
      [10,13],[10,14],[10,15],[10,16],[10,17],[10,18],[10,19],[10,20],[10,21],[10,22],
      [22,1],[22,2],[22,3],[22,4],[22,5],[22,6],[22,7],[22,8],[22,9],[22,10],[22,11],[22,12],[22,13],[22,14],[22,15],[22,16],
      [22,19],[22,20],[22,21],[22,22],
    ],
    furniture: [
      { x:2,  z:4,  w:4, h:2, label:"counter",     col:"#E8E0D0", shape:"counter", hasDecoy:true },
      { x:2,  z:6,  w:2, h:4, label:"fridge",      col:"#C8C8C8", shape:"fridge"                 },
      { x:12, z:4,  w:4, h:2, label:"couch",       col:"#8B6F5C", shape:"couch"                  },
      { x:16, z:4,  w:4, h:2, label:"tv",          col:"#2A2A3A", shape:"tv"                     },
      { x:12, z:18, w:4, h:2, label:"table",       col:"#5C3A1E", shape:"table",   hasDecoy:true  },
      { x:18, z:16, w:2, h:2, label:"plant",       col:"#4A7A4A", shape:"plant"                   },
      { x:24, z:18, w:2, h:2, label:"shoeRack",    col:"#6B4226", shape:"shoeRack"                },
      // Extra furniture
      { x:14, z:8,  w:2, h:2, label:"coffeeTable", col:"#5C3A1E", shape:"coffeeTable"            },
      { x:12, z:14, w:2, h:2, label:"ottoman",     col:"#8B6F5C", shape:"ottoman"                },
      { x:24, z:14, w:2, h:2, label:"entryToys",   col:"#E06040", shape:"toys"                   },
      { x:20, z:8,  w:2, h:2, label:"livingLamp",  col:"#D4AF37", shape:"lamp"                   },
      { x:6,  z:16, w:2, h:2, label:"laundry",     col:"#E8D8C0", shape:"laundryBasket"          },
      { x:4,  z:2,  w:2, h:2, label:"kitClock",    col:"#C0C0C0", shape:"clock"                  },
      { x:18, z:20, w:2, h:2, label:"livingPlant2",col:"#4A7A4A", shape:"plant"                  },
      { x:24, z:8,  w:2, h:2, label:"entryMirror", col:"#C0D0E0", shape:"mirror"                 },
    ],
    rug: { x:12, z:8, w:8, h:6 },
    playerStart: { x:4, z:14 },
    goal: { x:24, z:4, label:"The Package" },
    npcs: [
      { type:"dog",     x:24, z:12, radius: 4.0 },
      { type:"toddler", x:16, z:12, patrol:[[16,8],[16,16]], facing: Math.PI/2 },
      { type:"husband", x:6,  z:12, patrol:[[4,12],[8,12]], facing:0, thought:"Did I hear the doorbell?" },
    ],
    traps: [{x:14,z:12},{x:18,z:10}],
    decoys: 1,
    decoyItems: [
      {
        itemName: "TV Remote",
        itemEmoji: "📺",
        sourceFurniture: "table",
        meshColor: "#444466",
        targetNpc: "husband",
        lureMessage: "Ooh, is that the remote?",
      },
      {
        itemName: "Beer",
        itemEmoji: "🍺",
        sourceFurniture: "counter",
        meshColor: "#D4820A",
        targetNpc: "husband",
        lureMessage: "A cold one? Don't mind if I do...",
      },
    ],
    caughtLines: [
      "Total chaos. Everyone converges on you.",
      "The trifecta of detection. Game over.",
      "You almost made it to the package...",
    ],
  },
];
