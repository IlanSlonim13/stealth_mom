/**
 * Level compiler. Authors write a compact declarative `LevelSpec`;
 * `buildLevel` turns rooms + wall segments + doors into tile data and
 * validates the level is actually playable (start→goal path exists,
 * every token/trap/hiding spot sits on reachable floor, decoy sources
 * resolve, ...). Validation throws at module load, so a broken level
 * is impossible to ship silently.
 */

import type { LevelSpec, LevelData, WallSeg } from "./types";
import { findPath } from "../pathfinding/Pathfinder";
import { THEMES } from "./themes";

const key = (x: number, z: number) => `${x},${z}`;

function segTiles([x1, z1, x2, z2]: WallSeg): [number, number][] {
  const tiles: [number, number][] = [];
  const dx = Math.sign(x2 - x1);
  const dz = Math.sign(z2 - z1);
  if (dx !== 0 && dz !== 0) {
    throw new Error(`Wall segment must be axis-aligned: [${x1},${z1} → ${x2},${z2}]`);
  }
  let x = x1, z = z1;
  for (;;) {
    tiles.push([x, z]);
    if (x === x2 && z === z2) break;
    x += dx; z += dz;
  }
  return tiles;
}

export function buildLevel(spec: LevelSpec): LevelData {
  const { grid } = spec;
  const fail = (msg: string): never => {
    throw new Error(`Level ${spec.id} "${spec.name}": ${msg}`);
  };

  if (!THEMES[spec.theme]) fail(`unknown theme "${spec.theme}"`);

  // ── Walls from room perimeters + explicit segments ───────────────────────
  const wallSet = new Set<string>();
  for (const r of spec.rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      wallSet.add(key(x, r.z));
      wallSet.add(key(x, r.z + r.h - 1));
    }
    for (let z = r.z; z < r.z + r.h; z++) {
      wallSet.add(key(r.x, z));
      wallSet.add(key(r.x + r.w - 1, z));
    }
  }
  for (const seg of spec.walls ?? []) {
    for (const [x, z] of segTiles(seg)) wallSet.add(key(x, z));
  }

  // ── Interior floor ────────────────────────────────────────────────────────
  const floorTiles = new Set<string>();
  for (const r of spec.rooms) {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      for (let z = r.z + 1; z < r.z + r.h - 1; z++) {
        if (!wallSet.has(key(x, z))) floorTiles.add(key(x, z));
      }
    }
  }

  // ── Carve doors ───────────────────────────────────────────────────────────
  const doorTiles: [number, number][] = [];
  for (const [x, z] of spec.doors ?? []) {
    if (!wallSet.has(key(x, z))) fail(`door at ${x},${z} is not on a wall`);
    wallSet.delete(key(x, z));
    doorTiles.push([x, z]);
    floorTiles.add(key(x, z));
  }

  const wallTiles: [number, number][] = [...wallSet].map((k) => {
    const [x, z] = k.split(",").map(Number);
    return [x, z];
  });

  // ── Windows must be on walls ──────────────────────────────────────────────
  for (const [x, z] of spec.windows ?? []) {
    if (!wallSet.has(key(x, z))) fail(`window at ${x},${z} is not on a wall`);
  }

  // ── Blocked = walls + furniture footprints ────────────────────────────────
  const blocked = new Set<string>(wallSet);
  const labels = new Set<string>();
  for (const f of spec.furniture) {
    if (f.label) {
      if (labels.has(f.label)) fail(`duplicate furniture label "${f.label}"`);
      labels.add(f.label);
    }
    if (f.walkable) continue;
    for (let dx = 0; dx < f.w; dx++) {
      for (let dz = 0; dz < f.h; dz++) {
        blocked.add(key(f.x + dx, f.z + dz));
      }
    }
  }

  // ── Reachability checks ───────────────────────────────────────────────────
  const walkable = (x: number, z: number) =>
    floorTiles.has(key(x, z)) && !blocked.has(key(x, z));

  const [sx, sz] = spec.start;
  if (!walkable(sx, sz)) fail(`start ${sx},${sz} is not walkable`);
  if (!walkable(spec.goal.x, spec.goal.z)) fail(`goal ${spec.goal.x},${spec.goal.z} is not walkable`);

  const reach = (x: number, z: number, what: string) => {
    if (!walkable(x, z)) fail(`${what} at ${x},${z} is not walkable`);
    if (!findPath(sx, sz, x, z, blocked, grid.w, grid.h)) {
      fail(`${what} at ${x},${z} is unreachable from start`);
    }
  };

  reach(spec.goal.x, spec.goal.z, "goal");
  spec.tokens.forEach((t, i) => reach(t.x, t.z, `token #${i + 1} (${t.type})`));
  (spec.traps ?? []).forEach(([x, z], i) => {
    if (!floorTiles.has(key(x, z))) fail(`trap #${i + 1} at ${x},${z} is not on floor`);
  });
  (spec.hidingSpots ?? []).forEach(([x, z], i) => reach(x, z, `hiding spot #${i + 1}`));

  for (const d of spec.decoyItems ?? []) {
    if (!spec.furniture.some((f) => f.label === d.sourceLabel && f.hasDecoy)) {
      fail(`decoy "${d.itemName}" needs furniture labelled "${d.sourceLabel}" with hasDecoy`);
    }
  }

  for (const n of spec.npcs) {
    if (wallSet.has(key(Math.round(n.x), Math.round(n.z)))) {
      fail(`npc ${n.type} at ${n.x},${n.z} is inside a wall`);
    }
    for (const [px, pz] of n.patrol ?? []) {
      if (wallSet.has(key(Math.round(px), Math.round(pz)))) {
        fail(`npc ${n.type} patrol point ${px},${pz} is inside a wall`);
      }
    }
  }

  if (spec.tokens.length !== 3) fail(`levels need exactly 3 tokens (got ${spec.tokens.length})`);

  const { rooms: _r, walls: _w, doors: _d, ...rest } = spec;
  return { ...rest, wallTiles, doorTiles, floorTiles, blocked };
}
