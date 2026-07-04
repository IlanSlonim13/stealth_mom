/**
 * Difficulty floor check: asserts every level's shortest start→goal path
 * is actually threatened by at least one hazard — i.e. you can't beeline
 * to the goal without ever entering danger. Run with:
 *
 *   npx esbuild scripts/check-difficulty.mjs --bundle --format=esm \
 *     --platform=node --outfile=/tmp/check-difficulty.mjs \
 *   && node /tmp/check-difficulty.mjs
 */

import { LEVELS } from "../src/world/levels/index";
import { findPath } from "../src/pathfinding/Pathfinder";
import { NPC_PARAMS } from "../src/utils/constants";

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** Sample points every 0.5 tiles along a patrol loop. */
function patrolSamples(patrol) {
  const pts = [];
  for (let i = 0; i < patrol.length; i++) {
    const [ax, az] = patrol[i];
    const [bx, bz] = patrol[(i + 1) % patrol.length];
    const d = dist(ax, az, bx, bz);
    const steps = Math.max(1, Math.ceil(d / 0.5));
    for (let s = 0; s <= steps; s++) {
      pts.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
    }
    if (patrol.length === 2 && i === 0) break; // back-and-forth: one leg is enough
  }
  return pts;
}

let failures = 0;

for (const lvl of LEVELS) {
  const [sx, sz] = lvl.start;
  const path = findPath(sx, sz, lvl.goal.x, lvl.goal.z, lvl.blocked, lvl.grid.w, lvl.grid.h);
  if (!path) {
    console.log(`✗ ${lvl.id} ${lvl.name}: NO PATH (validation should have caught this)`);
    failures++;
    continue;
  }

  const threats = new Set();
  for (const tile of path) {
    // (a) sound-radius NPCs — anywhere along their stroll (cats patrol!)
    for (const n of lvl.npcs) {
      if (n.type === "dog" || n.type === "cat") {
        const r = n.radius ?? NPC_PARAMS[n.type].radius;
        const pts = n.patrol ? patrolSamples(n.patrol) : [[n.x, n.z]];
        if (pts.some(([px, pz]) => dist(tile.x, tile.z, px, pz) < r + 0.5)) {
          threats.add(`${n.type} radius`);
        }
      }
    }
    // (b) vision NPCs anywhere on their patrol
    for (const n of lvl.npcs) {
      if (n.type === "toddler" || n.type === "husband") {
        const range = n.range ?? NPC_PARAMS[n.type].range;
        const pts = n.patrol ? patrolSamples(n.patrol) : [[n.x, n.z]];
        if (pts.some(([px, pz]) => dist(tile.x, tile.z, px, pz) < range)) {
          threats.add(`${n.type} vision`);
        }
      }
    }
    // (c) traps on/near the path
    for (const [tx, tz] of lvl.traps ?? []) {
      if (dist(tile.x, tile.z, tx, tz) < 0.6) threats.add("trap");
    }
  }

  const ok = threats.size > 0;
  if (!ok) {
    failures++;
    console.log(`   route: ${path.map((t) => `${t.x},${t.z}`).join(" ")}`);
  }
  console.log(
    `${ok ? "✓" : "✗"} ${String(lvl.id).padStart(2)} ${lvl.name.padEnd(18)} ` +
    `path ${String(path.length).padStart(3)} tiles — ` +
    (ok ? `threatened by: ${[...threats].join(", ")}` : "SAFE BEELINE — needs a hazard on the short route"),
  );
}

if (failures > 0) {
  console.error(`\n${failures} level(s) failed the difficulty floor.`);
  process.exit(1);
}
console.log("\nAll levels have a threatened shortest path.");
