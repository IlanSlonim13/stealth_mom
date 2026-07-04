/**
 * NPC brains + visuals. Movement is waypoint-based (authored clear lines),
 * detection is suspicion-based: Mom must stay exposed for SUSPICION_SECS
 * before being caught — the cone flushes red and a "!" pops first, which
 * makes catches feel fair instead of instant.
 */

import * as THREE from "three";
import type { LevelData, NpcDef, NpcType, SummonNpcDef } from "../world/types";
import {
  NPC_PARAMS, SUSPICION_SECS, SUSPICION_DECAY,
  LURE_INVESTIGATE_SECS, LURE_SPEED_MULT, SUMMON_CHASE_SPEED,
  TILE_SIZE, FLOOR_TOP,
} from "../utils/constants";
import { dist2d, pointInCone, headingToYaw } from "../utils/coordinates";
import { buildCharacter, type CharacterRig } from "./CharacterFactory";
import { coneFan, gradientDisc, ring, textSprite } from "./helpers";
import { EffectsSystem } from "./EffectsSystem";
import { BABY_TALK, DAD_THOUGHTS, CAT_THOUGHTS } from "../world/dialog";

const CONE_COLORS: Record<string, string> = { toddler: "#8FBF7A", husband: "#E8A054" };
const DISC_COLORS: Record<string, string> = { dog: "#E87A6E", cat: "#B48EC9" };
const DANGER = "#E8425A";

export interface NpcState {
  type: NpcType;
  rig: CharacterRig;
  pos: { x: number; z: number };
  heading: number;
  speed: number;
  // hazard params
  radius?: number;
  range?: number;
  angle?: number;
  // visuals
  coneMesh?: THREE.Mesh;
  disc?: THREE.Mesh;
  pulseRing?: THREE.Mesh;
  alertSprite?: THREE.Sprite;
  bubble?: THREE.Sprite;
  bubbleTimer: number;
  bubbleIdx: number;
  zzzEmitter?: { active: boolean; pos: THREE.Vector3 };
  // behaviour
  patrol?: [number, number][];
  patrolIdx: number;
  pauseTimer: number;
  pauseFor: number;
  lureTarget: { x: number; z: number } | null;
  lureTimer: number;
  returnTarget: { x: number; z: number } | null;
  chasing: boolean;
  suspicion: number;
  alertShown: boolean;
  moving: boolean;
  walkPhase: number;
}

export class NpcSystem {
  npcs: NpcState[] = [];
  private cx: number;
  private cz: number;
  private wallSet: Set<string>;

  constructor(
    private scene: THREE.Scene,
    level: LevelData,
    private effects: EffectsSystem,
  ) {
    this.cx = level.grid.w / 2 - 0.5;
    this.cz = level.grid.h / 2 - 0.5;
    this.wallSet = new Set(level.wallTiles.map(([x, z]) => `${x},${z}`));
    level.npcs.forEach((def) => this.spawn(def));
  }

