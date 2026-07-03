/**
 * Builds the diorama: floating plinth, vertex-colored floor, walls with
 * camera-aware heights (tall back walls, low front lip, mid interior
 * dividers, corner posts), arched doorways, glowing windows, rugs.
 *
 * Wall height rule: a wall tile with floor on the camera side only would
 * hide the room — it becomes a low lip. Floor on the far side only → tall
 * back wall. Floor on both sides → mid divider. Neither → corner post.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LevelData } from "../world/types";
import type { Theme } from "../world/themes";
import { TILE_SIZE, FLOOR_TOP, WALL_TALL, WALL_MID, WALL_LIP } from "../utils/constants";
import { mat, shade, box, rbox } from "./helpers";

export type WallKind = "tall" | "mid" | "lip" | "post";

export class SceneryBuilder {
  readonly group = new THREE.Group();
  private cx: number;
  private cz: number;

  constructor(private level: LevelData, private theme: Theme) {
    this.cx = level.grid.w / 2 - 0.5;
    this.cz = level.grid.h / 2 - 0.5;
    this.buildPlinth();
    this.buildFloor();
    this.buildRugs();
    this.buildWalls();
    this.buildDoorArches();
  }

  wx(gx: number) { return (gx - this.cx) * TILE_SIZE; }
  wz(gz: number) { return (gz - this.cz) * TILE_SIZE; }

  // ── Plinth: the floating block the whole level sits on ────────────────────
  private buildPlinth() {
    const { w, h } = this.level.grid;
    const W = w * TILE_SIZE;
    const H = h * TILE_SIZE;
    const t = this.theme;

    const base = box(W, 1.5, H, t.plinthSide, 0, -0.75 - 0.04, 0);
    base.castShadow = false;
    base.receiveShadow = false;
    this.group.add(base);

    // slightly-outset rim right under the floor — reads as a crisp MV edge
    const rim = box(W + 0.09, 0.08, H + 0.09, t.plinthEdge, 0, -0.04, 0);
    rim.castShadow = false;
    this.group.add(rim);

    // tapered foot so the block feels sculpted, not extruded
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(W, H) * 0.32, Math.min(W, H) * 0.18, 0.5, 4),
      mat(shade(t.plinthSide, -0.18)),
    );
    foot.rotation.y = Math.PI / 4;
    foot.position.y = -1.75;
    foot.scale.set(W / Math.min(W, H), 1, H / Math.min(W, H));
    this.group.add(foot);
  }

  // ── Floor: one merged geometry, per-tile vertex colors ────────────────────
  private buildFloor() {
    const { w, h } = this.level.grid;
    const t = this.theme;
    const cA = new THREE.Color(t.floorA);
    const cB = new THREE.Color(t.floorB);
    const geoms: THREE.BufferGeometry[] = [];

    for (let x = 0; x < w; x++) {
      for (let z = 0; z < h; z++) {
        const g = new THREE.BoxGeometry(TILE_SIZE, FLOOR_TOP, TILE_SIZE);
        g.translate(this.wx(x), FLOOR_TOP / 2, this.wz(z));
        const base = (x + z) % 2 === 0 ? cA : cB;
        // subtle deterministic per-tile variation — keeps big floors alive
        const n = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
        const c = base.clone().offsetHSL(0, 0, (Math.abs(n) - 0.5) * 0.018);
        const count = g.getAttribute("position").count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geoms.push(g);
      }
    }

    const merged = BufferGeometryUtils.mergeGeometries(geoms);
    geoms.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildRugs() {
    const t = this.theme;
    for (const r of this.level.rugs ?? []) {
      const cxW = this.wx(r.x + r.w / 2 - 0.5);
      const czW = this.wz(r.z + r.h / 2 - 0.5);
      const w = r.w * TILE_SIZE;
      const h = r.h * TILE_SIZE;
      if (r.round) {
        const rad = Math.min(w, h) / 2;
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.016, 40), mat(t.rugTrim));
        outer.position.set(cxW, FLOOR_TOP + 0.008, czW);
        outer.scale.set(w / (rad * 2), 1, h / (rad * 2));
        outer.receiveShadow = true;
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(rad - 0.055, rad - 0.055, 0.017, 40), mat(t.rug));
        inner.position.set(cxW, FLOOR_TOP + 0.009, czW);
        inner.scale.copy(outer.scale);
        inner.receiveShadow = true;
        this.group.add(outer, inner);
      } else {
        const outer = box(w, 0.016, h, t.rugTrim, cxW, FLOOR_TOP + 0.008, czW);
        const inner = box(w - 0.11, 0.017, h - 0.11, t.rug, cxW, FLOOR_TOP + 0.009, czW);
        outer.castShadow = inner.castShadow = false;
        this.group.add(outer, inner);
      }
    }
  }

  // ── Walls ──────────────────────────────────────────────────────────────────
  classifyWall(x: number, z: number): WallKind {
    const f = (gx: number, gz: number) => this.level.floorTiles.has(`${gx},${gz}`);
    const toward = f(x + 1, z) || f(x, z + 1);
    const away = f(x - 1, z) || f(x, z - 1);
    if (toward && away) return "mid";
    if (toward) return "tall";
    if (away) return "lip";
    if (f(x + 1, z + 1)) return "tall";
    if (f(x - 1, z - 1)) return "lip";
    return "post";
  }

  private buildWalls() {
    const t = this.theme;
    const windowSet = new Set((this.level.windows ?? []).map(([x, z]) => `${x},${z}`));
    const heights: Record<WallKind, number> = {
      tall: WALL_TALL, mid: WALL_MID, lip: WALL_LIP, post: WALL_MID + 0.1,
    };
    const colors: Record<WallKind, string> = {
      tall: t.wall, mid: shade(t.wall, -0.06), lip: t.wallLow, post: t.wallTrim,
    };

    const byKind: Record<string, THREE.BufferGeometry[]> = {};
    const trims: THREE.BufferGeometry[] = [];
    const add = (bucket: THREE.BufferGeometry[], g: THREE.BoxGeometry, x: number, y: number, z: number) => {
      g.translate(x, y, z);
      bucket.push(g);
    };

    for (const [x, z] of this.level.wallTiles) {
      const kind = this.classifyWall(x, z);
      const hgt = heights[kind];
      const wx = this.wx(x);
      const wz = this.wz(z);
      (byKind[kind] ??= []).push(
        (() => {
          const g = new THREE.BoxGeometry(TILE_SIZE, hgt, TILE_SIZE);
          g.translate(wx, hgt / 2, wz);
          return g;
        })(),
      );

      if (kind === "tall" || kind === "mid") {
        // baseboard skirt + cap trim
        add(trims, new THREE.BoxGeometry(TILE_SIZE + 0.024, 0.055, TILE_SIZE + 0.024), wx, FLOOR_TOP + 0.02, wz);
        add(trims, new THREE.BoxGeometry(TILE_SIZE + 0.03, 0.035, TILE_SIZE + 0.03), wx, hgt + 0.0175, wz);
      }
      if (kind === "post") {
        add(trims, new THREE.BoxGeometry(TILE_SIZE + 0.05, 0.05, TILE_SIZE + 0.05), wx, hgt + 0.025, wz);
      }
      if (kind === "lip") {
        add(trims, new THREE.BoxGeometry(TILE_SIZE + 0.016, 0.028, TILE_SIZE + 0.016), wx, hgt + 0.014, wz);
      }

      if (windowSet.has(`${x},${z}`) && kind === "tall") {
        this.buildWindow(x, z);
      }
    }

    for (const kind of Object.keys(byKind) as WallKind[]) {
      const merged = BufferGeometryUtils.mergeGeometries(byKind[kind]);
      byKind[kind].forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat(colors[kind]));
      mesh.castShadow = kind === "tall" || kind === "mid";
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (trims.length) {
      const merged = BufferGeometryUtils.mergeGeometries(trims);
      trims.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat(t.wallTrim));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Arch-shaped extrusion (rect + semicircular top) in the XY plane. */
  private archGeometry(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.absarc(0, h, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  /** Arched window inset into a tall wall — glows with the sky. */
  private buildWindow(x: number, z: number) {
    const t = this.theme;
    const wx = this.wx(x);
    const wz = this.wz(z);
    // orientation: wall runs along x if a wall neighbor exists at x±1
    const wallSet = new Set(this.level.wallTiles.map(([a, b]) => `${a},${b}`));
    const alongX = wallSet.has(`${x - 1},${z}`) || wallSet.has(`${x + 1},${z}`);

    const paneMat = new THREE.MeshLambertMaterial({
      color: t.windowGlow,
      emissive: new THREE.Color(t.windowGlow),
      emissiveIntensity: 0.6,
    });
    const paneW = TILE_SIZE * 0.56;
    const rectH = WALL_TALL * 0.3;             // arch adds paneW/2 on top
    const baseY = WALL_TALL * 0.3;

    const grp = new THREE.Group();
    const frame = new THREE.Mesh(this.archGeometry(paneW + 0.05, rectH, TILE_SIZE + 0.03), mat(t.wallTrim));
    frame.position.y = baseY - 0.025;
    const pane = new THREE.Mesh(this.archGeometry(paneW, rectH, TILE_SIZE + 0.06), paneMat);
    pane.position.y = baseY;
    const sill = box(paneW + 0.11, 0.03, TILE_SIZE + 0.08, t.wallTrim, 0, baseY - 0.04, 0);
    grp.add(frame, pane, sill);
    if (!alongX) grp.rotation.y = Math.PI / 2;
    grp.position.set(wx, 0, wz);
    this.group.add(grp);
  }

  /** Arches over walkable door openings. */
  private buildDoorArches() {
    const t = this.theme;
    const wallSet = new Set(this.level.wallTiles.map(([a, b]) => `${a},${b}`));
    // group contiguous door tiles into spans
    const doors = [...this.level.doorTiles];
    const used = new Set<string>();

    for (const [x, z] of doors) {
      if (used.has(`${x},${z}`)) continue;
      // find span direction: door tiles run along the wall
      const alongX = doors.some(([a, b]) => b === z && Math.abs(a - x) === 1);
      const span: [number, number][] = [[x, z]];
      used.add(`${x},${z}`);
      for (const [a, b] of doors) {
        if (used.has(`${a},${b}`)) continue;
        if (alongX ? b === z && span.some(([sx]) => Math.abs(sx - a) === 1)
                   : a === x && span.some(([, sz]) => Math.abs(sz - b) === 1)) {
          span.push([a, b]);
          used.add(`${a},${b}`);
        }
      }

      const xs = span.map(([a]) => a);
      const zs = span.map(([, b]) => b);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      const len = span.length * TILE_SIZE;

      // neighbor wall height decides arch height
      const nbr: [number, number] = alongX
        ? [Math.min(...xs) - 1, z]
        : [x, Math.min(...zs) - 1];
      const kind = wallSet.has(`${nbr[0]},${nbr[1]}`) ? this.classifyWall(nbr[0], nbr[1]) : "mid";
      const hgt = kind === "tall" ? WALL_TALL : WALL_MID;

      const grp = new THREE.Group();
      const postW = 0.055;
      const p1 = rbox(postW, hgt + 0.06, TILE_SIZE * 0.82, t.wallTrim, -len / 2 - postW / 2, (hgt + 0.06) / 2, 0, 0.02);
      const p2 = rbox(postW, hgt + 0.06, TILE_SIZE * 0.82, t.wallTrim, len / 2 + postW / 2, (hgt + 0.06) / 2, 0, 0.02);
      const lintel = rbox(len + postW * 2 + 0.04, 0.07, TILE_SIZE * 0.9, t.wallTrim, 0, hgt + 0.06 + 0.035, 0, 0.025);
      // small dome cap — a very Monument Valley flourish
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(this.theme.accent),
      );
      cap.position.y = hgt + 0.06 + 0.07;
      cap.castShadow = true;
      grp.add(p1, p2, lintel, cap);
      if (!alongX) grp.rotation.y = Math.PI / 2;
      grp.position.set(this.wx(midX), 0, this.wz(midZ));
      this.group.add(grp);
    }
  }
}
