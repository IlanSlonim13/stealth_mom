/**
 * The wind-down scene every level ends with. Generic choreography driven
 * by each level's tiny RelaxSpec: Mom walks from the goal to her seat,
 * settles into a pose (sit / soak / lounge), a prop appears (wine, book,
 * bath duck, ...), ambient particles loop, and tapping the prop plays a
 * little "use" animation with a floating quip.
 */

import * as THREE from "three";
import type { RelaxSpec, RelaxProp } from "../world/types";
import type { Theme } from "../world/themes";
import { TILE_SIZE, FLOOR_TOP } from "../utils/constants";
import { clamp01, easeInOutQuad, easeOutCubic, lerp } from "../utils/easing";
import type { CharacterRig } from "./CharacterFactory";
import { EffectsSystem } from "./EffectsSystem";
import { box, rbox, cyl, sphere, mat, liveMat, shade } from "./helpers";
import { PROP_FEEDBACK, pickRandom } from "../world/dialog";

type Phase = "walk" | "turn" | "settle" | "ambient";

interface PropKit {
  group: THREE.Group;
  handItem?: THREE.Group;
  tappables: THREE.Object3D[];
}

export class RelaxDirector {
  active = false;
  settled = false;
  private phase: Phase = "walk";
  private t = 0;
  private walkFrom = new THREE.Vector3();
  private seatWorld = new THREE.Vector3();
  private walkDur = 1;
  private startYaw = 0;
  private prop: PropKit | null = null;
  private useAnim = 0; // >0 while sip/bite animation plays
  private breathe = 0;
  private phoneLight: THREE.PointLight | null = null;

  constructor(
    private scene: THREE.Scene,
    private mom: CharacterRig,
    private theme: Theme,
    private spec: RelaxSpec,
    private effects: EffectsSystem,
    private cx: number,
    private cz: number,
  ) {}

  private wx(gx: number) { return (gx - this.cx) * TILE_SIZE; }
  private wz(gz: number) { return (gz - this.cz) * TILE_SIZE; }

  start() {
    this.active = true;
    this.phase = "walk";
    this.t = 0;
    this.walkFrom.copy(this.mom.group.position);
    this.seatWorld.set(this.wx(this.spec.seat[0]), FLOOR_TOP, this.wz(this.spec.seat[1]));
    const dist = this.walkFrom.distanceTo(this.seatWorld);
    this.walkDur = Math.max(0.4, dist / 0.55);
    this.startYaw = this.mom.group.rotation.y;
  }

  /** Face direction default: toward the camera corner. */
  private targetYaw(): number {
    return this.spec.face ?? Math.PI / 4;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const m = this.mom;

    switch (this.phase) {
      case "walk": {
        const k = clamp01(this.t / this.walkDur);
        const e = easeInOutQuad(k);
        m.group.position.lerpVectors(this.walkFrom, this.seatWorld, e);
        const dx = this.seatWorld.x - this.walkFrom.x;
        const dz = this.seatWorld.z - this.walkFrom.z;
        if (dx * dx + dz * dz > 0.001) m.group.rotation.y = Math.atan2(dx, dz);
        const swing = Math.sin(this.t * 9) * 0.35 * (k < 0.9 ? 1 : 0.3);
        m.lLeg.rotation.x = swing;
        m.rLeg.rotation.x = -swing;
        m.lArm.rotation.x = -swing * 0.6;
        m.rArm.rotation.x = swing * 0.6;
        if (k >= 1) { this.phase = "turn"; this.t = 0; }
        break;
      }
      case "turn": {
        const k = clamp01(this.t / 0.45);
        let from = m.group.rotation.y;
        let to = this.targetYaw();
        let diff = to - from;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        m.group.rotation.y = from + diff * Math.min(1, dt * 10);
        m.lLeg.rotation.x *= 0.8;
        m.rLeg.rotation.x *= 0.8;
        m.lArm.rotation.x *= 0.8;
        m.rArm.rotation.x *= 0.8;
        if (k >= 1) { this.phase = "settle"; this.t = 0; }
        break;
      }
      case "settle": {
        const k = easeOutCubic(clamp01(this.t / 1.0));
        this.applyPose(k);
        if (this.t >= 1.0) {
          this.phase = "ambient";
          this.t = 0;
          this.settled = true;
          this.spawnProp();
          const pPos = this.seatWorld.clone();
          pPos.y += this.spec.pose === "soak" ? 0.3 : 0.42;
          this.effects.startEmitter(this.spec.particles, pPos);
        }
        break;
      }
      case "ambient": {
        this.applyPose(1);
        this.breathe += dt;
        m.head.position.y = m.headBaseY * this.headScale() + Math.sin(this.breathe * 1.6) * 0.005;
        m.body.rotation.x = this.bodyLean() + Math.sin(this.breathe * 1.6) * 0.01;
        if (this.useAnim > 0) {
          this.useAnim = Math.max(0, this.useAnim - dt);
          const k = 1 - Math.abs(this.useAnim / 0.9 - 0.5) * 2; // 0→1→0
          const e = easeInOutQuad(clamp01(k));
          if (this.prop?.handItem) {
            this.prop.handItem.position.y = 0.02 + e * 0.13;
            this.prop.handItem.position.z = 0.04 - e * 0.055;
            const pl = this.prop.handItem.getObjectByName("pageL");
            if (pl) pl.rotation.z = 0.25 + e * 0.5; // page flip
          }
          m.head.rotation.x = -e * 0.35;
          m.rArm.rotation.x = this.armRest() - e * 0.9;
        }
        break;
      }
    }
  }

