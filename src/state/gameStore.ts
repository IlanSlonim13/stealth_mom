import { create } from "zustand";

export type Screen = "menu" | "game" | "caught";

interface GameState {
  screen: Screen;
  levelIdx: number;
  caughtLine: string;
  tokens: number;          // me-time tokens collected this run (0-3)
  heldItem: string | null; // decoy item currently carried
  throwMode: boolean;
  nearPickup: string | null;
  introActive: boolean;
  relaxActive: boolean;    // win scene playing (overlay visible)

  startLevel: (idx: number) => void;
  setScreen: (screen: Screen) => void;
  setCaughtLine: (line: string) => void;
  setTokens: (n: number) => void;
  setHeldItem: (item: string | null) => void;
  setThrowMode: (v: boolean) => void;
  setNearPickup: (item: string | null) => void;
  setIntroActive: (v: boolean) => void;
  setRelaxActive: (v: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  screen: "menu",
  levelIdx: 0,
  caughtLine: "",
  tokens: 0,
  heldItem: null,
  throwMode: false,
  nearPickup: null,
  introActive: false,
  relaxActive: false,

  startLevel: (idx) => set({
    levelIdx: idx,
    screen: "game",
    introActive: true,
    relaxActive: false,
    tokens: 0,
    heldItem: null,
    throwMode: false,
    nearPickup: null,
    caughtLine: "",
  }),

  setScreen: (screen) => set({ screen }),
  setCaughtLine: (caughtLine) => set({ caughtLine }),
  setTokens: (tokens) => set({ tokens }),
  setHeldItem: (heldItem) => set({ heldItem }),
  setThrowMode: (throwMode) => set({ throwMode }),
  setNearPickup: (nearPickup) => set({ nearPickup }),
  setIntroActive: (introActive) => set({ introActive }),
  setRelaxActive: (relaxActive) => set({ relaxActive }),
}));