  /** Walls block sight (doors are walkable openings, so they don't). */
  private losClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.round(ax + (bx - ax) * t);
      const z = Math.round(az + (bz - az) * t);
      if (this.wallSet.has(`${x},${z}`)) return false;
    }
    return true;
  }

  private wx(gx: number) { return (gx - this.cx) * TILE_SIZE; }
  private wz(gz: number) { return (gz - this.cz) * TILE_SIZE; }

  spawn(def: NpcDef, chasing = false): NpcState {
    const rig = buildCharacter(def.type);
    const p = NPC_PARAMS[def.type];
    const npc: NpcState = {
      type: def.type,
      rig,
      pos: { x: def.x, z: def.z },
      heading: def.facing ?? Math.PI / 2,
      speed: def.speed ?? ("speed" in p ? p.speed : 2),
      patrol: def.patrol,
      patrolIdx: 0,
      pauseTimer: 0,
      pauseFor: 0,
      lureTarget: null,
      lureTimer: 0,
      returnTarget: null,
      chasing,
      suspicion: 0,
      alertShown: false,
      moving: false,
      walkPhase: 0,
      bubbleTimer: 2 + Math.random() * 3,
      bubbleIdx: Math.floor(Math.random() * 5),
    };

    if (def.type === "dog" || def.type === "cat") {
      npc.radius = def.radius ?? (p as { radius: number }).radius;
      const r = npc.radius * TILE_SIZE;
      npc.disc = gradientDisc(r, DISC_COLORS[def.type], 0.45);
      npc.pulseRing = ring(r, 0.032, DISC_COLORS[def.type], 0.7);
      this.scene.add(npc.disc, npc.pulseRing);
      if (!def.patrol && !chasing) {
        npc.zzzEmitter = this.effects.startEmitter(
          "zzz",
          new THREE.Vector3(this.wx(def.x) + 0.08, FLOOR_TOP + 0.22, this.wz(def.z)),
          1.4,
        );
      }
    } else {
      npc.range = def.range ?? (p as { range: number }).range;
      npc.angle = def.angle ?? (p as { angle: number }).angle;
      npc.coneMesh = coneFan(npc.range * TILE_SIZE, npc.angle, CONE_COLORS[def.type]);
      this.scene.add(npc.coneMesh);
    }

    rig.group.position.set(this.wx(def.x), FLOOR_TOP, this.wz(def.z));
    rig.group.rotation.y = headingToYaw(npc.heading);
    this.scene.add(rig.group);
    this.npcs.push(npc);
    return npc;
  }

  summon(def: SummonNpcDef) {
    const npc = this.spawn({ type: def.type, x: def.x, z: def.z }, true);
    this.effects.alertPop(
      new THREE.Vector3(this.wx(def.x), FLOOR_TOP + 0.45, this.wz(def.z)),
    );
    return npc;
  }

  /** Send the nearest NPC of `type` to investigate a tile. Returns success. */
  lure(type: NpcType, gx: number, gz: number): boolean {
    let best: NpcState | null = null;
    let bestD = Infinity;
    for (const n of this.npcs) {
      if (n.type !== type || n.chasing) continue;
      const d = dist2d(n.pos.x, n.pos.z, gx, gz);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best) return false;
    best.lureTarget = { x: gx, z: gz };
    best.lureTimer = 0;
    best.returnTarget = { x: best.pos.x, z: best.pos.z };
    if (best.zzzEmitter) best.zzzEmitter.active = false;
    return true;
  }

  /**
   * Advance all NPCs. Returns the type of the NPC that caught Mom, or null.
   */
  update(dt: number, mom: { x: number; z: number }, momHidden: boolean, frozen: boolean): NpcType | null {
    let caughtBy: NpcType | null = null;

    for (const npc of this.npcs) {
      if (!frozen) this.updateMovement(npc, dt, mom);
      this.updateVisuals(npc, dt);
      if (!frozen && !caughtBy) {
        if (this.updateSuspicion(npc, dt, mom, momHidden)) caughtBy = npc.type;
      }
    }
    return caughtBy;
  }

  private updateMovement(npc: NpcState, dt: number, mom: { x: number; z: number }) {
    let target: { x: number; z: number } | null = null;
    let speed = npc.speed;

    if (npc.chasing) {
      target = mom;
      speed = SUMMON_CHASE_SPEED;
    } else if (npc.lureTarget) {
      target = npc.lureTarget;
      speed = npc.speed * LURE_SPEED_MULT;
      const d = dist2d(npc.pos.x, npc.pos.z, target.x, target.z);
      if (d < 0.25) {
        npc.lureTimer += dt;
        target = null; // sniffing around the decoy
        if (npc.lureTimer > LURE_INVESTIGATE_SECS) {
          npc.lureTarget = null;
          if (npc.returnTarget) {
            npc.lureTarget = npc.returnTarget; // walk home
            npc.returnTarget = null;
            npc.lureTimer = -Infinity;          // don't re-trigger investigate
          }
        }
      }
    } else if (npc.patrol && npc.patrol.length > 0) {
      if (npc.pauseTimer > 0) {
        npc.pauseTimer -= dt;
      } else {
        const wp = npc.patrol[npc.patrolIdx];
        const d = dist2d(npc.pos.x, npc.pos.z, wp[0], wp[1]);
        if (d < 0.08) {
          npc.patrolIdx = (npc.patrolIdx + 1) % npc.patrol.length;
          npc.pauseTimer = npc.type === "cat" ? 3.5 + Math.random() * 2 : 0.9;
        } else {
          target = { x: wp[0], z: wp[1] };
        }
      }
    } else if (npc.zzzEmitter && !npc.lureTarget) {
      npc.zzzEmitter.active = true;
    }

    npc.moving = false;
    if (target) {
      const dx = target.x - npc.pos.x;
      const dz = target.z - npc.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.04) {
        const step = Math.min(speed * dt, d);
        npc.pos.x += (dx / d) * step;
        npc.pos.z += (dz / d) * step;
        const targetHeading = Math.atan2(dz, dx);
        // smooth turn
        let diff = targetHeading - npc.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.heading += diff * Math.min(1, dt * 8);
        npc.moving = true;
        npc.walkPhase += dt * speed * 3.4;
      }
    }
  }

  private updateVisuals(npc: NpcState, dt: number) {
    const wx = this.wx(npc.pos.x);
    const wz = this.wz(npc.pos.z);
    npc.rig.group.position.set(wx, FLOOR_TOP, wz);
    npc.rig.group.rotation.y = headingToYaw(npc.heading);

    // limb animation
    const r = npc.rig;
    if (npc.moving) {
      const swing = Math.sin(npc.walkPhase) * (npc.type === "toddler" ? 0.55 : 0.4);
      r.lLeg.rotation.x = swing;
      r.rLeg.rotation.x = -swing;
      if (npc.type !== "toddler") {
        r.lArm.rotation.x = -swing * 0.6;
        r.rArm.rotation.x = swing * 0.6;
      }
      if (npc.type === "toddler") r.group.rotation.z = Math.sin(npc.walkPhase) * 0.07;
    } else {
      r.lLeg.rotation.x *= 0.85;
      r.rLeg.rotation.x *= 0.85;
      r.lArm.rotation.x *= 0.85;
      r.rArm.rotation.x *= 0.85;
      r.group.rotation.z *= 0.85;
    }
    // idle breathing
    r.head.position.y = r.headBaseY + Math.sin(performance.now() * 0.0018 + npc.walkPhase) * 0.004;
    if (r.tail) r.tail.rotation.y = Math.sin(performance.now() * 0.004) * 0.4;

    // hazard visuals follow
    const t = performance.now() * 0.002;
    if (npc.disc && npc.pulseRing && npc.radius) {
      npc.disc.position.set(wx, FLOOR_TOP + 0.012, wz);
      npc.pulseRing.position.set(wx, FLOOR_TOP + 0.014, wz);
      const pulse = 1 + Math.sin(t * 1.6) * 0.05;
      npc.pulseRing.scale.set(pulse, pulse, 1);
      (npc.pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 1.6) * 0.15;
    }
    if (npc.coneMesh) {
      npc.coneMesh.position.set(wx, FLOOR_TOP + 0.016, wz);
      npc.coneMesh.rotation.y = -npc.heading;
      const m = npc.coneMesh.material as THREE.MeshBasicMaterial;
      const danger = Math.min(1, npc.suspicion / SUSPICION_SECS);
      m.color.set(CONE_COLORS[npc.type]).lerp(new THREE.Color(DANGER), danger);
      m.opacity = 0.28 + danger * 0.25 + Math.sin(t * 2.2) * 0.03;
    }
    if (npc.zzzEmitter) {
      npc.zzzEmitter.pos.set(wx + 0.08, FLOOR_TOP + 0.22, wz);
    }

    // occasional thought bubble
    npc.bubbleTimer -= dt;
    if (npc.bubbleTimer <= 0 && !npc.chasing) {
      if (npc.bubble) {
        npc.rig.group.remove(npc.bubble);
        npc.bubble.material.map?.dispose();
        npc.bubble.material.dispose();
        npc.bubble = undefined;
        npc.bubbleTimer = 4 + Math.random() * 4;
      } else {
        const texts = npc.type === "toddler" ? BABY_TALK
          : npc.type === "husband" ? DAD_THOUGHTS
          : npc.type === "cat" ? CAT_THOUGHTS : null;
        if (texts) {
          npc.bubbleIdx = (npc.bubbleIdx + 1) % texts.length;
          const s = textSprite(texts[npc.bubbleIdx], 30, "#4A4048", "#FFFFFF");
          s.position.y = npc.rig.headBaseY + 0.2;
          npc.rig.group.add(s);
          npc.bubble = s;
        }
        npc.bubbleTimer = 2.6;
      }
    }
  }

  private updateSuspicion(
    npc: NpcState, dt: number, mom: { x: number; z: number }, momHidden: boolean,
  ): boolean {
    let exposed = false;
    if (npc.radius !== undefined) {
      exposed = dist2d(mom.x, mom.z, npc.pos.x, npc.pos.z) < npc.radius;
    } else if (npc.range !== undefined && npc.angle !== undefined && !momHidden) {
      exposed = pointInCone(mom.x, mom.z, npc.pos.x, npc.pos.z, npc.heading, npc.angle, npc.range)
        && this.losClear(npc.pos.x, npc.pos.z, mom.x, mom.z);
    }

    if (exposed) {
      if (!npc.alertShown) {
        npc.alertShown = true;
        this.effects.alertPop(new THREE.Vector3(
          this.wx(npc.pos.x), FLOOR_TOP + npc.rig.headBaseY * 1.35 + 0.3, this.wz(npc.pos.z),
        ));
      }
      npc.suspicion += dt;
      if (npc.suspicion >= SUSPICION_SECS) return true;
    } else {
      npc.suspicion = Math.max(0, npc.suspicion - dt * SUSPICION_DECAY);
      if (npc.suspicion === 0) npc.alertShown = false;
    }
    return false;
  }

  /** Flash the catcher's hazard red (used the moment Mom is caught). */
  flashCaught(type: NpcType) {
    const npc = this.npcs.find((n) => n.type === type && n.suspicion > 0) ?? this.npcs.find((n) => n.type === type);
    if (!npc) return;
    if (npc.coneMesh) {
      const m = npc.coneMesh.material as THREE.MeshBasicMaterial;
      m.color.set(DANGER);
      m.opacity = 0.4;
    }
    if (npc.disc) {
      npc.disc.visible = true;
      (npc.pulseRing!.material as THREE.MeshBasicMaterial).color.set(DANGER);
    }
  }

  destroy() {
    for (const npc of this.npcs) {
      this.scene.remove(npc.rig.group);
      if (npc.coneMesh) this.scene.remove(npc.coneMesh);
      if (npc.disc) this.scene.remove(npc.disc);
      if (npc.pulseRing) this.scene.remove(npc.pulseRing);
    }
    this.npcs = [];
  }
}