  private headScale() { return this.spec.pose === "soak" ? 0.92 : 1; }
  private bodyLean() {
    return this.spec.pose === "lounge" ? -0.42 : this.spec.pose === "soak" ? -0.28 : -0.06;
  }
  private armRest() {
    return this.spec.pose === "soak" ? -0.5 : 0.25;
  }

  private applyPose(k: number) {
    const m = this.mom;
    const seatH = this.spec.seatHeight ?? 0.15;
    const pose = this.spec.pose;

    m.group.position.x = this.seatWorld.x;
    m.group.position.z = this.seatWorld.z;

    if (pose === "soak") {
      // sink into the water — legs hidden, arms on the rim
      m.group.position.y = lerp(FLOOR_TOP, FLOOR_TOP + seatH - 0.1, k);
      m.lLeg.visible = m.rLeg.visible = k < 0.5;
      m.body.rotation.x = lerp(0, -0.28, k);
      m.lArm.rotation.x = lerp(0, -0.5, k);
      m.rArm.rotation.x = lerp(0, -0.5, k);
      m.lArm.rotation.z = lerp(0, 1.1, k);
      m.rArm.rotation.z = lerp(0, -1.1, k);
      m.head.rotation.x = lerp(0, -0.18, k);
    } else if (pose === "lounge") {
      m.group.position.y = lerp(FLOOR_TOP, FLOOR_TOP + seatH, k);
      m.body.rotation.x = lerp(0, -0.42, k);
      m.head.rotation.x = lerp(0, 0.1, k);
      m.head.position.z = lerp(0, -0.05, k);
      m.lLeg.rotation.x = lerp(m.lLeg.rotation.x, 1.15, k);
      m.rLeg.rotation.x = lerp(m.rLeg.rotation.x, 1.3, k);
      if (m.lCalf) m.lCalf.rotation.x = lerp(0, -0.5, k);
      if (m.rCalf) m.rCalf.rotation.x = lerp(0, -0.35, k);
      m.lArm.rotation.x = lerp(0, 0.4, k);
      m.rArm.rotation.x = lerp(0, 0.25, k);
      m.lArm.rotation.z = lerp(0, 0.35, k);
    } else {
      // sit
      m.group.position.y = lerp(FLOOR_TOP, FLOOR_TOP + seatH, k);
      m.lLeg.rotation.x = lerp(m.lLeg.rotation.x, Math.PI / 2 - 0.1, k);
      m.rLeg.rotation.x = lerp(m.rLeg.rotation.x, Math.PI / 2 - 0.16, k);
      if (m.lCalf) m.lCalf.rotation.x = lerp(0, -Math.PI / 2 + 0.25, k);
      if (m.rCalf) m.rCalf.rotation.x = lerp(0, -Math.PI / 2 + 0.32, k);
      m.body.rotation.x = lerp(0, -0.06, k);
      m.lArm.rotation.x = lerp(0, 0.3, k);
      m.rArm.rotation.x = lerp(0, 0.25, k);
      m.head.rotation.x = lerp(0, -0.06, k);
    }
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  private spawnProp() {
    const kit = buildProp(this.spec.prop, this.theme);
    if (kit.handItem && this.mom.handAnchor) {
      this.mom.handAnchor.add(kit.handItem);
    }
    // headphones are worn, not held — move the band onto Mom's head
    if (this.spec.prop === "headphones") {
      const wear = kit.group.getObjectByName("headphonesWear");
      if (wear) {
        kit.group.remove(wear);
        this.mom.head.add(wear);
        wear.position.set(0, 0.015, 0);
        wear.rotation.x = -0.12;
      }
    }
    // side items sit on a little stool beside the seat, not the floor
    if (["wine", "teapot", "cheese", "chocolate"].includes(this.spec.prop)) {
      kit.group.children.forEach((c) => (c.position.y += 0.13));
      kit.group.add(cyl(0.07, 0.06, 0.13, this.theme.wood, 0, 0.065, 0, 12));
    }
    // soak scenes get a candle tray + rolled towel on the floor by the tub
    if (this.spec.pose === "soak") {
      const flameMat = liveMat("#F4A24E", {
        emissive: new THREE.Color("#F47E3A"), emissiveIntensity: 0.9,
      });
      kit.group.add(cyl(0.075, 0.082, 0.014, this.theme.wood, -0.55, 0.007, 0.15, 16)); // tray
      for (const [cx2, cz2] of [[-0.58, 0.12], [-0.51, 0.19]] as const) {
        kit.group.add(cyl(0.016, 0.016, 0.024, "#F6EFDC", cx2, 0.026, cz2, 10));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.02, 6), flameMat);
        flame.position.set(cx2, 0.048, cz2);
        kit.group.add(flame);
      }
      const towel = cyl(0.028, 0.028, 0.09, "#F2EEE2", -0.56, 0.042, 0.24, 12);
      towel.rotation.z = Math.PI / 2;
      kit.group.add(towel);
    }
    // phone screen casts a cool glow on Mom's face
    if (this.spec.prop === "phone" && this.mom.handAnchor) {
      this.phoneLight = new THREE.PointLight("#9EC4F4", 1.4, 0.9);
      this.phoneLight.position.set(0, 0.08, 0.06);
      this.mom.handAnchor.add(this.phoneLight);
    }
    // side items placed beside the seat, biased toward the camera
    kit.group.position.set(
      this.seatWorld.x + 0.18,
      FLOOR_TOP,
      this.seatWorld.z + 0.14,
    );
    this.scene.add(kit.group);
    this.prop = kit;
  }

  /** Raycast tap during ambient phase. Returns feedback text if prop hit. */
  handleTap(ray: THREE.Raycaster): string | null {
    if (!this.prop || this.phase !== "ambient") return null;
    const targets: THREE.Object3D[] = [...this.prop.tappables];
    if (this.prop.handItem) targets.push(this.prop.handItem);
    const hits = ray.intersectObjects(targets, true);
    if (hits.length === 0) return null;
    this.useAnim = 0.9;
    const pool = PROP_FEEDBACK[this.spec.prop] ?? ["*happy sigh*"];
    return pickRandom(pool);
  }

  getSeatWorld(): THREE.Vector3 {
    return new THREE.Vector3(
      this.wx(this.spec.seat[0]), FLOOR_TOP, this.wz(this.spec.seat[1]),
    );
  }

  destroy() {
    if (this.phoneLight) {
      this.phoneLight.parent?.remove(this.phoneLight);
      this.phoneLight = null;
    }
    if (this.prop) {
      this.prop.group.parent?.remove(this.prop.group);
      if (this.prop.handItem) this.prop.handItem.parent?.remove(this.prop.handItem);
    }
    this.prop = null;
    this.active = false;
  }
}

