/**
 * Transient effects: tap ripples, path preview dots, sparkle bursts,
 * confetti, and looping ambient emitters (hearts / steam / bubbles /
 * notes / zzz) used by the relax scenes and sleeping NPCs.
 */

import * as THREE from "three";
import type { RelaxParticles } from "../world/types";

interface Particle {
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number };
  vel: THREE.Vector3;
  spin: number;
  life: number;
  ttl: number;
  grow: number;      // scale multiplier per second
  gravity: number;
  delay: number;
  baseScale: number;
  sway: number;
}

interface Emitter {
  kind: RelaxParticles;
  pos: THREE.Vector3;
  timer: number;
  interval: number;
  active: boolean;
}

interface Mote {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  ttl: number;
}

export class EffectsSystem {
  private particles: Particle[] = [];
  private emitters: Emitter[] = [];
  private motes: Mote[] = [];
  private moteBounds = { halfW: 1, halfH: 1 };
  private spriteCache = new Map<string, THREE.SpriteMaterial>();

  constructor(private scene: THREE.Scene) {}

  /** Slow-drifting dust motes inside the room — quiet MV ambience. */
  startMotes(halfW: number, halfH: number, count = 12) {
    this.moteBounds = { halfW, halfH };
    for (let i = 0; i < count; i++) this.spawnMote(true);
  }

