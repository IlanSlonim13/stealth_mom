/**
 * Game orchestrator. Owns the Three.js scene and the frame loop, and wires
 * the systems together: SceneryBuilder (diorama), FurnitureFactory,
 * NpcSystem (AI + detection), EffectsSystem (juice), RelaxDirector (win
 * scene). React never touches Three directly — it talks to this class via
 * a small API + GameCallbacks.
 *
 * State machine: intro → play → (caught | winZoom → relax)
 */

import * as THREE from "three";
import type { DecoyItemDef, GameCallbacks, LevelData, NpcType, TokenType } from "../world/types";
import { getTheme, type Theme } from "../world/themes";
import { findPath } from "../pathfinding/Pathfinder";
import {
  TILE_SIZE, FLOOR_TOP, MOM_SPEED,
  PICKUP_RANGE, TOKEN_RANGE,
  CAUGHT_DELAY_MS, INTRO_HOLD_SECS, INTRO_ZOOM_SECS, WIN_ZOOM_SECS,
  LURE_INVESTIGATE_SECS,
} from "../utils/constants";
import { clamp01, easeInOutCubic, easeOutQuad, damp, lerp } from "../utils/easing";
import { dist2d } from "../utils/coordinates";
import { SceneryBuilder } from "./SceneryBuilder";
import { buildFurniture } from "./FurnitureFactory";
import { buildMom, type CharacterRig } from "./CharacterFactory";
import { NpcSystem } from "./NpcSystem";
import { EffectsSystem } from "./EffectsSystem";
import { RelaxDirector } from "./RelaxDirector";
import { box, cyl, rbox, sphere, gradientDisc, ring, liveMat, textSprite, disposeTree, mat, shade } from "./helpers";
import { AudioManager } from "./AudioManager";
import { CAUGHT_BY, pickRandom } from "../world/dialog";

type GameState = "intro" | "play" | "caught" | "winZoom" | "relax";

interface TrapState { x: number; z: number; group: THREE.Group; triggered: boolean }
interface TokenState {
  x: number; z: number; type: TokenType; group: THREE.Group; collected: boolean;
}

const TOKEN_EMOJI: Record<TokenType, string> = { coffee: "☕", chocolate: "🍫", book: "📖" };

export class Game {
  private scene = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private theme: Theme;
  private cx: number;
  private cz: number;

  private state: GameState = "intro";
  private stateT = 0;

  private mom!: CharacterRig;
  private momPos = { x: 0, z: 0 };
  private momPath: { x: number; z: number }[] | null = null;
  private momPathIdx = 0;
  private walkPhase = 0;
  private stepTimer = 0;

  private npcs!: NpcSystem;
  private effects!: EffectsSystem;
  private relax!: RelaxDirector;
  private scenery!: SceneryBuilder;

  private traps: TrapState[] = [];
  private tokens: TokenState[] = [];
  private tokensCollected = 0;
  private summoned = false;

  private goalGroup!: THREE.Group;
  private hidingTents: { x: number; z: number }[] = [];
  private decoySources = new Map<string, { def: DecoyItemDef; marker: THREE.Group; taken: boolean }>();
  private heldItem: DecoyItemDef | null = null;
  private throwMode = false;
  private thrownDecoy: THREE.Group | null = null;
  private lastNearPickup: string | null = null;

  // camera
  private frustFit = 6;
  private frust = 6;
  private frustTarget = 6;
  private camTarget = new THREE.Vector3();
  private camTargetGoal = new THREE.Vector3();
  private introFrom = new THREE.Vector3();
  private panOffset = new THREE.Vector3();
  private keyLight!: THREE.DirectionalLight;
  private relaxSpot: THREE.SpotLight | null = null;
  private relaxDim = 0;

  // input
  private pointers = new Map<number, { x: number; y: number }>();
  private downInfo: { x: number; y: number; t: number } | null = null;
  private pinchStart = { dist: 0, frust: 0 };
  private panStart = { x: 0, y: 0, offset: new THREE.Vector3() };

  private tilePlane!: THREE.Mesh;
  private clock = new THREE.Clock();
  private animId = 0;
  private destroyed = false;

