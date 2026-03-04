interface Node {
  x: number;
  z: number;
  g: number;
  f: number;
}

export function findPath(
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
  blocked: Set<string>,
  gridW: number,
  gridH: number
): { x: number; z: number }[] | null {
  const key = (x: number, z: number) => `${x},${z}`;

  if (blocked.has(key(goalX, goalZ))) return null;

  const open: Node[] = [{ x: startX, z: startZ, g: 0, f: 0 }];
  const closed = new Set<string>();
  const came = new Map<string, string>();
  const gMap = new Map<string, number>();

  gMap.set(key(startX, startZ), 0);
  const h = (x: number, z: number) => Math.abs(x - goalX) + Math.abs(z - goalZ);
  open[0].f = h(startX, startZ);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const ck = key(cur.x, cur.z);

    if (cur.x === goalX && cur.z === goalZ) {
      const path: { x: number; z: number }[] = [{ x: cur.x, z: cur.z }];
      let k = ck;
      while (came.has(k)) {
        k = came.get(k)!;
        const [px, pz] = k.split(",").map(Number);
        path.unshift({ x: px, z: pz });
      }
      return path;
    }

    closed.add(ck);

    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      const nk = key(nx, nz);
      if (nx < 0 || nz < 0 || nx >= gridW || nz >= gridH) continue;
      if (blocked.has(nk) || closed.has(nk)) continue;
      const ng = cur.g + 1;
      if (ng < (gMap.get(nk) ?? Infinity)) {
        gMap.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, z: nz, g: ng, f: ng + h(nx, nz) });
      }
    }
  }

  return null;
}
