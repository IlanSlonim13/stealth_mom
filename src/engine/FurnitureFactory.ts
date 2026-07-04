/**
 * Furniture mesh registry. Each builder gets a footprint in tiles
 * (lw × lh, already un-rotated), the theme, and an optional tint, and
 * returns a group centered on the footprint, feet at y=0, facing +z.
 *
 * To add a shape: add its name to FurnitureShape in world/types.ts and
 * register a builder here — levels can use it immediately.
 */

import * as THREE from "three";
import type { FurnitureDef, FurnitureShape } from "../world/types";
import type { Theme } from "../world/themes";
import { TILE_SIZE } from "../utils/constants";
import { box, rbox, cyl, sphere, mat, shade } from "./helpers";

const TS = TILE_SIZE;

type Builder = (lw: number, lh: number, t: Theme, tint?: string) => THREE.Group;

const g = () => new THREE.Group();

/** Simple slab + four legs, reused by tables/desks/benches. */
function legged(
  w: number, d: number, topY: number, topThick: number,
  topColor: string, legColor: string, legR = 0.02,
): THREE.Group {
  const grp = g();
  grp.add(rbox(w, topThick, d, topColor, 0, topY - topThick / 2, 0, 0.02));
  const ix = w / 2 - 0.05;
  const iz = d / 2 - 0.05;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    grp.add(cyl(legR, legR * 0.8, topY - topThick, legColor, sx * ix, (topY - topThick) / 2, sz * iz, 10));
  }
  return grp;
}

