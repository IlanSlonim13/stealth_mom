export interface RelaxItem {
  id: string;
  emoji: string;
  /** Feedback shown briefly after clicking. */
  clickEmoji: string;
  /** If true, item fades out after first click. */
  consumable?: boolean;
}

export interface RelaxDef {
  bgGradient: string;
  momQuote: string;
  items: RelaxItem[];
  /** "3d" = full 3D interactive scene (level 1), "overlay" = emoji overlay (default) */
  sceneMode?: "3d" | "overlay";
}

export const RELAX_DATA: Record<number, RelaxDef> = {
  1: {
    bgGradient: "radial-gradient(circle, #2A1A2A 0%, #1A0A1A 100%)",
    momQuote: "Aaah... finally.",
    sceneMode: "3d",
    items: [
      { id: "wine", emoji: "\uD83C\uDF77", clickEmoji: "*sip*" },
      { id: "cheese1", emoji: "\uD83E\uDDC0", clickEmoji: "*mmm*", consumable: true },
      { id: "cheese2", emoji: "\uD83E\uDDC0", clickEmoji: "*mmm*", consumable: true },
      { id: "crackers", emoji: "\uD83C\uDF6A", clickEmoji: "*crunch*", consumable: true },
    ],
  },
  2: {
    bgGradient: "radial-gradient(circle, #1A2A3A 0%, #0A1520 100%)",
    momQuote: "Pure. Bliss.",
    items: [
      { id: "jets", emoji: "\uD83D\uDEC1", clickEmoji: "*bubbles*" },
      { id: "speaker", emoji: "\uD83C\uDFB5", clickEmoji: "*music plays*" },
      { id: "duck", emoji: "\uD83E\uDD86", clickEmoji: "*squeak*" },
      { id: "candle", emoji: "\uD83D\uDD6F\uFE0F", clickEmoji: "*flicker*" },
    ],
  },
  3: {
    bgGradient: "radial-gradient(circle, #2A1A10 0%, #150A05 100%)",
    momQuote: "Worth every sneaky step.",
    items: [
      { id: "choc1", emoji: "\uD83C\uDF6B", clickEmoji: "*mmmm*", consumable: true },
      { id: "choc2", emoji: "\uD83C\uDF6B", clickEmoji: "*so good*", consumable: true },
      { id: "choc3", emoji: "\uD83C\uDF6B", clickEmoji: "*heaven*", consumable: true },
      { id: "tea", emoji: "\u2615", clickEmoji: "*sip*" },
    ],
  },
  4: {
    bgGradient: "radial-gradient(circle, #1A1A2A 0%, #0A0A15 100%)",
    momQuote: "93 unread notifications. Heaven.",
    items: [
      { id: "phone", emoji: "\uD83D\uDCF1", clickEmoji: "*scroll scroll*" },
      { id: "charger", emoji: "\uD83D\uDD0C", clickEmoji: "*charging...*" },
      { id: "earbuds", emoji: "\uD83C\uDFA7", clickEmoji: "*podcast on*" },
    ],
  },
  5: {
    bgGradient: "radial-gradient(circle, #2A2010 0%, #151005 100%)",
    momQuote: "Best delivery ever.",
    items: [
      { id: "package", emoji: "\uD83D\uDCE6", clickEmoji: "*riiip*", consumable: true },
      { id: "bubblewrap", emoji: "\uD83D\uDDD2\uFE0F", clickEmoji: "*pop pop pop*" },
      { id: "gift", emoji: "\uD83C\uDF81", clickEmoji: "*gasp!*" },
    ],
  },
};
