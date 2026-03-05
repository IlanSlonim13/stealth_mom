import { create } from "zustand";
import { LEVELS } from "../world/levels";

export type Screen = "menu" | "intro" | "game" | "caught" | "win" | "relax";
export type DecoyMode = false | "throw";

interface GameState {
  screen: Screen;
  levelIdx: number;
  caughtLine: string;
  winText: string;
  decoyMode: DecoyMode;
  decoysLeft: number;
  inventory: string[];       // item names currently held (max 1)
  nearPickup: string | null; // item name Mom is near (for HUD prompt)
  introActive: boolean;      // true while intro zoom is playing
  relaxActive: boolean;      // true when post-level relaxation overlay is showing

  startLevel: (idx: number) => void;
  setScreen: (screen: Screen) => void;
  setCaughtLine: (line: string) => void;
  setWinText: (text: string) => void;
  setDecoyMode: (mode: DecoyMode) => void;
  useDecoy: () => void;
  setNearPickup: (item: string | null) => void;
  pickUpDecoy: (itemName: string) => void;
  throwDecoy: () => void;
  setIntroActive: (v: boolean) => void;
  setRelaxActive: (v: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  screen: "menu",
  levelIdx: 0,
  caughtLine: "",
  winText: "",
  decoyMode: false,
  decoysLeft: 0,
  inventory: [],
  nearPickup: null,
  introActive: false,
  relaxActive: false,

  startLevel: (idx) => {
    set({
      levelIdx: idx,
      screen: "game",
      introActive: true,
      relaxActive: false,
      decoyMode: false,
      decoysLeft: LEVELS[idx].decoys ?? 0,
      inventory: [],
      nearPickup: null,
      caughtLine: "",
      winText: "",
    });
  },

  setScreen: (screen) => set({ screen }),
  setCaughtLine: (caughtLine) => set({ caughtLine }),
  setWinText: (winText) => set({ winText }),
  setDecoyMode: (decoyMode) => set({ decoyMode }),

  // Legacy — kept for compatibility; use throwDecoy instead
  useDecoy: () => set((s) => ({ decoysLeft: s.decoysLeft - 1, decoyMode: false, inventory: [] })),

  setNearPickup: (item) => set({ nearPickup: item }),

  pickUpDecoy: (itemName) => set((s) => ({
    inventory: s.inventory.length < 1 ? [itemName] : s.inventory,
    nearPickup: null,
  })),

  throwDecoy: () => set({ decoyMode: false, inventory: [] }),

  setIntroActive: (v) => set({ introActive: v }),
  setRelaxActive: (v) => set({ relaxActive: v }),
}));