const BUILDERS: Record<FurnitureShape, Builder> = {
  couch: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    const col = tint ?? t.fabric;
    grp.add(rbox(w, 0.1, d, shade(col, -0.15), 0, 0.08, 0, 0.03));           // base
    grp.add(rbox(w, 0.2, 0.09, shade(col, -0.05), 0, 0.2, -d / 2 + 0.05));   // back
    grp.add(rbox(0.08, 0.13, d, shade(col, -0.05), -w / 2 + 0.04, 0.19, 0)); // arms
    grp.add(rbox(0.08, 0.13, d, shade(col, -0.05), w / 2 - 0.04, 0.19, 0));
    const seats = Math.max(2, Math.round(lw / 2));
    const sw = (w - 0.18) / seats;
    for (let i = 0; i < seats; i++) {
      grp.add(rbox(sw - 0.015, 0.06, d - 0.13, col, -w / 2 + 0.09 + sw * (i + 0.5), 0.155, 0.02, 0.022));
      grp.add(rbox(sw - 0.02, 0.11, 0.05, shade(col, 0.08), -w / 2 + 0.09 + sw * (i + 0.5), 0.24, -d / 2 + 0.085, 0.02));
    }
    return grp;
  },

  armchair: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    const col = tint ?? t.fabricAlt;
    grp.add(rbox(w - 0.02, 0.1, d - 0.02, shade(col, -0.12), 0, 0.08, 0, 0.03));
    grp.add(rbox(w - 0.02, 0.2, 0.09, col, 0, 0.21, -d / 2 + 0.055));
    grp.add(rbox(0.075, 0.14, d - 0.06, col, -w / 2 + 0.045, 0.19, 0));
    grp.add(rbox(0.075, 0.14, d - 0.06, col, w / 2 - 0.045, 0.19, 0));
    grp.add(rbox(w - 0.2, 0.055, d - 0.15, shade(col, 0.09), 0, 0.15, 0.02, 0.02));
    return grp;
  },

  coffeeTable: (lw, lh, t, tint) =>
    legged(lw * TS - 0.03, lh * TS - 0.03, 0.14, 0.035, tint ?? t.wood, t.woodDark),

  sideTable: (lw, lh, t, tint) => {
    const grp = legged(lw * TS - 0.05, lh * TS - 0.05, 0.17, 0.03, tint ?? t.wood, t.woodDark, 0.014);
    return grp;
  },

  tv: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    grp.add(rbox(w, 0.06, lh * TS - 0.06, t.woodDark, 0, 0.03, 0, 0.02));
    const screen = box(w - 0.06, 0.26, 0.025, "#20242E", 0, 0.24, 0);
    grp.add(screen);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.1, 0.2),
      new THREE.MeshLambertMaterial({ color: "#31394A", emissive: new THREE.Color("#4A5468"), emissiveIntensity: 0.4 }),
    );
    glow.position.set(0, 0.24, 0.014);
    grp.add(glow);
    return grp;
  },

  tvUnit: (lw, lh, t, tint) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.02, 0.14, lh * TS - 0.04, tint ?? t.wood, 0, 0.07, 0, 0.02));
    grp.add(box(lw * TS - 0.12, 0.2, 0.02, "#20242E", 0, 0.28, 0));
    return grp;
  },

  bookcase: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    const col = tint ?? t.wood;
    grp.add(rbox(w, 0.56, d * 0.8, col, 0, 0.28, -d * 0.08, 0.015));
    // rows of book spines on the front face
    const bookCols = ["#C96F6F", "#6F94C9", "#C9A86F", "#7FA88E", "#9E7FB8"];
    for (let row = 0; row < 3; row++) {
      let bx = -w / 2 + 0.035;
      let i = row;
      while (bx < w / 2 - 0.05) {
        const bw = 0.022 + ((i * 37) % 3) * 0.007;
        grp.add(box(bw, 0.09 + ((i * 13) % 3) * 0.012, 0.02, bookCols[i % bookCols.length], bx + bw / 2, 0.1 + row * 0.155, d * 0.32));
        bx += bw + 0.008;
        i++;
      }
    }
    return grp;
  },

  shelf: (lw, lh, t, tint) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.02, 0.4, lh * TS - 0.03, tint ?? t.wood, 0, 0.2, 0, 0.015));
    grp.add(box(lw * TS - 0.08, 0.03, lh * TS - 0.06, shade(tint ?? t.wood, 0.15), 0, 0.42, 0));
    return grp;
  },

  plant: (lw, _lh, t) => {
    const grp = g();
    const s = lw * TS;
    grp.add(cyl(s * 0.26, s * 0.2, 0.14, "#B96F52", 0, 0.07, 0, 12));
    grp.add(sphere(s * 0.3, "#5E8A54", 0, 0.28, 0));
    grp.add(sphere(s * 0.22, "#6E9A5E", s * 0.14, 0.4, s * 0.06));
    grp.add(sphere(s * 0.18, "#557E4C", -s * 0.13, 0.42, -s * 0.05));
    return grp;
  },

  lamp: (_lw, _lh, t) => {
    const grp = g();
    grp.add(cyl(0.055, 0.07, 0.02, t.metal, 0, 0.01, 0, 14));
    grp.add(cyl(0.008, 0.008, 0.38, t.metal, 0, 0.2, 0, 8));
    const shadeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.075, 0.09, 14, 1, true),
      new THREE.MeshLambertMaterial({
        color: "#F6E7C8", emissive: new THREE.Color("#F6D89A"),
        emissiveIntensity: 0.5, side: THREE.DoubleSide,
      }),
    );
    shadeMesh.position.y = 0.42;
    grp.add(shadeMesh);
    return grp;
  },

  rugChair: (lw, lh, t, tint) => BUILDERS.armchair(lw, lh, t, tint),

  ottoman: (lw, lh, t, tint) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.04, 0.13, lh * TS - 0.04, tint ?? t.fabricAlt, 0, 0.075, 0, 0.04));
    return grp;
  },

  diningTable: (lw, lh, t, tint) =>
    legged(lw * TS - 0.05, lh * TS - 0.05, 0.24, 0.035, tint ?? t.wood, t.woodDark, 0.022),

  diningChair: (lw, lh, t, tint) => {
    const grp = g();
    const col = tint ?? t.woodDark;
    grp.add(rbox(0.15, 0.03, 0.15, tint ?? t.wood, 0, 0.15, 0, 0.012));
    grp.add(rbox(0.15, 0.2, 0.025, col, 0, 0.28, -0.0625));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      grp.add(cyl(0.011, 0.009, 0.14, col, sx * 0.06, 0.07, sz * 0.06, 8));
    }
    return grp;
  },

  kitchenIsland: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.04, 0.26, d - 0.04, tint ?? t.fabric, 0, 0.13, 0, 0.02));
    grp.add(rbox(w, 0.035, d, "#F0EBE0", 0, 0.278, 0, 0.012));
    // inset sink
    grp.add(box(0.16, 0.02, 0.12, "#C8CCD0", -w / 4, 0.292, 0));
    grp.add(cyl(0.008, 0.008, 0.08, t.metal, -w / 4 - 0.06, 0.33, 0, 8));
    return grp;
  },

  counter: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.26, d - 0.03, tint ?? shade(t.wood, 0.1), 0, 0.13, 0, 0.015));
    grp.add(rbox(w, 0.03, d, "#F0EBE0", 0, 0.275, 0, 0.01));
    // cabinet handle dots
    for (let i = 0; i < lw; i += 2) {
      grp.add(sphere(0.012, t.metal, -w / 2 + (i + 0.5) * TS, 0.18, d / 2 - 0.005, 8));
    }
    return grp;
  },

  stove: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.27, d - 0.02, "#E8E4DC", 0, 0.135, 0, 0.015));
    grp.add(box(w - 0.05, 0.012, d - 0.06, "#2E3238", 0, 0.278, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      grp.add(cyl(0.028, 0.028, 0.012, "#4A4E54", sx * w / 5, 0.288, sz * d / 5, 12));
    }
    return grp;
  },

  fridge: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    grp.add(rbox(w - 0.03, 0.6, lh * TS - 0.03, "#E4E8E8", 0, 0.3, 0, 0.03));
    grp.add(box(0.012, 0.14, 0.012, t.metal, w / 2 - 0.11, 0.42, lh * TS / 2 - 0.006));
    grp.add(box(0.012, 0.1, 0.012, t.metal, w / 2 - 0.11, 0.2, lh * TS / 2 - 0.006));
    return grp;
  },

  sink: (lw, lh, t) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.02, 0.26, lh * TS - 0.02, "#EAE6DC", 0, 0.13, 0, 0.015));
    grp.add(box(0.14, 0.02, 0.1, "#C8CCD0", 0, 0.27, 0));
    grp.add(cyl(0.008, 0.008, 0.09, t.metal, 0, 0.31, -0.05, 8));
    return grp;
  },

  cabinet: (lw, lh, t, tint) => BUILDERS.counter(lw, lh, t, tint),

  barStool: (_lw, _lh, t, tint) => {
    const grp = g();
    grp.add(cyl(0.06, 0.055, 0.035, tint ?? t.fabric, 0, 0.2, 0, 14));
    grp.add(cyl(0.012, 0.03, 0.18, t.woodDark, 0, 0.09, 0, 10));
    return grp;
  },

  bed: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.09, d - 0.02, t.woodDark, 0, 0.065, 0, 0.02));
    grp.add(rbox(w - 0.05, 0.07, d - 0.06, "#F2EEE2", 0, 0.14, 0, 0.025));
    grp.add(rbox(w - 0.05, 0.045, d * 0.62, tint ?? t.fabric, 0, 0.185, d * 0.16, 0.02));
    grp.add(rbox(w, 0.22, 0.05, t.woodDark, 0, 0.13, -d / 2 + 0.025, 0.015));
    // pillows
    grp.add(rbox(w * 0.34, 0.045, 0.11, "#FBF8F0", -w * 0.2, 0.2, -d / 2 + 0.12, 0.02));
    grp.add(rbox(w * 0.34, 0.045, 0.11, "#FBF8F0", w * 0.2, 0.2, -d / 2 + 0.12, 0.02));
    return grp;
  },

  crib: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.04, 0.05, d - 0.04, "#F6F2E6", 0, 0.14, 0, 0.02));
    const col = tint ?? shade(t.wood, 0.18);
    for (let i = 0; i <= 8; i++) {
      const x = -w / 2 + 0.03 + (i * (w - 0.06)) / 8;
      grp.add(cyl(0.008, 0.008, 0.3, col, x, 0.15, -d / 2 + 0.02, 6));
      grp.add(cyl(0.008, 0.008, 0.3, col, x, 0.15, d / 2 - 0.02, 6));
    }
    grp.add(box(w, 0.025, 0.03, col, 0, 0.3, -d / 2 + 0.02));
    grp.add(box(w, 0.025, 0.03, col, 0, 0.3, d / 2 - 0.02));
    grp.add(box(0.025, 0.16, d, col, -w / 2 + 0.0125, 0.24, 0));
    grp.add(box(0.025, 0.16, d, col, w / 2 - 0.0125, 0.24, 0));
    return grp;
  },

  toybox: (lw, lh, t, tint) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.04, 0.18, lh * TS - 0.04, tint ?? t.fabricAlt, 0, 0.09, 0, 0.025));
    grp.add(rbox(lw * TS - 0.02, 0.035, lh * TS - 0.02, shade(tint ?? t.fabricAlt, -0.15), 0, 0.2, 0, 0.012));
    grp.add(sphere(0.035, t.accent, 0, 0.1, lh * TS / 2 - 0.01));
    return grp;
  },

  toyBlocks: (lw, lh, t) => {
    const grp = g();
    const cols = [t.accent, "#6F94C9", "#7FA88E", "#C9A86F"];
    const s = 0.075;
    const positions: [number, number, number][] = [
      [-0.06, s / 2, -0.04], [0.05, s / 2, 0.03], [-0.02, s / 2, 0.08],
      [0.08, s / 2, -0.06], [-0.06, s * 1.5 - 0.005, -0.04],
    ];
    positions.forEach((p, i) => {
      const b = rbox(s, s, s, cols[i % cols.length], p[0] * (lw * TS / 0.5), p[1], p[2] * (lh * TS / 0.5), 0.012);
      b.rotation.y = (i * 0.7) % 1.2;
      grp.add(b);
    });
    return grp;
  },

  rockingChair: (lw, lh, t, tint) => {
    const grp = g();
    const col = tint ?? t.wood;
    grp.add(rbox(0.2, 0.03, 0.18, col, 0, 0.14, 0, 0.012));
    grp.add(rbox(0.2, 0.24, 0.028, col, 0, 0.28, -0.09));
    // rockers
    for (const sx of [-1, 1]) {
      const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 16, Math.PI * 0.5), mat(t.woodDark));
      rocker.rotation.set(0, Math.PI / 2, Math.PI + Math.PI / 4);
      rocker.position.set(sx * 0.09, 0.14, 0);
      rocker.castShadow = true;
      grp.add(rocker);
      grp.add(cyl(0.011, 0.011, 0.12, col, sx * 0.08, 0.075, 0.06, 8));
      grp.add(cyl(0.011, 0.011, 0.12, col, sx * 0.08, 0.075, -0.06, 8));
    }
    return grp;
  },

  dresser: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.3, d - 0.03, tint ?? t.wood, 0, 0.15, 0, 0.02));
    grp.add(rbox(w + 0.015, 0.025, d - 0.01, shade(tint ?? t.wood, 0.18), 0, 0.31, 0, 0.01));
    for (let i = 0; i < Math.max(1, Math.floor(lw / 2)); i++) {
      const x = -w / 2 + (i + 0.5) * (w / Math.max(1, Math.floor(lw / 2)));
      grp.add(sphere(0.013, t.metal, x, 0.22, d / 2 - 0.002, 8));
      grp.add(sphere(0.013, t.metal, x, 0.1, d / 2 - 0.002, 8));
    }
    return grp;
  },

  bathtub: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    const shell = "#F4F1E8";
    // base slab + four rim walls so the water is actually visible inside
    grp.add(rbox(w - 0.02, 0.1, d - 0.02, shell, 0, 0.05, 0, 0.03));
    const rimH = 0.13;
    const rimT = 0.05;
    const rimY = 0.08 + rimH / 2;
    grp.add(rbox(w - 0.02, rimH, rimT, shell, 0, rimY, -(d - 0.02) / 2 + rimT / 2, 0.02));
    grp.add(rbox(w - 0.02, rimH, rimT, shell, 0, rimY, (d - 0.02) / 2 - rimT / 2, 0.02));
    grp.add(rbox(rimT, rimH, d - 0.02, shell, -(w - 0.02) / 2 + rimT / 2, rimY, 0, 0.02));
    grp.add(rbox(rimT, rimH, d - 0.02, shell, (w - 0.02) / 2 - rimT / 2, rimY, 0, 0.02));
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.02 - rimT * 2 + 0.015, 0.02, d - 0.02 - rimT * 2 + 0.015),
      new THREE.MeshLambertMaterial({ color: "#7EC4D6", transparent: true, opacity: 0.94 }),
    );
    water.position.y = 0.16;
    grp.add(water);
    // foam patches on the water
    for (let i = 0; i < 5; i++) {
      const foam = sphere(0.018 + (i % 3) * 0.006, "#F8FBFC",
        (i / 4 - 0.5) * (w - 0.2), 0.172, ((i * 7 % 5) / 4 - 0.5) * (d - 0.24), 8);
      foam.scale.y = 0.5;
      grp.add(foam);
    }
    grp.add(cyl(0.011, 0.011, 0.1, t.metal, 0, 0.26, -d / 2 + 0.045, 8));
    const spout = box(0.02, 0.02, 0.07, t.metal, 0, 0.3, -d / 2 + 0.08);
    grp.add(spout);
    // clawfoot feet
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      grp.add(sphere(0.022, t.metal, sx * (w / 2 - 0.05), 0.012, sz * (d / 2 - 0.05), 8));
    }
    return grp;
  },

  vanity: (lw, lh, t, tint) => {
    const grp = BUILDERS.counter(lw, lh, t, tint ?? shade(t.fabricAlt, 0.15));
    const mirror = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.014, 20),
      new THREE.MeshLambertMaterial({ color: "#CFE4EC", emissive: new THREE.Color("#BFD8E4"), emissiveIntensity: 0.25 }),
    );
    mirror.rotation.x = Math.PI / 2;
    mirror.position.set(0, 0.44, -lh * TS / 2 + 0.03);
    grp.add(mirror);
    return grp;
  },

  toilet: (_lw, _lh, _t) => {
    const grp = g();
    grp.add(rbox(0.13, 0.13, 0.16, "#F4F1E8", 0, 0.065, 0.02, 0.04));
    grp.add(rbox(0.14, 0.16, 0.05, "#F4F1E8", 0, 0.17, -0.06, 0.02));
    return grp;
  },

  washer: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    grp.add(rbox(w - 0.03, 0.42, lh * TS - 0.03, "#E9EBEC", 0, 0.21, 0, 0.025));
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 20), mat("#7C99A8"));
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 0.22, lh * TS / 2 - 0.008);
    grp.add(door);
    const doorRim = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20), mat(t.metal));
    doorRim.position.copy(door.position);
    grp.add(doorRim);
    return grp;
  },

  laundryBasket: (_lw, _lh, t) => {
    const grp = g();
    grp.add(cyl(0.085, 0.07, 0.16, shade(t.wood, 0.25), 0, 0.08, 0, 12));
    grp.add(sphere(0.045, "#F2EEE2", 0.02, 0.17, 0.01, 10));
    grp.add(sphere(0.035, t.fabricAlt, -0.03, 0.165, -0.02, 10));
    return grp;
  },

  desk: (lw, lh, t, tint) => {
    const grp = legged(lw * TS - 0.04, lh * TS - 0.04, 0.24, 0.03, tint ?? t.wood, t.woodDark, 0.018);
    grp.add(rbox(0.14, 0.1, 0.02, "#3A4048", 0.04, 0.31, -lh * TS * 0.14, 0.008)); // laptop screen
    grp.add(box(0.14, 0.008, 0.09, "#4E555E", 0.04, 0.245, -lh * TS * 0.14 + 0.055));
    return grp;
  },

  beanbag: (lw, lh, t, tint) => {
    const grp = g();
    const col = tint ?? t.accent;
    const bag = sphere(lw * TS * 0.42, col, 0, 0.1, 0);
    bag.scale.y = 0.62;
    grp.add(bag);
    const dent = sphere(lw * TS * 0.3, shade(col, -0.12), 0, 0.13, lh * TS * 0.05);
    dent.scale.y = 0.4;
    grp.add(dent);
    return grp;
  },

  windowSeat: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.14, d - 0.02, tint ?? t.wood, 0, 0.07, 0, 0.02));
    grp.add(rbox(w - 0.03, 0.05, d - 0.05, t.fabricAlt, 0, 0.165, 0, 0.02));
    grp.add(rbox(0.05, 0.09, d * 0.4, t.fabric, -w / 2 + 0.06, 0.23, -d * 0.2, 0.02));
    grp.add(rbox(0.05, 0.09, d * 0.4, t.fabric, w / 2 - 0.06, 0.23, d * 0.2, 0.02));
    return grp;
  },

  pianoUpright: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.44, d * 0.55, t.woodDark, 0, 0.22, -d * 0.18, 0.02));
    grp.add(box(w - 0.06, 0.03, d * 0.4, "#F6F2E6", 0, 0.26, d * 0.18));
    // black keys hint
    for (let i = 0; i < Math.floor((w - 0.08) / 0.03); i++) {
      if (i % 3 === 2) continue;
      grp.add(box(0.014, 0.012, 0.05, "#2A2A30", -w / 2 + 0.05 + i * 0.03, 0.28, d * 0.12));
    }
    return grp;
  },

  coatRack: (_lw, _lh, t) => {
    const grp = g();
    grp.add(cyl(0.05, 0.06, 0.02, t.woodDark, 0, 0.01, 0, 12));
    grp.add(cyl(0.01, 0.01, 0.5, t.wood, 0, 0.26, 0, 8));
    grp.add(sphere(0.05, t.fabric, 0.045, 0.42, 0.01, 10));   // hanging coat blob
    grp.add(sphere(0.04, t.fabricAlt, -0.04, 0.45, -0.01, 10));
    return grp;
  },

  shoeRack: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.03, 0.16, d - 0.04, t.wood, 0, 0.08, 0, 0.015));
    const shoeCols = [t.accent, "#5E6E84", "#C9A86F"];
    for (let i = 0; i < Math.min(3, lw + 1); i++) {
      grp.add(rbox(0.035, 0.03, 0.07, shoeCols[i % 3], -w / 4 + i * 0.07, 0.185, 0, 0.012));
    }
    return grp;
  },

  bench: (lw, lh, t, tint) => {
    const grp = legged(lw * TS - 0.04, lh * TS - 0.06, 0.15, 0.035, tint ?? t.wood, t.woodDark, 0.016);
    grp.add(rbox(lw * TS - 0.1, 0.035, lh * TS - 0.1, t.fabricAlt, 0, 0.175, 0, 0.015));
    return grp;
  },

  floorCushion: (lw, lh, t, tint) => {
    const grp = g();
    grp.add(rbox(lw * TS - 0.03, 0.07, lh * TS - 0.03, tint ?? t.fabricAlt, 0, 0.04, 0, 0.03));
    return grp;
  },

  catTree: (_lw, _lh, t) => {
    const grp = g();
    grp.add(cyl(0.07, 0.08, 0.02, t.woodDark, 0, 0.01, 0, 12));
    grp.add(cyl(0.02, 0.02, 0.3, shade(t.wood, 0.2), 0, 0.16, 0, 10));
    grp.add(cyl(0.06, 0.06, 0.03, t.fabricAlt, 0, 0.32, 0, 14));
    grp.add(cyl(0.02, 0.02, 0.14, shade(t.wood, 0.2), 0.05, 0.4, 0.02, 8));
    grp.add(cyl(0.05, 0.05, 0.025, t.fabric, 0.05, 0.48, 0.02, 12));
    return grp;
  },

  pantryShelf: (lw, lh, t, tint) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w - 0.02, 0.5, d - 0.03, tint ?? shade(t.wood, -0.05), 0, 0.25, 0, 0.015));
    // jars and boxes on front
    const jarCols = ["#D9B46A", "#B4788E", "#8FA86E", "#C97C5E"];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < Math.max(2, lw - 1); i++) {
        const x = -w / 2 + 0.05 + i * ((w - 0.1) / Math.max(1, lw - 2));
        grp.add(cyl(0.02, 0.02, 0.05, jarCols[(i + row) % 4], x, 0.16 + row * 0.2, d * 0.3, 10));
      }
    }
    return grp;
  },

  fireplace: (lw, lh, t) => {
    const grp = g();
    const w = lw * TS;
    const d = lh * TS;
    grp.add(rbox(w + 0.06, 0.5, d - 0.02, shade(t.wall, -0.12), 0, 0.25, 0, 0.02));
    grp.add(box(w + 0.1, 0.04, d + 0.02, t.wallTrim, 0, 0.52, 0));
    const opening = box(0.03, 0.16, d * 0.55, "#2A2226", w / 2 - 0.005, 0.12, 0);
    grp.add(opening);
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.1, 8),
      new THREE.MeshLambertMaterial({ color: "#F4A24E", emissive: new THREE.Color("#F47E3A"), emissiveIntensity: 0.8 }),
    );
    fire.position.set(w / 2 + 0.01, 0.09, 0);
    fire.name = "fireplaceFlame";
    grp.add(fire);
    return grp;
  },

  mirror: (_lw, _lh, t) => {
    const grp = g();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.015, 24),
      new THREE.MeshLambertMaterial({ color: "#CFE4EC", emissive: new THREE.Color("#BFD8E4"), emissiveIntensity: 0.3 }),
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.y = 0.45;
    grp.add(glass);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 24), mat(t.wallTrim));
    frame.position.y = 0.45;
    grp.add(frame);
    return grp;
  },

  clock: (_lw, _lh, t) => {
    const grp = g();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), mat("#F6F2E6"));
    face.rotation.x = Math.PI / 2;
    face.position.y = 0.55;
    grp.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20), mat(t.accent));
    rim.position.y = 0.55;
    grp.add(rim);
    return grp;
  },

  pictureFrame: (_lw, _lh, t) => {
    const grp = g();
    grp.add(rbox(0.16, 0.2, 0.02, t.wallTrim, 0, 0.55, 0, 0.008));
    grp.add(box(0.12, 0.16, 0.022, t.fabricAlt, 0, 0.55, 0.002));
    grp.add(sphere(0.03, t.accent, 0, 0.55, 0.012, 10));
    return grp;
  },
};

/** Build a furniture piece; returns a group centered on its footprint. */
export function buildFurniture(def: FurnitureDef, theme: Theme): THREE.Group {
  const builder = BUILDERS[def.shape];
  if (!builder) throw new Error(`No builder for furniture shape "${def.shape}"`);
  const rot = def.rot ?? 0;
  const lw = rot % 2 === 1 ? def.h : def.w;
  const lh = rot % 2 === 1 ? def.w : def.h;
  const grp = builder(lw, lh, theme, def.tint);
  grp.rotation.y = rot * (Math.PI / 2);
  grp.userData.label = def.label;
  grp.userData.shape = def.shape;
  return grp;
}