  private spawnMote(randomLife = false) {
    const mat = this.spriteMat("●", "#FFFFFF").clone();
    mat.opacity = 0.1;
    const sprite = new THREE.Sprite(mat);
    const sc = 0.02 + Math.random() * 0.015;
    sprite.scale.set(sc, sc, 1);
    const { halfW, halfH } = this.moteBounds;
    sprite.position.set(
      (Math.random() * 2 - 1) * halfW,
      0.15 + Math.random() * 0.55,
      (Math.random() * 2 - 1) * halfH,
    );
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    const ttl = 6 + Math.random() * 4;
    this.motes.push({
      sprite,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.04, 0.012, (Math.random() - 0.5) * 0.04,
      ),
      life: randomLife ? Math.random() * ttl : 0,
      ttl,
    });
  }

  // ── sprite material cache ──────────────────────────────────────────────────
  private spriteMat(char: string, color: string): THREE.SpriteMaterial {
    const k = `${char}|${color}`;
    let m = this.spriteCache.get(k);
    if (!m) {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.font = `${size * 0.72}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(char, size / 2, size / 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this.spriteCache.set(k, m);
    }
    return m;
  }

  private spawnSprite(
    char: string, color: string, pos: THREE.Vector3,
    opts: Partial<Omit<Particle, "obj" | "mat">> & { scale?: number } = {},
  ) {
    const mat = this.spriteMat(char, color).clone();
    const s = new THREE.Sprite(mat);
    s.renderOrder = 20;
    const scale = opts.scale ?? 0.08;
    s.scale.set(scale, scale, 1);
    s.position.copy(pos);
    this.scene.add(s);
    this.particles.push({
      obj: s, mat, vel: opts.vel ?? new THREE.Vector3(0, 0.25, 0),
      spin: opts.spin ?? 0, life: 0, ttl: opts.ttl ?? 1.6,
      grow: opts.grow ?? 0, gravity: opts.gravity ?? 0,
      delay: opts.delay ?? 0, baseScale: scale, sway: opts.sway ?? 0,
    });
  }

  // ── one-shots ──────────────────────────────────────────────────────────────
  ripple(pos: THREE.Vector3, color: string) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 32), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).y += 0.005;
    m.renderOrder = 3;
    this.scene.add(m);
    this.particles.push({
      obj: m, mat, vel: new THREE.Vector3(), spin: 0, life: 0, ttl: 0.55,
      grow: 4.2, gravity: 0, delay: 0, baseScale: 1, sway: 0,
    });
  }

  pathDots(points: THREE.Vector3[], color: string) {
    points.forEach((p, i) => {
      if (i % 2 !== 0) return;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7, depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(p).y += 0.004;
      m.renderOrder = 3;
      this.scene.add(m);
      this.particles.push({
        obj: m, mat, vel: new THREE.Vector3(), spin: 0, life: 0,
        ttl: 0.5 + i * 0.02, grow: 0, gravity: 0, delay: i * 0.018,
        baseScale: 1, sway: 0,
      });
    });
  }

  sparkleBurst(pos: THREE.Vector3, color: string, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      this.spawnSprite("✦", color, pos, {
        vel: new THREE.Vector3(Math.cos(a) * 0.5, 0.7 + Math.random() * 0.5, Math.sin(a) * 0.5),
        gravity: 1.6, ttl: 0.7 + Math.random() * 0.3,
        scale: 0.05 + Math.random() * 0.04, spin: (Math.random() - 0.5) * 4,
      });
    }
  }

  /** Float a single character/emoji upward (token pickups, quips). */
  floatText(char: string, color: string, pos: THREE.Vector3, scale = 0.12) {
    this.spawnSprite(char, color, pos, {
      vel: new THREE.Vector3(0, 0.4, 0), ttl: 1.1, scale, grow: 0.3,
    });
  }

  alertPop(pos: THREE.Vector3, color = "#F4525E") {
    this.spawnSprite("!", color, pos, {
      vel: new THREE.Vector3(0, 0.35, 0), ttl: 0.8, scale: 0.16, grow: 0.6,
    });
  }

  confetti(center: THREE.Vector3, count = 80) {
    const colors = ["#F4A44E", "#E4506B", "#7EC9C4", "#E8C44E", "#9E7FB8", "#7FA88E"];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length], transparent: true, opacity: 1, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.02), mat);
      m.position.set(
        center.x + (Math.random() - 0.5) * 1.6,
        center.y + 1.1 + Math.random() * 0.6,
        center.z + (Math.random() - 0.5) * 1.6,
      );
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(m);
      this.particles.push({
        obj: m, mat, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.15 - Math.random() * 0.25, (Math.random() - 0.5) * 0.3),
        spin: 2 + Math.random() * 5, life: 0, ttl: 2.6 + Math.random() * 1.4,
        grow: 0, gravity: 0.12, delay: Math.random() * 0.8, baseScale: 1,
        sway: 0.4 + Math.random() * 0.5,
      });
    }
  }

  // ── looping emitters ───────────────────────────────────────────────────────
  startEmitter(kind: RelaxParticles, pos: THREE.Vector3, interval?: number): Emitter {
    const e: Emitter = {
      kind, pos: pos.clone(), timer: 0,
      interval: interval ?? DEFAULT_INTERVALS[kind], active: true,
    };
    this.emitters.push(e);
    return e;
  }

  stopEmitters() {
    this.emitters.forEach((e) => (e.active = false));
    this.emitters = [];
  }

  private emit(e: Emitter) {
    const jitter = () => (Math.random() - 0.5) * 0.08;
    const p = new THREE.Vector3(e.pos.x + jitter(), e.pos.y, e.pos.z + jitter());
    switch (e.kind) {
      case "hearts":
        this.spawnSprite("♥", "#E86E88", p, {
          vel: new THREE.Vector3(0, 0.22, 0), ttl: 2.2, scale: 0.05 + Math.random() * 0.035,
          sway: 0.5 + Math.random() * 0.4, grow: 0.12,
        });
        break;
      case "steam": {
        const mat = new THREE.SpriteMaterial({
          map: this.spriteMat("●", "#FFFFFF").map, transparent: true,
          opacity: 0.28, depthWrite: false,
        });
        const s = new THREE.Sprite(mat);
        s.scale.set(0.06, 0.06, 1);
        s.position.copy(p);
        this.scene.add(s);
        this.particles.push({
          obj: s, mat, vel: new THREE.Vector3(0, 0.16, 0), spin: 0, life: 0,
          ttl: 2.4, grow: 0.9, gravity: 0, delay: 0, baseScale: 0.06,
          sway: 0.3 + Math.random() * 0.3,
        });
        break;
      }
      case "bubbles": {
        const mat = new THREE.MeshBasicMaterial({
          color: "#CFEFF4", transparent: true, opacity: 0.65, depthWrite: false,
        });
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.018, 10, 10), mat);
        m.position.copy(p);
        this.scene.add(m);
        this.particles.push({
          obj: m, mat, vel: new THREE.Vector3(0, 0.18 + Math.random() * 0.1, 0),
          spin: 0, life: 0, ttl: 1.8, grow: 0.25, gravity: 0, delay: 0,
          baseScale: 1, sway: 0.6,
        });
        break;
      }
      case "notes":
        this.spawnSprite(Math.random() > 0.5 ? "♪" : "♫", "#F6EFDC", p, {
          vel: new THREE.Vector3(0.06, 0.24, 0), ttl: 2.0,
          scale: 0.055 + Math.random() * 0.03, sway: 0.7, spin: 0.6,
        });
        break;
      case "zzz":
        this.spawnSprite("z", "#DCE4F4", p, {
          vel: new THREE.Vector3(0.08, 0.16, 0), ttl: 2.4,
          scale: 0.045, grow: 0.5, sway: 0.4,
        });
        break;
      case "sparkles":
        this.spawnSprite("✦", "#F4E4A0", p, {
          vel: new THREE.Vector3(0, 0.14, 0), ttl: 1.6,
          scale: 0.035 + Math.random() * 0.03, spin: 1.5, sway: 0.3,
        });
        break;
    }
  }

  // ── frame update ───────────────────────────────────────────────────────────
  update(dt: number) {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const mo = this.motes[i];
      mo.life += dt;
      mo.sprite.position.addScaledVector(mo.vel, dt);
      mo.sprite.position.x += Math.sin(mo.life * 0.8) * 0.01 * dt;
      const t = mo.life / mo.ttl;
      mo.sprite.material.opacity = 0.1 * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      if (mo.life >= mo.ttl) {
        this.scene.remove(mo.sprite);
        mo.sprite.material.dispose();
        this.motes.splice(i, 1);
        this.spawnMote();
      }
    }

    for (const e of this.emitters) {
      if (!e.active) continue;
      e.timer += dt;
      if (e.timer >= e.interval) {
        e.timer = 0;
        this.emit(e);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.delay > 0) {
        p.delay -= dt;
        p.obj.visible = false;
        continue;
      }
      p.obj.visible = true;
      p.life += dt;
      if (p.life >= p.ttl) {
        this.scene.remove(p.obj);
        const mesh = p.obj as THREE.Mesh;
        if (mesh.geometry && !(p.obj instanceof THREE.Sprite)) mesh.geometry.dispose();
        p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.sway) p.obj.position.x += Math.sin(p.life * 3.2) * p.sway * dt * 0.3;
      if (p.spin) p.obj.rotation.z += p.spin * dt;
      if (p.grow) {
        const s = 1 + p.grow * p.life;
        if (p.obj instanceof THREE.Sprite) p.obj.scale.set(p.baseScale * s, p.baseScale * s, 1);
        else p.obj.scale.setScalar(p.baseScale * s);
      }
      // fade out over the last 40% of life
      const t = p.life / p.ttl;
      if (t > 0.6) p.mat.opacity = Math.min(p.mat.opacity, (1 - t) / 0.4);
    }
  }

  destroy() {
    for (const p of this.particles) {
      this.scene.remove(p.obj);
      p.mat.dispose();
    }
    this.particles = [];
    for (const mo of this.motes) {
      this.scene.remove(mo.sprite);
      mo.sprite.material.dispose();
    }
    this.motes = [];
    this.emitters = [];
    this.spriteCache.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.spriteCache.clear();
  }
}

const DEFAULT_INTERVALS: Record<RelaxParticles, number> = {
  hearts: 0.7, steam: 0.35, bubbles: 0.28, notes: 0.8, zzz: 1.1, sparkles: 0.45,
};
