import { TILE_SIZE } from "./constants";

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

/**
 * Is point (px,pz) inside a vision cone at (ox,oz)?
 * `heading` is the math angle in the xz plane: atan2(dz, dx).
 */
export function pointInCone(
  px: number, pz: number,
  ox: number, oz: number,
  heading: number, angle: number, range: number,
): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > range || d < 0.01) return false;
  let diff = Math.atan2(dz, dx) - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) < angle / 2;
}

/** Grid → world (world origin is grid center). cx/cz = grid.w/2 - 0.5 etc. */
export function gridToWorld(gx: number, gz: number, cx: number, cz: number) {
  return { x: (gx - cx) * TILE_SIZE, z: (gz - cz) * TILE_SIZE };
}

/** Model yaw (rotation.y) that makes a +z-facing model look along math heading. */
export function headingToYaw(heading: number): number {
  return Math.PI / 2 - heading;
}
