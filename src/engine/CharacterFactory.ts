/**
 * Character rigs. Chunky, faceless, Monument Valley-style figures built
 * from spheres and rounded boxes. Every rig exposes named pivots the
 * animation code drives (legs/arms swing while walking, sit poses, tails).
 */

import * as THREE from "three";
import type { Theme } from "../world/themes";
import { rbox, cyl, sphere, mat, shade } from "./helpers";

export interface CharacterRig {
  group: THREE.Group;
  head: THREE.Group;
  headBaseY: number;
  lArm: THREE.Group;
  rArm: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  lCalf?: THREE.Group;
  rCalf?: THREE.Group;
  body: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Where held props should attach (in front of chest). */
  handAnchor?: THREE.Group;
}

const SKIN = "#F2C9A4";

function limb(len: number, r: number, color: string, capColor?: string): THREE.Group {
  const pivot = new THREE.Group();
  const m = cyl(r, r * 0.85, len, color, 0, -len / 2, 0, 10);
  pivot.add(m);
  if (capColor) pivot.add(sphere(r * 0.95, capColor, 0, -len, 0, 10));
  return pivot;
}

// ── Mom ──────────────────────────────────────────────────────────────────────
export function buildMom(theme: Theme): CharacterRig {
  const group = new THREE.Group();
  const top = theme.outfitTop;
  const pants = theme.outfitPants;
  const hair = theme.hair;

  const hipY = 0.185;
  const legLen = 0.095;

  const lLeg = limb(legLen, 0.023, pants);
  lLeg.position.set(-0.032, hipY, 0);
  const lCalf = limb(legLen, 0.02, pants, "#F6F1E6");
  lCalf.position.y = -legLen;
  lLeg.add(lCalf);

  const rLeg = limb(legLen, 0.023, pants);
  rLeg.position.set(0.032, hipY, 0);
  const rCalf = limb(legLen, 0.02, pants, "#F6F1E6");
  rCalf.position.y = -legLen;
  rLeg.add(rCalf);

  // torso — soft oversized-sweater silhouette
  const body = rbox(0.135, 0.19, 0.1, top, 0, hipY + 0.085, 0, 0.045);
  const hipsMesh = rbox(0.105, 0.07, 0.085, pants, 0, hipY - 0.01, 0, 0.03);

  const shoulderY = hipY + 0.155;
  const armLen = 0.115;
  const lArm = limb(armLen, 0.019, top, SKIN);
  lArm.position.set(-0.078, shoulderY, 0);
  const rArm = limb(armLen, 0.019, top, SKIN);
  rArm.position.set(0.078, shoulderY, 0);

  // head + messy bun
  const head = new THREE.Group();
  const headBaseY = hipY + 0.245;
  head.position.y = headBaseY;
  head.add(sphere(0.068, SKIN, 0, 0, 0));
  const hairCap = sphere(0.072, hair, 0, 0.012, -0.012);
  hairCap.scale.set(1, 0.92, 1);
  head.add(hairCap);
  head.add(sphere(0.034, hair, 0, 0.075, -0.03, 12)); // bun
  head.add(sphere(0.012, theme.accent, 0.03, 0.075, -0.028, 8)); // scrunchie

  const handAnchor = new THREE.Group();
  handAnchor.position.set(0, hipY + 0.1, 0.085);

  group.add(lLeg, rLeg, hipsMesh, body, lArm, rArm, head, handAnchor);
  group.scale.setScalar(1.35);
  return { group, head, headBaseY, lArm, rArm, lLeg, rLeg, lCalf, rCalf, body, handAnchor };
}

// ── Dog ──────────────────────────────────────────────────────────────────────
export function buildDog(): CharacterRig {
  const group = new THREE.Group();
  const fur = "#E3B778";
  const furDark = shade(fur, -0.18);

  const body = rbox(0.1, 0.09, 0.19, fur, 0, 0.075, -0.02, 0.04);

  const head = new THREE.Group();
  const headBaseY = 0.13;
  head.position.set(0, headBaseY, 0.09);
  head.add(sphere(0.056, fur, 0, 0, 0));
  head.add(rbox(0.045, 0.038, 0.05, shade(fur, 0.12), 0, -0.014, 0.045, 0.015)); // snout
  head.add(sphere(0.012, "#3A2E28", 0, -0.005, 0.072, 8));                        // nose
  const earL = rbox(0.02, 0.055, 0.03, furDark, -0.045, 0.02, 0.005, 0.008);
  earL.rotation.z = 0.5;
  const earR = rbox(0.02, 0.055, 0.03, furDark, 0.045, 0.02, 0.005, 0.008);
  earR.rotation.z = -0.5;
  head.add(earL, earR);

  const lLeg = limb(0.045, 0.016, fur);
  lLeg.position.set(-0.035, 0.05, 0.05);
  const rLeg = limb(0.045, 0.016, fur);
  rLeg.position.set(0.035, 0.05, 0.05);
  const lArm = limb(0.045, 0.016, fur); // back legs
  lArm.position.set(-0.035, 0.05, -0.09);
  const rArm = limb(0.045, 0.016, fur);
  rArm.position.set(0.035, 0.05, -0.09);

  const tail = new THREE.Group();
  tail.position.set(0, 0.11, -0.11);
  const tailMesh = cyl(0.012, 0.005, 0.09, furDark, 0, 0.035, -0.015, 8);
  tailMesh.rotation.x = 0.6;
  tail.add(tailMesh);

  group.add(body, head, lLeg, rLeg, lArm, rArm, tail);
  group.scale.setScalar(1.3);
  return { group, head, headBaseY, lArm, rArm, lLeg, rLeg, body, tail };
}