// ─── Prop builders ────────────────────────────────────────────────────────────

function buildProp(prop: RelaxProp, t: Theme): PropKit {
  const group = new THREE.Group();
  const tappables: THREE.Object3D[] = [group];
  let handItem: THREE.Group | undefined;

  const hitbox = (x = 0, y = 0.1, z = 0, r = 0.12) => {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    h.position.set(x, y, z);
    return h;
  };

  switch (prop) {
    case "wine": {
      handItem = new THREE.Group();
      handItem.add(cyl(0.001, 0.014, 0.008, "#F4F1E8", 0, 0.008, 0, 10));
      handItem.add(cyl(0.003, 0.003, 0.03, "#EDE8DC", 0, 0.026, 0, 8));
      const bowl = cyl(0.02, 0.012, 0.035, "#8E2438", 0, 0.058, 0, 12);
      handItem.add(bowl);
      handItem.add(hitbox(0, 0.05, 0, 0.08));
      const bottle = new THREE.Group();
      bottle.add(cyl(0.022, 0.022, 0.12, "#3E5230", 0, 0.06, 0, 12));
      bottle.add(cyl(0.008, 0.02, 0.05, "#3E5230", 0, 0.14, 0, 10));
      bottle.add(box(0.032, 0.04, 0.002, "#EDE0C4", 0, 0.07, 0.022));
      group.add(bottle, hitbox(0, 0.08, 0, 0.12));
      break;
    }
    case "coffee": {
      handItem = new THREE.Group();
      const mug = cyl(0.025, 0.022, 0.045, t.accent, 0, 0.022, 0, 14);
      handItem.add(mug);
      handItem.add(cyl(0.019, 0.019, 0.004, "#6E4A2E", 0, 0.045, 0, 12));
      handItem.add(hitbox(0, 0.03, 0, 0.07));
      break;
    }
    case "book": {
      handItem = new THREE.Group();
      const left = box(0.075, 0.008, 0.1, "#F6F1E4", -0.036, 0.01, 0);
      left.rotation.z = 0.25;
      left.name = "pageL";
      const right = box(0.075, 0.008, 0.1, "#F6F1E4", 0.036, 0.01, 0);
      right.rotation.z = -0.25;
      right.name = "pageR";
      const cover = box(0.16, 0.006, 0.105, t.accent, 0, -0.002, 0);
      handItem.add(cover, left, right, hitbox(0, 0.02, 0, 0.09));
      break;
    }
    case "bath": {
      const duck = new THREE.Group();
      duck.add(sphere(0.032, "#F4C93A", 0, 0.03, 0, 12));
      duck.add(sphere(0.02, "#F4C93A", 0, 0.055, 0.025, 10));
      duck.add(box(0.014, 0.008, 0.014, "#E8823A", 0, 0.052, 0.045));
      duck.position.set(-0.28, 0.16, 0.1);
      group.add(duck, hitbox(-0.28, 0.16, 0.1, 0.1));
      // foam blobs on the water
      for (let i = 0; i < 6; i++) {
        const f = sphere(0.02 + Math.random() * 0.015, "#F8FBFC",
          -0.2 - Math.random() * 0.2, 0.17, -0.05 + Math.random() * 0.25, 8);
        group.add(f);
      }
      break;
    }
    case "phone": {
      handItem = new THREE.Group();
      const body = rbox(0.045, 0.008, 0.08, "#2E3238", 0, 0.004, 0, 0.004);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.038, 0.07),
        liveMat("#AEC9E8", { emissive: new THREE.Color("#9EC4F4"), emissiveIntensity: 0.9 }),
      );
      screen.rotation.x = -Math.PI / 2;
      screen.position.y = 0.009;
      handItem.add(body, screen, hitbox(0, 0.01, 0, 0.07));
      break;
    }
    case "chocolate": {
      handItem = new THREE.Group();
      const bar = rbox(0.05, 0.01, 0.028, "#5E3A26", 0, 0.005, 0, 0.004);
      handItem.add(bar);
      handItem.add(box(0.045, 0.011, 0.012, "#C9A03A", 0, 0.005, -0.01));
      handItem.add(hitbox(0, 0.01, 0, 0.06));
      const boxGrp = new THREE.Group();
      boxGrp.add(rbox(0.09, 0.025, 0.07, "#8E2438", 0, 0.0125, 0, 0.008));
      boxGrp.add(box(0.02, 0.01, 0.02, "#5E3A26", -0.02, 0.03, 0));
      boxGrp.add(box(0.02, 0.01, 0.02, "#5E3A26", 0.02, 0.03, 0.015));
      group.add(boxGrp, hitbox(0, 0.03, 0, 0.1));
      break;
    }
    case "headphones": {
      // worn, not held — band + cups added to the group, positioned by caller
      handItem = undefined;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 20, Math.PI), mat("#4A4E5E"));
      band.rotation.z = 0;
      const cupL = sphere(0.022, t.accent, -0.075, 0, 0, 10);
      const cupR = sphere(0.022, t.accent, 0.075, 0, 0, 10);
      const wear = new THREE.Group();
      wear.add(band, cupL, cupR);
      wear.name = "headphonesWear";
      group.add(wear, hitbox(0, 0.35, 0, 0.14));
      break;
    }
    case "teapot": {
      const pot = new THREE.Group();
      pot.add(sphere(0.045, t.accent, 0, 0.045, 0, 14));
      pot.add(cyl(0.012, 0.02, 0.03, t.accent, 0, 0.09, 0, 10));
      const spout = cyl(0.008, 0.012, 0.05, t.accent, 0.05, 0.055, 0, 8);
      spout.rotation.z = -0.9;
      pot.add(spout);
      group.add(pot, hitbox(0, 0.06, 0, 0.1));
      handItem = new THREE.Group();
      handItem.add(cyl(0.02, 0.017, 0.03, "#F6F1E8", 0, 0.015, 0, 12));
      handItem.add(hitbox(0, 0.02, 0, 0.05));
      break;
    }
    case "package": {
      const pkg = new THREE.Group();
      const cardboard = "#C9A06E";
      pkg.add(rbox(0.16, 0.09, 0.13, cardboard, 0, 0.045, 0, 0.008));
      // open flaps
      const flapL = box(0.07, 0.006, 0.13, shade(cardboard, 0.08), -0.095, 0.1, 0);
      flapL.rotation.z = 0.7;
      const flapR = box(0.07, 0.006, 0.13, shade(cardboard, 0.08), 0.095, 0.1, 0);
      flapR.rotation.z = -0.7;
      // tissue paper poking out
      const tissue = sphere(0.05, "#F6EFE4", 0, 0.1, 0, 10);
      tissue.scale.y = 0.6;
      pkg.add(flapL, flapR, tissue);
      group.add(pkg, hitbox(0, 0.08, 0, 0.14));
      break;
    }
    case "cheese": {
      const boardGrp = new THREE.Group();
      boardGrp.add(cyl(0.08, 0.08, 0.012, t.wood, 0, 0.006, 0, 18));
      const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 3), mat("#F2C94E"));
      wedge.position.set(-0.02, 0.024, 0.01);
      const wedge2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, 3), mat("#F6DFA0"));
      wedge2.position.set(0.035, 0.022, -0.02);
      wedge.castShadow = wedge2.castShadow = true;
      boardGrp.add(wedge, wedge2);
      for (let i = 0; i < 4; i++) {
        boardGrp.add(sphere(0.008, "#7A3E52", -0.04 + i * 0.02, 0.017, 0.045, 8)); // grapes
      }
      group.add(boardGrp, hitbox(0, 0.03, 0, 0.11));
      handItem = new THREE.Group();
      const bite = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 3), mat("#F2C94E"));
      handItem.add(bite, hitbox(0, 0.01, 0, 0.05));
      break;
    }
  }

  return { group, handItem, tappables };
}
