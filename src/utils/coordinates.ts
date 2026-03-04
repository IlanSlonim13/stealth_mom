export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

export function pointInCone(
  px: number,
  pz: number,
  ox: number,
  oz: number,
  dir: number,
  angle: number,
  range: number
): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > range || d < 0.01) return false;
  const a = Math.atan2(dz, dx);
  let diff = a - dir;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) < angle / 2;
}

import { TILE_SIZE } from "./constants";

/** Convert grid position to Three.js world position (centered on grid) */
export function gridToWorld(gx: number, gz: number, cx: number, cz: number) {
  return { x: (gx - cx) * TILE_SIZE, z: (gz - cz) * TILE_SIZE };
}
