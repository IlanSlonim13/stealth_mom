/** All the humor lives here so it's easy to punch up. */

export const BABY_TALK = ["mama?", "MAMA!", "cookie?", "up! up!", "no nap!", "mine!", "uh oh"];

export const DAD_THOUGHTS = [
  "where's the remote…",
  "did I eat lunch?",
  "one more episode",
  "5:30 is basically dinner",
  "I should make a spreadsheet",
  "is the grill clean?",
];

export const CAT_THOUGHTS = ["…", "mrrp", "feed me", "not your chair"];

export const PROP_FEEDBACK: Record<string, string[]> = {
  wine:       ["Momma needed her bottle", "*happy sigh*", "Don't judge the pour"],
  cheese:     ["That's some Goud-a cheese!", "*chef's kiss*", "Brie mine forever"],
  coffee:     ["Still hot. STILL HOT!", "*sluuurp*", "Liquid patience"],
  book:       ["Chapter 1. Again. Finally.", "*page flip*", "Shhh, plot twist"],
  bath:       ["*bubbles*", "Pruney and proud", "Do not perceive me"],
  phone:      ["*scroll scroll*", "93 notifications. Bliss.", "Just checking one thing…"],
  chocolate:  ["*mmmm*", "Emergency rations", "They'll never find the wrapper"],
  headphones: ["*podcast on*", "Volume: 100%. World: 0%", "Lo-fi beats to hide to"],
  teapot:     ["*steep steep*", "Chamomile of champions", "*sip*"],
  package:    ["*riiip*", "Best delivery ever", "*pop pop pop*"],
};

export const WIN_TAGLINES = [
  "Silence achieved. Momentarily.",
  "The yoga pants were worth every penny.",
  "Mom: 1. Chaos: 0. (For now.)",
  "Sanctuary status: REACHED.",
  "They'll never know you were here.",
  "Stealth level: parental.",
];

export const CAUGHT_BY: Record<string, string[]> = {
  dog: [
    "The tail thumping woke everyone up.",
    "He just wanted a walk. At maximum volume.",
    "BORK. BORK BORK BORK.",
  ],
  toddler: [
    "\"MOMMY WHATCHA DOOOOING?\"",
    "Tiny footsteps. Maximum consequences.",
    "She told her brother. He told everyone.",
  ],
  husband: [
    "\"Oh hey babe, have you seen my keys?\"",
    "\"While you're up, can you…\"",
    "He just wanted to show you a meme.",
  ],
  cat: [
    "The cat screamed. For no reason. As cats do.",
    "You stepped near HIS floor.",
    "MRRROWWW. Everyone's awake now.",
  ],
  trap: [
    "SQUEAK. The giraffe. Your old nemesis.",
    "That toy has been waiting for this moment.",
    "One squeak. Three children awake. Physics.",
  ],
};

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
