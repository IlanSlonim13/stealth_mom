/**
 * Monument Valley-inspired palettes. Each level references one theme.
 * Rules of thumb: analogous pastels for the architecture, one saturated
 * accent for interactive things, sky gradient sets the mood.
 */

export interface Theme {
  /** CSS sky gradient stops, top → bottom. */
  sky: [string, string, string];
  plinthSide: string;   // diorama base sides
  plinthEdge: string;   // thin rim under the floor
  floorA: string;
  floorB: string;
  wall: string;         // tall back walls
  wallLow: string;      // front lip walls
  wallTrim: string;     // baseboard + cap trim
  windowGlow: string;   // emissive window panes
  rug: string;
  rugTrim: string;
  wood: string;         // furniture wood
  woodDark: string;
  fabric: string;       // upholstery
  fabricAlt: string;
  metal: string;
  accent: string;       // goal / taps / interactive glow
  ambient: string;      // ambient light tint
  dirLight: string;     // key light tint
  outfitTop: string;    // Mom
  outfitPants: string;
  hair: string;
  uiText: string;       // HUD text over this sky
}

export const THEMES: Record<string, Theme> = {
  // 1 — dusk living room, rose & terracotta
  roseDusk: {
    sky: ["#F7CDA8", "#E29AA6", "#9E6B9E"],
    plinthSide: "#7C4E72", plinthEdge: "#5E3A58",
    floorA: "#EDBE93", floorB: "#E5B287",
    wall: "#F7E3CC", wallLow: "#EACBAE", wallTrim: "#D9A98C",
    windowGlow: "#FFE9B8",
    rug: "#C96F7B", rugTrim: "#A85567",
    wood: "#A96A48", woodDark: "#7E4A34", fabric: "#D96E7F", fabricAlt: "#EFA48F",
    metal: "#8C7A6B", accent: "#E4506B",
    ambient: "#FFE4CE", dirLight: "#FFF3E4",
    outfitTop: "#F2E3C8", outfitPants: "#7C3D4E", hair: "#5A3826",
    uiText: "#4A2440",
  },
  // 2 — first light kitchen, mint & cream
  mintDawn: {
    sky: ["#DFF3E4", "#AEDFD2", "#7FB8C4"],
    plinthSide: "#4E7E88", plinthEdge: "#3A626C",
    floorA: "#EFEADB", floorB: "#E5DFCE",
    wall: "#F5F1E4", wallLow: "#DFE7D8", wallTrim: "#B9CFBB",
    windowGlow: "#FFF4C8",
    rug: "#8FBFAE", rugTrim: "#6FA491",
    wood: "#C89B6E", woodDark: "#96714C", fabric: "#7FB69F", fabricAlt: "#B3D8C6",
    metal: "#9AA8AC", accent: "#E88A4E",
    ambient: "#EAF6EC", dirLight: "#FFFBEA",
    outfitTop: "#E88A6E", outfitPants: "#3E5E5A", hair: "#4A3220",
    uiText: "#23504E",
  },
  // 3 — bathroom lagoon, aqua & lilac
  lagoon: {
    sky: ["#BFE8EF", "#98C4E4", "#8E8BC9"],
    plinthSide: "#5E5B9E", plinthEdge: "#47447C",
    floorA: "#D9E9E4", floorB: "#CCE0DA",
    wall: "#E9F2EE", wallLow: "#CFE3E1", wallTrim: "#9FC6C9",
    windowGlow: "#DFF7FF",
    rug: "#9F94CF", rugTrim: "#7F74B4",
    wood: "#B7987A", woodDark: "#8A6E52", fabric: "#7FAECF", fabricAlt: "#A8CFE0",
    metal: "#A8B4BC", accent: "#4EA8C9",
    ambient: "#E4F2F4", dirLight: "#F4FBFF",
    outfitTop: "#A8CFE0", outfitPants: "#4E6E8E", hair: "#6E4A2E",
    uiText: "#2E3E6E",
  },
  // 4 — nursery afternoon, butter & sage
  nurseryNoon: {
    sky: ["#FBEFC4", "#EFD3A8", "#C9A0A0"],
    plinthSide: "#96686E", plinthEdge: "#744E54",
    floorA: "#F2E2C4", floorB: "#EAD7B6",
    wall: "#FAF0DA", wallLow: "#EEDFC0", wallTrim: "#D4B98E",
    windowGlow: "#FFF8D4",
    rug: "#A8BE8E", rugTrim: "#8AA470",
    wood: "#C09468", woodDark: "#8E6A48", fabric: "#E0A874", fabricAlt: "#F0CB9E",
    metal: "#9E9284", accent: "#D9744E",
    ambient: "#FBF2DC", dirLight: "#FFF9E8",
    outfitTop: "#8EA878", outfitPants: "#6E5E52", hair: "#3E2A1C",
    uiText: "#5E4430",
  },
  // 5 — pantry heist, honey & plum
  honeyPlum: {
    sky: ["#F4D8A4", "#DCA88A", "#8E5E88"],
    plinthSide: "#6E4468", plinthEdge: "#54334E",
    floorA: "#E8C89A", floorB: "#DFBC8C",
    wall: "#F4E4C4", wallLow: "#E4CCA4", wallTrim: "#C9A474",
    windowGlow: "#FFE9B0",
    rug: "#B4788E", rugTrim: "#985E76",
    wood: "#A87448", woodDark: "#7C5232", fabric: "#C9843E", fabricAlt: "#E0AC6A",
    metal: "#8E7E6E", accent: "#C94E6E",
    ambient: "#FBE9CC", dirLight: "#FFF3DC",
    outfitTop: "#5E3A56", outfitPants: "#2E2E3A", hair: "#4E3422",
    uiText: "#4E2E48",
  },
  // 6 — study at golden hour, olive & amber
  goldenStudy: {
    sky: ["#F2D9A0", "#D9A878", "#946E64"],
    plinthSide: "#6E5244", plinthEdge: "#523C30",
    floorA: "#D9B488", floorB: "#CFA87C",
    wall: "#EDE0C0", wallLow: "#DCC49C", wallTrim: "#B49468",
    windowGlow: "#FFE4A0",
    rug: "#8E9464", rugTrim: "#6E744A",
    wood: "#8E5E3A", woodDark: "#68432A", fabric: "#A4744E", fabricAlt: "#C4986E",
    metal: "#7C6E5C", accent: "#D9843A",
    ambient: "#F4E4C4", dirLight: "#FFEECC",
    outfitTop: "#C4986E", outfitPants: "#4E4438", hair: "#2E2018",
    uiText: "#54402C",
  },
  // 7 — playroom pop, coral & sky
  playPop: {
    sky: ["#C9E8F4", "#F4CFC4", "#E89AA4"],
    plinthSide: "#B46E78", plinthEdge: "#8E525C",
    floorA: "#F4E8D4", floorB: "#ECDCC4",
    wall: "#FBF2E0", wallLow: "#F0DCC8", wallTrim: "#E0A88E",
    windowGlow: "#FFF4D0",
    rug: "#74B4C9", rugTrim: "#549AB4",
    wood: "#D98E68", woodDark: "#A86848", fabric: "#E86E74", fabricAlt: "#F4A88E",
    metal: "#98A4AC", accent: "#F08A3E",
    ambient: "#FDF0E4", dirLight: "#FFF8EC",
    outfitTop: "#4E8EA8", outfitPants: "#3A3A48", hair: "#54341E",
    uiText: "#7C3A44",
  },
  // 8 — living room at blue hour, indigo & ember
  blueHour: {
    sky: ["#8E9EC9", "#6E74AC", "#44406E"],
    plinthSide: "#3A3458", plinthEdge: "#2A2542",
    floorA: "#B49AA0", floorB: "#A88E94",
    wall: "#D4C4CC", wallLow: "#BCA8B4", wallTrim: "#94789E",
    windowGlow: "#FFD98E",
    rug: "#5E6E9E", rugTrim: "#485684",
    wood: "#7C5A54", woodDark: "#5C403C", fabric: "#8E6E9E", fabricAlt: "#B494B4",
    metal: "#6E6E84", accent: "#F4A44E",
    ambient: "#C9C4E0", dirLight: "#E4D4E8",
    outfitTop: "#E0C9A8", outfitPants: "#54445E", hair: "#3A281C",
    uiText: "#EFE4F4",
  },
  // 9 — laundry steam, powder blue & white
  powder: {
    sky: ["#E4F0F4", "#BCD4E4", "#94A8CF"],
    plinthSide: "#5E74A4", plinthEdge: "#485A84",
    floorA: "#E0E8EC", floorB: "#D4DEE4",
    wall: "#F0F4F4", wallLow: "#D8E4E8", wallTrim: "#A8C0CC",
    windowGlow: "#FFF8E0",
    rug: "#7C94B4", rugTrim: "#5E7898",
    wood: "#B49A80", woodDark: "#8A7258", fabric: "#6E94B4", fabricAlt: "#9EBCD4",
    metal: "#8E9AA4", accent: "#E87C6E",
    ambient: "#ECF4F8", dirLight: "#FBFDFF",
    outfitTop: "#E87C6E", outfitPants: "#44546E", hair: "#5E3E28",
    uiText: "#34486E",
  },
  // 10 — nursery dusk, lavender & peach
  lavenderDusk: {
    sky: ["#E8C4D4", "#B99AC9", "#6E6494"],
    plinthSide: "#54487C", plinthEdge: "#3E3460",
    floorA: "#D9C4C9", floorB: "#CEB6BE",
    wall: "#EDE0E4", wallLow: "#D9C4CE", wallTrim: "#B494A8",
    windowGlow: "#FFE0B4",
    rug: "#9484BC", rugTrim: "#7668A0",
    wood: "#9A7460", woodDark: "#745442", fabric: "#B47C94", fabricAlt: "#D4A4B4",
    metal: "#847C8C", accent: "#E8848E",
    ambient: "#E8DCE8", dirLight: "#F4E8E0",
    outfitTop: "#D4A4B4", outfitPants: "#4E4460", hair: "#44301E",
    uiText: "#F4ECF4",
  },
  // 11 — playroom lamplight, teal & marigold
  lamplight: {
    sky: ["#748EA4", "#54687C", "#343E54"],
    plinthSide: "#2C3444", plinthEdge: "#202634",
    floorA: "#C4AC8E", floorB: "#B8A082",
    wall: "#DCCCB4", wallLow: "#C4B098", wallTrim: "#9E8468",
    windowGlow: "#FFD478",
    rug: "#3E7C84", rugTrim: "#2E626A",
    wood: "#8E6444", woodDark: "#684830", fabric: "#D9A040", fabricAlt: "#E8BC6E",
    metal: "#6E7078", accent: "#F0A83A",
    ambient: "#C9C4B4", dirLight: "#F4E0BC",
    outfitTop: "#3E7C84", outfitPants: "#3A3430", hair: "#2E2014",
    uiText: "#EFE8D4",
  },
  // 12 — dining at night, wine & gold
  wineNight: {
    sky: ["#8E5E74", "#5E3A5E", "#2E1E3E"],
    plinthSide: "#3A1E38", plinthEdge: "#2A142A",
    floorA: "#A87C6E", floorB: "#9C7062",
    wall: "#CCA898", wallLow: "#B08E80", wallTrim: "#8E6454",
    windowGlow: "#FFCE8E",
    rug: "#7C3E54", rugTrim: "#642E44",
    wood: "#6E4434", woodDark: "#502F24", fabric: "#943E54", fabricAlt: "#B4607144",
    metal: "#7C6E64", accent: "#E8B44E",
    ambient: "#D9B4A8", dirLight: "#F4D4B4",
    outfitTop: "#4E2438", outfitPants: "#2A2030", hair: "#3E2A1A",
    uiText: "#F4E4D4",
  },
  // 13 — library rain, sage & slate
  rainLibrary: {
    sky: ["#B4C4C4", "#8EA0AC", "#5E6E84"],
    plinthSide: "#44546A", plinthEdge: "#344050",
    floorA: "#C0B49A", floorB: "#B4A88E",
    wall: "#DCD4BC", wallLow: "#C4BCA4", wallTrim: "#9A9478",
    windowGlow: "#DCE8E4",
    rug: "#6E8474", rugTrim: "#566C5C",
    wood: "#7C5C40", woodDark: "#5C422C", fabric: "#748E7C", fabricAlt: "#9CB4A0",
    metal: "#74787C", accent: "#C97C4E",
    ambient: "#D9DED4", dirLight: "#ECF0E4",
    outfitTop: "#9CB4A0", outfitPants: "#4A4A44", hair: "#54381E",
    uiText: "#2E3E44",
  },
  // 14 — midnight kitchen, ink & neon fridge glow
  midnight: {
    sky: ["#3E4468", "#2A2E4E", "#141628"],
    plinthSide: "#1A1C30", plinthEdge: "#121422",
    floorA: "#5E6484", floorB: "#545A78",
    wall: "#787EA0", wallLow: "#62688A", wallTrim: "#4A4E6E",
    windowGlow: "#9EB4FF",
    rug: "#3E4E74", rugTrim: "#2E3C5E",
    wood: "#54486A", woodDark: "#3E3450", fabric: "#4E5E8E", fabricAlt: "#6E7EA8",
    metal: "#5E6478", accent: "#7EC9C4",
    ambient: "#8E94C4", dirLight: "#B4C4E8",
    outfitTop: "#C4CCE8", outfitPants: "#3A3E58", hair: "#2A2018",
    uiText: "#DCE4FF",
  },
  // 15 — front porch sunrise, gold & blush
  sunrise: {
    sky: ["#FBE4B4", "#F4B494", "#C97C94"],
    plinthSide: "#94566E", plinthEdge: "#744054",
    floorA: "#EFD4AC", floorB: "#E6C89E",
    wall: "#FBEED4", wallLow: "#EED8B8", wallTrim: "#D4AC84",
    windowGlow: "#FFF0C4",
    rug: "#D98E74", rugTrim: "#BC7460",
    wood: "#B48054", woodDark: "#8A5E3C", fabric: "#E89474", fabricAlt: "#F4BC94",
    metal: "#948474", accent: "#E8604E",
    ambient: "#FDEED8", dirLight: "#FFF6E4",
    outfitTop: "#F4E0C4", outfitPants: "#8E4E5E", hair: "#4E3421",
    uiText: "#6E3444",
  },
};

export function getTheme(name: string): Theme {
  const t = THEMES[name];
  if (!t) throw new Error(`Unknown theme "${name}"`);
  return t;
}
