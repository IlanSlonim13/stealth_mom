import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProgressState {
  /** levelId → best star count (0-3). Presence means completed. */
  stars: Record<number, number>;
  markComplete: (levelId: number, stars: number) => void;
  isCompleted: (levelId: number) => boolean;
  /** Level is playable if it's the first, or the previous one is done. */
  isUnlocked: (levelId: number) => boolean;
  totalStars: () => number;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      stars: {},

      markComplete: (levelId, stars) =>
        set((s) => ({
          stars: { ...s.stars, [levelId]: Math.max(s.stars[levelId] ?? 0, stars) },
        })),

      isCompleted: (levelId) => levelId in get().stars,
      isUnlocked: (levelId) => levelId === 1 || (levelId - 1) in get().stars,
      totalStars: () => Object.values(get().stars).reduce((a, b) => a + b, 0),
    }),
    { name: "stealth-mom-progress" },
  ),
);