// ── Toddler ──────────────────────────────────────────────────────────────────
export function buildToddler(): CharacterRig {
  const group = new THREE.Group();
  const onesie = "#F4A88E";
  const hair = "#6E4A2E";

  const hipY = 0.075;
  const legLen = 0.045;
  const lLeg = limb(legLen, 0.016, SKIN);
  lLeg.position.set(-0.022, hipY, 0);
  const rLeg = limb(legLen, 0.016, SKIN);
  rLeg.position.set(0.022, hipY, 0);

  const body = rbox(0.095, 0.1, 0.075, onesie, 0, hipY + 0.045, 0, 0.03);

  const armLen = 0.055;
  const lArm = limb(armLen, 0.014, onesie, SKIN);
  lArm.position.set(-0.052, hipY + 0.08, 0);
  lArm.rotation.z = 0.5; // toddler arms always slightly out
  const rArm = limb(armLen, 0.014, onesie, SKIN);
  rArm.position.set(0.052, hipY + 0.08, 0);
  rArm.rotation.z = -0.5;

  const head = new THREE.Group();
  const headBaseY = hipY + 0.175;
  head.position.y = headBaseY;
  head.add(sphere(0.062, SKIN, 0, 0, 0));
  const hairCap = sphere(0.064, hair, 0, 0.015, -0.01);
  hairCap.scale.set(1, 0.7, 1);
  head.add(hairCap);
  head.add(cyl(0.004, 0.004, 0.03, hair, 0, 0.07, 0, 6)); // sprout

  group.add(lLeg, rLeg, body, lArm, rArm, head);
  group.scale.setScalar(1.3);
  return { group, head, headBaseY, lArm, rArm, lLeg, rLeg, body };
}

// ── Husband ──────────────────────────────────────────────────────────────────
export function buildHusband(): CharacterRig {
  const group = new THREE.Group();
  const shirt = "#7C94A8";
  const pantsCol = "#4A4E5E";
  const hair = "#3A2E24";

  const hipY = 0.21;
  const legLen = 0.105;
  const lLeg = limb(legLen, 0.026, pantsCol, "#5E5A54");
  lLeg.position.set(-0.038, hipY, 0);
  const rLeg = limb(legLen, 0.026, pantsCol, "#5E5A54");
  rLeg.position.set(0.038, hipY, 0);

  const body = rbox(0.155, 0.2, 0.105, shirt, 0, hipY + 0.09, 0, 0.04);
  // the dad belly
  const belly = sphere(0.062, shirt, 0, hipY + 0.05, 0.028, 14);
  belly.scale.set(1.1, 0.9, 0.85);

  const shoulderY = hipY + 0.165;
  const armLen = 0.12;
  const lArm = limb(armLen, 0.021, shirt, SKIN);
  lArm.position.set(-0.088, shoulderY, 0);
  const rArm = limb(armLen, 0.021, shirt, SKIN);
  rArm.position.set(0.088, shoulderY, 0);

  const head = new THREE.Group();
  const headBaseY = hipY + 0.265;
  head.position.y = headBaseY;
  head.add(sphere(0.066, SKIN, 0, 0, 0));
  const hairCap = sphere(0.068, hair, 0, 0.02, -0.012);
  hairCap.scale.set(1, 0.55, 1);
  head.add(hairCap);
  head.add(rbox(0.05, 0.02, 0.03, hair, 0, -0.02, 0.052, 0.008)); // scruff

  group.add(lLeg, rLeg, body, belly, lArm, rArm, head);
  group.scale.setScalar(1.35);
  return { group, head, headBaseY, lArm, rArm, lLeg, rLeg, body };
}

// ── Cat ──────────────────────────────────────────────────────────────────────
export function buildCat(): CharacterRig {
  const group = new THREE.Group();
  const fur = "#8E8A96";
  const furDark = shade(fur, -0.2);

  // seated loaf
  const body = rbox(0.07, 0.08, 0.11, fur, 0, 0.055, -0.01, 0.03);
  const chest = sphere(0.042, fur, 0, 0.05, 0.04, 12);

  const head = new THREE.Group();
  const headBaseY = 0.115;
  head.position.set(0, headBaseY, 0.045);
  head.add(sphere(0.042, fur, 0, 0, 0));
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.03, 6), mat(furDark));
  earL.position.set(-0.024, 0.038, 0);
  const earR = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.03, 6), mat(furDark));
  earR.position.set(0.024, 0.038, 0);
  earL.castShadow = earR.castShadow = true;
  head.add(earL, earR);

  const tail = new THREE.Group();
  tail.position.set(0.02, 0.03, -0.06);
  const tailCurve = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.011, 8, 14, Math.PI * 1.2),
    mat(furDark),
  );
  tailCurve.rotation.set(0, Math.PI / 3, Math.PI / 6);
  tailCurve.castShadow = true;
  tail.add(tailCurve);

  const lLeg = limb(0.03, 0.011, fur);
  lLeg.position.set(-0.025, 0.03, 0.04);
  const rLeg = limb(0.03, 0.011, fur);
  rLeg.position.set(0.025, 0.03, 0.04);
  const lArm = new THREE.Group(); // unused pivots so the rig interface holds
  const rArm = new THREE.Group();

  group.add(body, chest, head, tail, lLeg, rLeg, lArm, rArm);
  group.scale.setScalar(1.25);
  return { group, head, headBaseY, lArm, rArm, lLeg, rLeg, body, tail };
}

export function buildCharacter(type: "dog" | "toddler" | "husband" | "cat"): CharacterRig {
  switch (type) {
    case "dog": return buildDog();
    case "toddler": return buildToddler();
    case "husband": return buildHusband();
    case "cat": return buildCat();
  }
}