  constructor(
    private element: HTMLElement,
    private level: LevelData,
    private callbacks: GameCallbacks,
  ) {
    this.theme = getTheme(level.theme);
    this.cx = level.grid.w / 2 - 0.5;
    this.cz = level.grid.h / 2 - 0.5;
    this.init();
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Game }).__game = this;
    }
  }

  /** Dev helper: teleport Mom to a tile (used by headless visual tests). */
  debugWarp(gx: number, gz: number) {
    if (!import.meta.env.DEV) return;
    this.momPos = { x: gx, z: gz };
    this.momPath = null;
    if (this.state === "intro") {
      this.setState("play");
      this.callbacks.onIntroDone();
    }
  }

  /** Dev helper: request a move as if the player tapped a tile. */
  debugTapTile(gx: number, gz: number) {
    if (!import.meta.env.DEV) return;
    const sx = Math.round(this.momPos.x);
    const sz = Math.round(this.momPos.z);
    const path = findPath(sx, sz, gx, gz, this.level.blocked, this.level.grid.w, this.level.grid.h);
    if (path && path.length > 1) {
      this.momPath = path.slice(1);
      this.momPathIdx = 0;
    }
  }

  private wx(gx: number) { return (gx - this.cx) * TILE_SIZE; }
  private wz(gz: number) { return (gz - this.cz) * TILE_SIZE; }

  // ── Init ───────────────────────────────────────────────────────────────────
  private init() {
    const el = this.element;
    const lvl = this.level;
    const t = this.theme;

    // renderer — transparent so the CSS sky gradient shows through
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);

    // camera
    const aspect = el.clientWidth / el.clientHeight;
    this.frustFit = (Math.max(lvl.grid.w, lvl.grid.h) * TILE_SIZE * 0.62) / Math.min(aspect, 1);
    this.frust = this.frustFit * 0.24;
    this.frustTarget = this.frustFit;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(10, 10, 10);
    this.applyCamera();

    // lights
    this.scene.add(new THREE.AmbientLight(t.ambient, 0.85));
    const hemi = new THREE.HemisphereLight(t.sky[0], t.plinthSide, 0.35);
    this.scene.add(hemi);
    this.keyLight = new THREE.DirectionalLight(t.dirLight, 1.15);
    this.keyLight.position.set(6, 12, 4);
    this.keyLight.castShadow = true;
    const ext = Math.max(lvl.grid.w, lvl.grid.h) * TILE_SIZE * 0.7;
    this.keyLight.shadow.camera.left = -ext;
    this.keyLight.shadow.camera.right = ext;
    this.keyLight.shadow.camera.top = ext;
    this.keyLight.shadow.camera.bottom = -ext;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0004;
    this.scene.add(this.keyLight);
    const fill = new THREE.DirectionalLight(t.sky[1], 0.22);
    fill.position.set(-8, 6, -6);
    this.scene.add(fill);

    // world
    this.scenery = new SceneryBuilder(lvl, t);
    this.scene.add(this.scenery.group);
    this.buildFurnitureAll();
    this.buildTraps();
    this.buildTokens();
    this.buildGoal();
    this.buildHidingSpots();

    // characters + systems
    this.effects = new EffectsSystem(this.scene);
    this.mom = buildMom(t);
    this.momPos = { x: lvl.start[0], z: lvl.start[1] };
    this.mom.group.position.set(this.wx(this.momPos.x), FLOOR_TOP, this.wz(this.momPos.z));
    this.mom.group.rotation.y = Math.PI / 4; // face camera
    this.scene.add(this.mom.group);
    this.npcs = new NpcSystem(this.scene, lvl, this.effects);
    this.relax = new RelaxDirector(this.scene, this.mom, t, lvl.relax, this.effects, this.cx, this.cz);

    // invisible tap plane covering the grid
    this.tilePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(lvl.grid.w * TILE_SIZE, lvl.grid.h * TILE_SIZE),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.tilePlane.rotation.x = -Math.PI / 2;
    this.tilePlane.position.y = FLOOR_TOP;
    this.scene.add(this.tilePlane);

    // intro camera: close-up on Mom
    const momW = new THREE.Vector3(this.wx(this.momPos.x), 0, this.wz(this.momPos.z));
    this.introFrom.copy(momW);
    this.camTarget.copy(momW);
    this.camTargetGoal.set(0, 0, 0);

    AudioManager.preload([
      "footstep-soft", "squeak", "caught-mommy", "caught-dog", "caught-husband",
      "success", "decoy-throw", "ambient-hum", "mom-sigh", "token-pickup",
    ]);
    AudioManager.startAmbient();

    window.addEventListener("resize", this.onResize);
    const c = this.renderer.domElement;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });

    this.animate();
  }

  // ── World builders ─────────────────────────────────────────────────────────
  private buildFurnitureAll() {
    for (const f of this.level.furniture) {
      const grp = buildFurniture(f, this.theme);
      grp.position.set(
        this.wx(f.x + f.w / 2 - 0.5),
        FLOOR_TOP,
        this.wz(f.z + f.h / 2 - 0.5),
      );
      this.scene.add(grp);

      if (f.hasDecoy && f.label) {
        const def = this.level.decoyItems?.find((d) => d.sourceLabel === f.label);
        if (def) {
          const marker = new THREE.Group();
          const glow = gradientDisc(0.22, this.theme.accent, 0.5);
          glow.position.y = 0.005;
          const icon = textSprite(def.itemEmoji, 40);
          icon.position.y = 0.52;
          icon.scale.multiplyScalar(1.15);
          marker.add(glow, icon);
          marker.position.copy(grp.position);
          this.scene.add(marker);
          this.decoySources.set(def.itemName, { def, marker, taken: false });
        }
      }
    }
  }

  private buildTraps() {
    for (const [x, z] of this.level.traps ?? []) {
      const grp = new THREE.Group();
      // squeaky duck
      const bodyMat = liveMat("#F2C94E");
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), bodyMat);
      body.position.y = 0.034;
      body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), bodyMat);
      head.position.set(0, 0.062, 0.024);
      head.castShadow = true;
      const beak = box(0.016, 0.008, 0.016, "#E8823A", 0, 0.058, 0.048);
      const warn = gradientDisc(0.12, "#E8A054", 0.35);
      warn.position.y = 0.004;
      grp.add(body, head, beak, warn);
      grp.rotation.y = ((x * 7 + z * 13) % 6) * 1.1;
      grp.position.set(this.wx(x), FLOOR_TOP, this.wz(z));
      this.scene.add(grp);
      this.traps.push({ x, z, group: grp, triggered: false });
    }
  }

  private buildTokens() {
    for (const tk of this.level.tokens) {
      const grp = new THREE.Group();
      let item: THREE.Object3D;
      if (tk.type === "coffee") {
        const g = new THREE.Group();
        g.add(cyl(0.032, 0.028, 0.05, "#F6F1E8", 0, 0, 0, 14));
        g.add(cyl(0.026, 0.026, 0.006, "#6E4A2E", 0, 0.026, 0, 12));
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 8, 14), mat("#F6F1E8"));
        handle.position.x = 0.034;
        g.add(handle);
        item = g;
      } else if (tk.type === "chocolate") {
        const g = new THREE.Group();
        g.add(rbox(0.07, 0.016, 0.045, "#5E3A26", 0, 0, 0, 0.005));
        g.add(box(0.062, 0.018, 0.02, "#C94E6E", 0, 0, 0));
        item = g;
      } else {
        const g = new THREE.Group();
        g.add(rbox(0.06, 0.05, 0.016, this.theme.accent, 0, 0, 0, 0.006));
        g.add(box(0.052, 0.042, 0.017, "#F6F1E4", 0.004, 0, 0.0005));
        item = g;
      }
      item.scale.setScalar(1.5);
      item.position.y = 0.19;
      const glow = gradientDisc(0.2, this.theme.accent, 0.6);
      glow.position.y = 0.004;
      grp.add(item, glow);
      grp.position.set(this.wx(tk.x), FLOOR_TOP, this.wz(tk.z));
      grp.userData.item = item;
      this.scene.add(grp);
      this.tokens.push({ x: tk.x, z: tk.z, type: tk.type, group: grp, collected: false });
    }
  }

  private buildGoal() {
    const g = this.level.goal;
    const grp = new THREE.Group();
    const disc = gradientDisc(0.38, this.theme.accent, 0.5);
    disc.position.y = 0.004;
    const r1 = ring(0.21, 0.035, this.theme.accent, 0.9);
    r1.position.y = 0.006;
    r1.name = "goalRing";
    // soft beacon column
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.17, 0.55, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.theme.accent, transparent: true, opacity: 0.12,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beacon.position.y = 0.28;
    beacon.name = "goalBeacon";
    grp.add(disc, r1, beacon);
    grp.position.set(this.wx(g.x), FLOOR_TOP, this.wz(g.z));
    this.scene.add(grp);
    this.goalGroup = grp;
  }

  private buildHidingSpots() {
    for (const [x, z] of this.level.hidingSpots ?? []) {
      const tentMat = liveMat(shade(this.theme.fabricAlt, 0.12), { transparent: true, opacity: 0.82 });
      const tent = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8, 1, true), tentMat);
      tent.position.set(this.wx(x), FLOOR_TOP + 0.15, this.wz(z));
      tent.castShadow = true;
      const trim = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.1, 8),
        mat(this.theme.accent),
      );
      trim.position.set(this.wx(x), FLOOR_TOP + 0.33, this.wz(z));
      const glow = gradientDisc(0.2, "#FFFFFF", 0.22);
      glow.position.set(this.wx(x), FLOOR_TOP + 0.006, this.wz(z));
      this.scene.add(tent, trim, glow);
      this.hidingTents.push({ x, z });
    }
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────
  private animate = () => {
    if (this.destroyed) return;
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.stateT += dt;

    switch (this.state) {
      case "intro": this.updateIntro(); break;
      case "play": this.updatePlay(dt); break;
      case "caught": this.npcs.update(dt, this.momPos, this.isHidden(), true); break;
      case "winZoom": this.updateWinZoom(dt); break;
      case "relax": this.updateRelax(dt); break;
    }

    this.effects.update(dt);
    this.updateAmbientVisuals();
    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private updateIntro() {
    const hold = INTRO_HOLD_SECS;
    const zoom = INTRO_ZOOM_SECS;
    const t = this.stateT;
    if (t < hold) {
      // hold close-up
    } else if (t < hold + zoom) {
      const k = easeInOutCubic(clamp01((t - hold) / zoom));
      this.frust = lerp(this.frustFit * 0.24, this.frustFit, k);
      this.camTarget.lerpVectors(this.introFrom, this.camTargetGoal, k);
    } else {
      this.frust = this.frustFit;
      this.frustTarget = this.frustFit;
      this.camTarget.copy(this.camTargetGoal);
      this.setState("play");
      this.callbacks.onIntroDone();
    }
  }

  private updatePlay(dt: number) {
    this.updateMomMovement(dt);
    this.frust = damp(this.frust, this.frustTarget, 8, dt);

    const caughtBy = this.npcs.update(dt, this.momPos, this.isHidden(), false);
    if (caughtBy) { this.triggerCaught(caughtBy); return; }
    this.checkTraps();
    this.checkTokens();
    this.checkPickups();
    this.checkGoal();
  }

  private updateMomMovement(dt: number) {
    const m = this.mom;
    if (this.momPath && this.momPathIdx < this.momPath.length) {
      const target = this.momPath[this.momPathIdx];
      const dx = target.x - this.momPos.x;
      const dz = target.z - this.momPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.06) {
        this.momPos.x = target.x;
        this.momPos.z = target.z;
        this.momPathIdx++;
      } else {
        const step = Math.min(MOM_SPEED * dt, d);
        this.momPos.x += (dx / d) * step;
        this.momPos.z += (dz / d) * step;
        m.group.rotation.y = Math.atan2(dx, dz);
      }
      this.walkPhase += dt * 11;
      const swing = Math.sin(this.walkPhase) * 0.42;
      m.lLeg.rotation.x = swing;
      m.rLeg.rotation.x = -swing;
      m.lArm.rotation.x = -swing * 0.55;
      m.rArm.rotation.x = swing * 0.55;
      m.group.position.y = FLOOR_TOP + Math.abs(Math.sin(this.walkPhase)) * 0.008;
      this.stepTimer += dt;
      if (this.stepTimer > 0.26) {
        this.stepTimer = 0;
        AudioManager.play("footstep-soft");
      }
    } else {
      // idle sway
      m.lLeg.rotation.x *= 0.85;
      m.rLeg.rotation.x *= 0.85;
      m.lArm.rotation.x *= 0.85;
      m.rArm.rotation.x *= 0.85;
      m.group.position.y = FLOOR_TOP;
      m.head.position.y = m.headBaseY + Math.sin(performance.now() * 0.0016) * 0.004;
    }
    m.group.position.x = this.wx(this.momPos.x);
    m.group.position.z = this.wz(this.momPos.z);
  }

  private isHidden(): boolean {
    return this.hidingTents.some(
      (h) => dist2d(this.momPos.x, this.momPos.z, h.x, h.z) < 0.75,
    );
  }

  private checkTraps() {
    for (const tr of this.traps) {
      if (tr.triggered) continue;
      if (dist2d(this.momPos.x, this.momPos.z, tr.x, tr.z) < 0.55) {
        tr.triggered = true;
        AudioManager.play("squeak");
        tr.group.children.forEach((c) => {
          const mesh = c as THREE.Mesh;
          const mm = mesh.material as THREE.MeshLambertMaterial;
          if (mm && "color" in mm && mm.transparent !== true) mm.color?.set("#E8425A");
        });
        this.effects.alertPop(tr.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
        const summon = this.level.summonNpc;
        if (summon && !this.summoned) {
          this.summoned = true;
          this.npcs.summon(summon);
        } else if (!summon) {
          this.triggerCaught("trap");
        } else {
          // subsequent squeaks speed the chaser up by nudging it to Mom
          this.npcs.lure(summon.type, this.momPos.x, this.momPos.z);
        }
        return;
      }
    }
  }

  private checkTokens() {
    for (const tk of this.tokens) {
      if (tk.collected) continue;
      if (dist2d(this.momPos.x, this.momPos.z, tk.x, tk.z) < TOKEN_RANGE) {
        tk.collected = true;
        this.tokensCollected++;
        AudioManager.play("token-pickup");
        const pos = tk.group.position.clone().add(new THREE.Vector3(0, 0.2, 0));
        this.effects.sparkleBurst(pos, this.theme.accent, 12);
        this.effects.floatText(TOKEN_EMOJI[tk.type], "#FFFFFF", pos, 0.16);
        this.scene.remove(tk.group);
        disposeTree(tk.group);
        this.callbacks.onToken(this.tokensCollected);
      }
    }
  }

  private checkPickups() {
    let near: string | null = null;
    for (const [name, src] of this.decoySources) {
      if (src.taken || this.heldItem) continue;
      const f = this.level.furniture.find((ff) => ff.label === src.def.sourceLabel)!;
      const fx = f.x + f.w / 2 - 0.5;
      const fz = f.z + f.h / 2 - 0.5;
      if (dist2d(this.momPos.x, this.momPos.z, fx, fz) < PICKUP_RANGE) {
        near = name;
        break;
      }
    }
    if (near !== this.lastNearPickup) {
      this.lastNearPickup = near;
      this.callbacks.onNearPickup(near);
    }
  }

  private checkGoal() {
    const g = this.level.goal;
    if (dist2d(this.momPos.x, this.momPos.z, g.x, g.z) < 0.5) {
      this.momPath = null;
      AudioManager.play("success");
      AudioManager.stopAmbient();
      this.setState("winZoom");
      this.callbacks.onWon(this.tokensCollected);
    }
  }

  private updateWinZoom(dt: number) {
    const k = easeInOutCubic(clamp01(this.stateT / WIN_ZOOM_SECS));
    const seat = this.relax.getSeatWorld();
    this.frust = lerp(this.frustFit, this.frustFit * 0.3, k);
    this.camTarget.lerp(new THREE.Vector3(seat.x, 0.15, seat.z), Math.min(1, dt * 4));
    this.panOffset.multiplyScalar(1 - Math.min(1, dt * 4));
    this.relaxDim = damp(this.relaxDim, 1, 2.5, dt);
    this.applyRelaxLighting(seat);
    if (this.stateT >= WIN_ZOOM_SECS) {
      this.setState("relax");
      this.relax.start();
      this.callbacks.onRelaxStarted();
      setTimeout(() => AudioManager.play("mom-sigh"), 2200);
      if (this.level.id === 15) {
        setTimeout(() => this.effects.confetti(seat), 2600);
      }
    }
  }

  private updateRelax(dt: number) {
    this.relax.update(dt);
    const seat = this.relax.getSeatWorld();
    // gentle camera breathing + drift
    const t = this.stateT;
    this.frust = this.frustFit * 0.3 * (1 + Math.sin(t * 0.5) * 0.012);
    this.camTarget.x = seat.x + Math.sin(t * 0.22) * 0.05;
    this.camTarget.z = seat.z + Math.cos(t * 0.18) * 0.05;
    this.camTarget.y = 0.15;
    this.relaxDim = damp(this.relaxDim, 1, 2.5, dt);
    this.applyRelaxLighting(seat);
  }

  private applyRelaxLighting(seat: THREE.Vector3) {
    this.keyLight.intensity = lerp(1.15, 0.55, this.relaxDim);
    if (!this.relaxSpot) {
      this.relaxSpot = new THREE.SpotLight("#FFDFB0", 0, 4, Math.PI / 5, 0.7, 1.2);
      this.relaxSpot.position.set(seat.x + 0.4, 2.2, seat.z + 0.4);
      this.relaxSpot.target.position.copy(seat);
      this.scene.add(this.relaxSpot, this.relaxSpot.target);
    }
    this.relaxSpot.intensity = this.relaxDim * 3.2;
  }

  private updateAmbientVisuals() {
    const t = performance.now() * 0.001;
    // goal ring pulse
    const gr = this.goalGroup.getObjectByName("goalRing");
    if (gr) {
      const s = 1 + Math.sin(t * 2.4) * 0.1;
      gr.scale.set(s, s, 1);
    }
    // tokens bob + spin
    for (const tk of this.tokens) {
      if (tk.collected) continue;
      const item = tk.group.userData.item as THREE.Object3D;
      item.position.y = 0.19 + Math.sin(t * 2 + tk.x) * 0.025;
      item.rotation.y = t * 1.4 + tk.z;
    }
    // decoy markers bob
    for (const src of this.decoySources.values()) {
      if (src.taken) continue;
      const icon = src.marker.children[1];
      icon.position.y = 0.52 + Math.sin(t * 2.2) * 0.03;
    }
  }

  private setState(s: GameState) {
    this.state = s;
    this.stateT = 0;
  }

  private triggerCaught(by: NpcType | "trap") {
    if (this.state !== "play") return;
    this.setState("caught");
    this.momPath = null;
    if (by !== "trap") this.npcs.flashCaught(by);
    const sound = by === "dog" || by === "cat" ? "caught-dog"
      : by === "husband" ? "caught-husband" : "caught-mommy";
    AudioManager.play(sound);
    AudioManager.stopAmbient();
    const pool = [...(CAUGHT_BY[by] ?? []), ...this.level.caughtLines];
    const line = pickRandom(pool);
    setTimeout(() => {
      if (!this.destroyed) this.callbacks.onCaught(line, by);
    }, CAUGHT_DELAY_MS);
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  private applyCamera() {
    const aspect = this.element.clientWidth / Math.max(1, this.element.clientHeight);
    const f = this.frust;
    this.camera.left = -f * aspect;
    this.camera.right = f * aspect;
    this.camera.top = f;
    this.camera.bottom = -f;
    const target = this.camTarget.clone().add(this.panOffset);
    this.camera.position.set(target.x + 10, target.y + 10, target.z + 10);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.downInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
    } else if (this.pointers.size === 2) {
      this.downInfo = null;
      const [a, b] = [...this.pointers.values()];
      this.pinchStart.dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStart.frust = this.frustTarget;
      this.panStart.x = (a.x + b.x) / 2;
      this.panStart.y = (a.y + b.y) / 2;
      this.panStart.offset.copy(this.panOffset);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.state === "play") {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart.dist > 0) {
        this.frustTarget = THREE.MathUtils.clamp(
          this.pinchStart.frust * (this.pinchStart.dist / Math.max(20, dist)),
          this.frustFit * 0.35,
          this.frustFit * 1.4,
        );
      }
      // two-finger pan
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const scale = (this.frust * 2) / this.element.clientHeight;
      const dxs = (mx - this.panStart.x) * scale;
      const dys = (my - this.panStart.y) * scale;
      // screen right = world (x-z)/√2 ; screen up = world -(x+z)/√2 (iso at 45°)
      const rt = new THREE.Vector3(1, 0, -1).normalize().multiplyScalar(-dxs);
      const up = new THREE.Vector3(-1, 0, -1).normalize().multiplyScalar(-dys);
      this.panOffset.copy(this.panStart.offset).add(rt).add(up);
      const lim = Math.max(this.level.grid.w, this.level.grid.h) * TILE_SIZE * 0.5;
      this.panOffset.clampLength(0, lim);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.downInfo && this.pointers.size === 0) {
      const dx = e.clientX - this.downInfo.x;
      const dy = e.clientY - this.downInfo.y;
      const dt = performance.now() - this.downInfo.t;
      if (Math.hypot(dx, dy) < 10 && dt < 450) {
        this.handleTap(e.clientX, e.clientY);
      }
      this.downInfo = null;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.state !== "play") return;
    e.preventDefault();
    this.frustTarget = THREE.MathUtils.clamp(
      this.frustTarget * (1 + Math.sign(e.deltaY) * 0.08),
      this.frustFit * 0.35,
      this.frustFit * 1.4,
    );
  };

  private raycastFromScreen(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.element.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    return ray;
  }

  private handleTap(clientX: number, clientY: number) {
    const ray = this.raycastFromScreen(clientX, clientY);

    if (this.state === "relax") {
      const feedback = this.relax.handleTap(ray);
      if (feedback) {
        this.callbacks.onRelaxFeedback(feedback, clientX, clientY - 40);
      }
      return;
    }
    if (this.state !== "play") return;

    const hits = ray.intersectObject(this.tilePlane);
    if (hits.length === 0) return;
    const p = hits[0].point;
    const gx = Math.round(p.x / TILE_SIZE + this.cx);
    const gz = Math.round(p.z / TILE_SIZE + this.cz);
    if (gx < 0 || gz < 0 || gx >= this.level.grid.w || gz >= this.level.grid.h) return;

    if (this.throwMode && this.heldItem) {
      this.throwDecoyAt(gx, gz);
      return;
    }

    // move
    const sx = Math.round(this.momPos.x);
    const sz = Math.round(this.momPos.z);
    const path = findPath(sx, sz, gx, gz, this.level.blocked, this.level.grid.w, this.level.grid.h);
    const tapWorld = new THREE.Vector3(this.wx(gx), FLOOR_TOP, this.wz(gz));
    if (path && path.length > 1) {
      this.momPath = path.slice(1);
      this.momPathIdx = 0;
      this.effects.ripple(tapWorld, this.theme.accent);
      this.effects.pathDots(
        path.map((pt) => new THREE.Vector3(this.wx(pt.x), FLOOR_TOP, this.wz(pt.z))),
        this.theme.accent,
      );
    } else {
      this.effects.ripple(tapWorld, "#FFFFFF");
    }
  }

  private throwDecoyAt(gx: number, gz: number) {
    const item = this.heldItem!;
    this.npcs.lure(item.targetNpc, gx, gz);
    AudioManager.play("decoy-throw");

    if (this.thrownDecoy) {
      this.scene.remove(this.thrownDecoy);
      disposeTree(this.thrownDecoy);
    }
    const grp = new THREE.Group();
    const ball = sphere(0.045, item.meshColor, 0, 0.05, 0, 12);
    const glow = gradientDisc(0.16, this.theme.accent, 0.5);
    glow.position.y = 0.004;
    const icon = textSprite(item.itemEmoji, 36);
    icon.position.y = 0.28;
    grp.add(ball, glow, icon);
    grp.position.set(this.wx(gx), FLOOR_TOP, this.wz(gz));
    this.scene.add(grp);
    this.thrownDecoy = grp;
    this.effects.ripple(grp.position.clone(), this.theme.accent);
    setTimeout(() => {
      if (this.thrownDecoy === grp && !this.destroyed) {
        this.scene.remove(grp);
        disposeTree(grp);
        this.thrownDecoy = null;
      }
    }, (LURE_INVESTIGATE_SECS + 2) * 1000);

    this.heldItem = null;
    this.throwMode = false;
    this.callbacks.onDecoyThrown();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  /** Mark an item as picked up (called from HUD's GRAB button). */
  pickUpItem(itemName: string) {
    const src = this.decoySources.get(itemName);
    if (!src || src.taken) return;
    src.taken = true;
    this.scene.remove(src.marker);
    disposeTree(src.marker);
    this.heldItem = src.def;
    this.lastNearPickup = null;
    this.callbacks.onNearPickup(null);
    this.effects.sparkleBurst(
      this.mom.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)),
      this.theme.accent, 8,
    );
  }

  setThrowMode(v: boolean) {
    this.throwMode = v;
  }

  getMomScreenPos(): { x: number; y: number } {
    const v = this.mom.group.position.clone();
    v.project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h - 90 };
  }

  private onResize = () => {
    const el = this.element;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    const aspect = el.clientWidth / el.clientHeight;
    this.frustFit = (Math.max(this.level.grid.w, this.level.grid.h) * TILE_SIZE * 0.62) / Math.min(aspect, 1);
    this.applyCamera();
  };

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener("resize", this.onResize);
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    AudioManager.stopAmbient();
    this.effects.destroy();
    this.npcs.destroy();
    this.relax.destroy();
    this.renderer.dispose();
    this.element.removeChild(this.renderer.domElement);
  }
}
