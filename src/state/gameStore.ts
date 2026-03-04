import { create } from "zustand";
import { LEVELS } from "../world/levels";
import { INTRO_DURATION_MS } from "../utils/constants";

export type Screen = "menu" | "intro" | "game" | "caught" | "win";
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

  startLevel: (idx: number) => void;
  setScreen: (screen: Screen) => void;
  setCaughtLine: (line: string) => void;
  setWinText: (text: string) => void;
  setDecoyMode: (mode: DecoyMode) => void;
  useDecoy: () => void;
  setNearPickup: (item: string | null) => void;
  pickUpDecoy: (itemName: string) => void;
  throwDecoy: () => void;
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

  startLevel: (idx) => {
    set({
      levelIdx: idx,
      screen: "intro",
      decoyMode: false,
      decoysLeft: LEVELS[idx].decoys ?? 0,
      inventory: [],
      nearPickup: null,
      caughtLine: "",
      winText: "",
    });
    setTimeout(() => set({ screen: "game" }), INTRO_DURATION_MS);
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
}));
