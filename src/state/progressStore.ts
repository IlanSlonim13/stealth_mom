import { create } from "zustand";

interface ProgressState {
  completedLevels: Set<number>;
  adFree: boolean;

  markComplete: (levelId: number) => void;
  setAdFree: (value: boolean) => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  completedLevels: new Set(),
  adFree: false,

  markComplete: (levelId) =>
    set((s) => ({ completedLevels: new Set([...s.completedLevels, levelId]) })),

  setAdFree: (adFree) => set({ adFree }),
}));
