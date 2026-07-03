/**
 * The level registry. To add a level: write a `LevelSpec` (≈60 lines of
 * declarative data — rooms, furniture, NPCs, tokens, relax scene) and add
 * it to SPECS. `buildLevel` compiles + validates it at load; a broken
 * layout (unreachable goal, token inside a wall, ...) throws immediately.
 */

import { buildLevel } from "../builder";
import type { LevelData } from "../types";
import { level01, level02, level03, level04, level05 } from "./levels01to05";
import { level06, level07, level08, level09, level10 } from "./levels06to10";
import { level11, level12, level13, level14, level15 } from "./levels11to15";

const SPECS = [
  level01, level02, level03, level04, level05,
  level06, level07, level08, level09, level10,
  level11, level12, level13, level14, level15,
];

export const LEVELS: LevelData[] = SPECS.map(buildLevel);
