/**
 * Small Three.js building blocks shared by scenery / furniture / characters.
 * Everything uses flat MeshLambertMaterial — combined with pastel palettes
 * and soft lighting this gives the flat, matte Monument Valley look.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const matCache = new Map<string, THREE.MeshLambertMaterial>();

/** Cached flat material. */
export function mat(color: string): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

/** Non-cached material for things that animate their color/opacity. */
export function liveMat(color: string, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function box(
  w: number, h: number, d: number, color: string,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Rounded box — the signature soft MV silhouette. */
export function rbox(
  w: number, h: number, d: number, color: string,
  x = 0, y = 0, z = 0, radius?: number,
): THREE.Mesh {
  const r = radius ?? Math.min(w, h, d) * 0.22;
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(
  rTop: number, rBot: number, h: number, color: string,
  x = 0, y = 0, z = 0, segments = 20,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(
  r: number, color: string, x = 0, y = 0, z = 0, segments = 18,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segments, segments), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Shade/lighten a hex color by amount (-1..1). */
export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color("#FFFFFF"), amount);
  else c.lerp(new THREE.Color("#000000"), -amount);
  return `#${c.getHexString()}`;
}

/** Crisp text sprite drawn on a canvas (for emoji / "!" markers / Zzz). */
export function textSprite(
  text: string, fontPx = 48, color = "#FFFFFF", outline?: string,
): THREE.Sprite {
  const pad = 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontPx}px Georgia, serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;
  canvas.width = w * 2;
  canvas.height = h * 2;
  const c2 = canvas.getContext("2d")!;
  c2.scale(2, 2);
  c2.font = `${fontPx}px Georgia, serif`;
  c2.textAlign = "center";
  c2.textBaseline = "middle";
  if (outline) {
    c2.strokeStyle = outline;
    c2.lineWidth = 6;
    c2.strokeText(text, w / 2, h / 2);
  }
  c2.fillStyle = color;
  c2.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.renderOrder = 10;
  const aspect = w / h;
  sprite.scale.set(0.14 * aspect, 0.14, 1);
  return sprite;
}

/** Flat fan mesh for vision cones (points along math heading 0 = +x). */
export function coneFan(range: number, angle: number, color: string): THREE.Mesh {
  const segs = 24;
  const verts: number[] = [0, 0, 0];
  for (let i = 0; i <= segs; i++) {
    const a = -angle / 2 + (angle * i) / segs;
    verts.push(Math.cos(a) * range, 0, Math.sin(a) * range);
  }
  const idx: number[] = [];
  for (let i = 1; i <= segs; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    depthWrite: false,
  }));
  m.renderOrder = 2;
  return m;
}

/** Soft radial-gradient disc (sound radii, glows, blob shadows). */
export function gradientDisc(radius: number, color: string, alpha = 0.28): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.75, `rgba(${rgb},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

export function ring(radius: number, width: number, color: string, opacity = 0.6): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius - width / 2, radius + width / 2, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** Dispose a subtree's geometries (materials are mostly cached/shared). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
