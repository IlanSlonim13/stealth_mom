const RANDOM_WIN_TAGLINES = [
  "Silence achieved. Momentarily.",
  "The yoga pants were worth every penny.",
  "Mom: 1. Chaos: 0. (For now.)",
  "Sanctuary status: REACHED.",
  "They'll never know you were here.",
];

export function randomTagline(): string {
  return RANDOM_WIN_TAGLINES[Math.floor(Math.random() * RANDOM_WIN_TAGLINES.length)];
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
