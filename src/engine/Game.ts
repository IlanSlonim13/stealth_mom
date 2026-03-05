import * as THREE from "three";
import type { DecoyItemDef, FurnitureDef, LevelData, NpcDef } from "../world/LevelTypes";
import { MOM_OUTFITS, PALETTES } from "../world/LevelTypes";
import {
  TILE_H, TILE_SIZE, SNEAK_SPEED, PICKUP_RANGE,
  TODDLER_CONE_RANGE, TODDLER_CONE_ANGLE, TODDLER_SPEED,
  HUSBAND_CONE_RANGE, HUSBAND_CONE_ANGLE, HUSBAND_SPEED,
  CAUGHT_DELAY_MS, WIN_DELAY_MS, LURE_INVESTIGATE_SECS, LURE_SPEED_MULTIPLIER,
  INTRO_HOLD_SECS, INTRO_ZOOM_SECS,
} from "../utils/constants";
import { easeOutQuad, lerp } from "../utils/easing";
import { dist2d, pointInCone } from "../utils/coordinates";
import { findPath } from "../pathfinding/Pathfinder";
import { pickRandom } from "../utils/humor";
import { AudioManager } from "./AudioManager";

// ── Bubble text arrays ────────────────────────────────────────────────────

const DAD_THOUGHTS = [
  "I want that huge grill so bad",
  "Is it too early to mow?",
  "These steaks won't grill themselves",
  "Did someone touch the thermostat?",
  "I should organize the garage",
  "That lawn won't mow itself",
  "Where's the remote?",
  "Time to check the tire pressure",
];

const BABY_TALK = ["mama!", "baba!", "gaga!", "dada!", "nana!", "wawa!", "brrr!", "uh oh!"];

// ── Types ──────────────────────────────────────────────────────────────────

interface Vec2 { x: number; z: number; }

interface TrapState {
  mesh: THREE.Mesh;
  star: THREE.Mesh;
  x: number;
  z: number;
  triggered: boolean;
}

interface NpcState {
  type: "dog" | "toddler" | "husband";
  group: THREE.Group;
  pos: Vec2;
  startPos: Vec2;
  facing: number;
  // dog
  circ?: THREE.Mesh;
  pulse?: THREE.Mesh;
  zGroup?: THREE.Group;
  radius?: number;
  // toddler / husband
  coneMesh?: THREE.Mesh;
  coneRange?: number;
  coneAngle?: number;
  speed?: number;
  patrol?: [number, number][];
  patrolIdx: number;
  patrolDir: number;
  patrolTimer: number;
  thoughtBubble?: THREE.Group;
  lastBubbleChange: number;
  bubbleTextIdx: number;
  // decoy lure
  lured: boolean;
  lureTarget: Vec2 | null;
  lureTimer: number;
  // summoned chaser (Level 4)
  chasing?: boolean;
}

export interface GameCallbacks {
  onCaught: (line: string) => void;
  onWon: (text: string) => void;
  onNearPickup: (itemName: string | null) => void;
}

// ── Game ───────────────────────────────────────────────────────────────────

export class Game {
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;

  private cx = 0;
  private cz = 0;
  private frust = 7;

  private tileMeshes: THREE.Mesh[] = [];
  private blocked = new Set<string>();
  private allWallSet = new Set<string>();

  private mom!: THREE.Group;
  private momPos: Vec2 = { x: 0, z: 0 };
  private momPath: Vec2[] | null = null;
  private momPathIdx = 0;
  private momHead: THREE.Object3D | null = null;
  private momLower: THREE.Object3D | null = null;

  private goalRing!: THREE.Mesh;
  private traps: TrapState[] = [];
  private npcs: NpcState[] = [];
  private hidingMeshes: THREE.Object3D[] = [];
  private furnitureGroups: THREE.Group[] = [];
  private glowMeshes: THREE.Mesh[] = [];

  private caught = false;
  private won = false;
  private introPhase = true;
  private introElapsed = 0;
  private introFrustStart = 1;
  private introFrustEnd = 7;
  private introCompleteCallback: (() => void) | null = null;
  private relaxZoomPhase = false;
  private relaxZoomElapsed = 0;
  private relaxZoomCallback: (() => void) | null = null;
  private camBasePos = new THREE.Vector3(15, 15, 15);
  private camTarget = new THREE.Vector3(0, 0, 0);
  private summoned = false;
  private decoyMesh: THREE.Group | null = null;
  private pickedUpItems = new Set<string>();
  private currentDecoyItem: DecoyItemDef | null = null;
  private frame = 0;
  private animId = 0;
  private clock = new THREE.Clock();
  private pinchStartDist = 0;
  private pinchStartFrust = 0;
  private frustMin = 1;
  private frustMax = 20;
  private panOffset = new THREE.Vector3(0, 0, 0);
  private panStartMidX = 0;
  private panStartMidY = 0;
  private panStartOffset = new THREE.Vector3(0, 0, 0);
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTapCoords: { x: number; y: number } | null = null;
  private wasMultiTouch = false;
  private onDeferredTap: ((x: number, y: number) => void) | null = null;

  // Animated outdoor objects
  private outdoorCars: { group: THREE.Group; minX: number; maxX: number; speed: number; dir: number }[] = [];
  private outdoorPeople: { group: THREE.Group; minX: number; maxX: number; speed: number; dir: number; leftLeg: THREE.Object3D; rightLeg: THREE.Object3D }[] = [];

  private level: LevelData;
  private callbacks: GameCallbacks;
  private element: HTMLElement;

  constructor(element: HTMLElement, level: LevelData, callbacks: GameCallbacks) {
    this.element = element;
    this.level = level;
    this.callbacks = callbacks;
    this.init();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private init() {
    const el = this.element;
    el.innerHTML = "";
    const lvl = this.level;
    const palette = PALETTES[lvl.scene];
    const W = lvl.grid.w;
    const H = lvl.grid.h;

    // Build wall sets
    lvl.walls.forEach(([x, z]) => {
      this.blocked.add(`${x},${z}`);
      this.allWallSet.add(`${x},${z}`);
    });
    (lvl.interiorWalls ?? []).forEach(([x, z]) => {
      this.blocked.add(`${x},${z}`);
      this.allWallSet.add(`${x},${z}`);
    });
    lvl.furniture.forEach((f) => {
      for (let dx = 0; dx < f.w; dx++)
        for (let dz = 0; dz < f.h; dz++)
          this.blocked.add(`${f.x + dx},${f.z + dz}`);
    });

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(palette.bg);

    // Camera — start zoomed in for intro, animate out later
    const aspect = el.clientWidth / el.clientHeight;
    this.introFrustEnd = Math.max(W, H) * TILE_SIZE * 0.65 / Math.min(aspect, 1);
    this.introFrustStart = this.introFrustEnd * 0.15;
    this.frust = this.introFrustStart;
    const f = this.frust;
    this.camera = new THREE.OrthographicCamera(
      -f * aspect, f * aspect, f, -f, 0.1, 100
    );
    this.camera.position.set(15, 15, 15);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.cx = W / 2;
    this.cz = H / 2;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.AmbientLight(palette.ambient, 0.55));
    const dLight = new THREE.DirectionalLight("#FFF", 0.8);
    dLight.position.set(10, 18, 10);
    dLight.castShadow = true;
    dLight.shadow.camera.left = -20; dLight.shadow.camera.right = 20;
    dLight.shadow.camera.top = 20;  dLight.shadow.camera.bottom = -20;
    dLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(dLight);

    this.buildOutdoor(lvl, palette, W, H);
    this.buildFloor(lvl, palette, W, H);
    this.buildWallDetails(lvl, palette, W, H);
    this.buildFurniture(lvl, palette);
    this.buildTraps(lvl);
    this.buildGoal(lvl, palette);
    this.buildMom(lvl);
    this.buildNpcs(lvl);
    this.buildHidingSpots(lvl);

    // Start camera centered on Mom for intro zoom
    const momWorldX = (lvl.playerStart.x - this.cx) * TILE_SIZE;
    const momWorldZ = (lvl.playerStart.z - this.cz) * TILE_SIZE;
    this.camTarget.set(momWorldX, 0, momWorldZ);
    this.camera.position.set(15 + momWorldX, 15, 15 + momWorldZ);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();

    AudioManager.preload([
      "footstep-soft", "squeak", "caught-mommy", "caught-dog",
      "caught-husband", "success", "decoy-throw", "ambient-hum",
    ]);
    AudioManager.startAmbient();

    // Zoom limits: allow zooming in to ~40% of default and out to ~160%
    this.frustMin = this.introFrustEnd * 0.4;
    this.frustMax = this.introFrustEnd * 1.6;

    window.addEventListener("resize", this.onResize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    this.animate();
  }

  // ── Scene builders ────────────────────────────────────────────────────────

  private buildOutdoor(
    lvl: LevelData,
    palette: typeof PALETTES[keyof typeof PALETTES],
    W: number,
    H: number,
  ) {
    const TS = TILE_SIZE;
    // Grass plane
    const grassGeo = new THREE.PlaneGeometry((W + 10) * TS, (H + 10) * TS);
    const grassMat = new THREE.MeshStandardMaterial({ color: palette.grass, roughness: 0.95 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.01, 0);
    grass.receiveShadow = true;
    this.scene.add(grass);

    // White picket fence
    const fenceMat = new THREE.MeshStandardMaterial({ color: palette.fence, roughness: 0.7 });
    const pad = 2.5 * TS;
    const fenceMinX = -this.cx * TS - pad;
    const fenceMaxX = (W - this.cx) * TS + pad;
    const fenceMinZ = -this.cz * TS - pad;
    const fenceMaxZ = (H - this.cz) * TS + pad;

    const addPost = (px: number, pz: number) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
      post.position.set(px, 0.2, pz);
      this.scene.add(post);
    };
    const addRail = (px: number, pz: number, rw: number, rh: number) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.05, rh), fenceMat);
      rail.position.set(px, 0.25, pz);
      this.scene.add(rail);
    };

    // North & South fences
    for (let x = fenceMinX; x <= fenceMaxX; x += 0.8) {
      addPost(x, fenceMinZ);
      addPost(x, fenceMaxZ);
    }
    addRail(0, fenceMinZ, fenceMaxX - fenceMinX, 0.06);
    addRail(0, fenceMaxZ, fenceMaxX - fenceMinX, 0.06);

    // East & West fences
    for (let z = fenceMinZ; z <= fenceMaxZ; z += 0.8) {
      addPost(fenceMinX, z);
      addPost(fenceMaxX, z);
    }
    addRail(fenceMinX, 0, 0.06, fenceMaxZ - fenceMinZ);
    addRail(fenceMaxX, 0, 0.06, fenceMaxZ - fenceMinZ);

    // Bushes along fence
    const bushColors = ["#3A7A2A", "#4A8A30", "#2A6A1A", "#5A9A38", "#3E8A28", "#4E8430"];
    const bushPositions: [number, number, number][] = [
      [fenceMinX + 1, 0, fenceMinZ + 1],
      [fenceMaxX - 1, 0, fenceMinZ + 1],
      [fenceMinX + 1, 0, fenceMaxZ - 1],
      [fenceMaxX - 1, 0, fenceMaxZ - 1],
      [0, 0, fenceMinZ + 0.5],
      [(fenceMaxX + fenceMinX) / 2, 0, fenceMaxZ - 0.5],
    ];
    bushPositions.forEach(([bx, , bz], i) => {
      const r = 0.18 + (i % 3) * 0.06;
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(r, 7, 7),
        new THREE.MeshStandardMaterial({ color: bushColors[i % bushColors.length], roughness: 0.9 }),
      );
      bush.position.set(bx, r, bz);
      bush.castShadow = true;
      this.scene.add(bush);
      const b2 = bush.clone();
      b2.position.set(bx + r * 0.9, r * 0.8, bz + r * 0.7);
      this.scene.add(b2);
    });

    // ── Suburban environment ──

    const stdMat = (col: string, rough = 0.7) =>
      new THREE.MeshStandardMaterial({ color: col, roughness: rough });

    // Driveway (concrete strip from house south side to beyond fence)
    const dwX = fenceMaxX - 1.5;
    const dwZ1 = 0;
    const dwZ2 = fenceMaxZ + 3;
    const driveway = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.02, dwZ2 - dwZ1),
      stdMat("#B0A898", 0.9),
    );
    driveway.position.set(dwX, 0.005, (dwZ1 + dwZ2) / 2);
    driveway.receiveShadow = true;
    this.scene.add(driveway);

    // Road (asphalt strip past the fence on the south/+z side)
    const roadZ = fenceMaxZ + 4.5;
    const roadW = (fenceMaxX - fenceMinX) + 12;
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(roadW, 0.02, 3.0),
      stdMat("#3A3A3A", 0.95),
    );
    road.position.set(0, 0.003, roadZ);
    road.receiveShadow = true;
    this.scene.add(road);

    // Yellow center line
    const lineLen = roadW * 0.9;
    for (let i = 0; i < 8; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(lineLen / 12, 0.015, 0.06),
        stdMat("#E8C840"),
      );
      dash.position.set(-lineLen / 2 + (i + 0.5) * lineLen / 8, 0.025, roadZ);
      this.scene.add(dash);
    }

    // Sidewalks (on both sides of road)
    for (const sideOff of [-2.0, 2.0]) {
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(roadW + 2, 0.02, 0.8),
        stdMat("#C8C0B4", 0.85),
      );
      sidewalk.position.set(0, 0.006, roadZ + sideOff);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    }

    // Flower beds along house perimeter (south side)
    const flowerColors = ["#FF6B8A", "#FFD700", "#FF4500", "#DA70D6", "#FF69B4", "#FFA500"];
    for (let i = 0; i < 10; i++) {
      const fx = fenceMinX + 1.5 + i * ((fenceMaxX - fenceMinX - 3) / 10);
      const fz = fenceMaxZ - 0.7;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        stdMat(flowerColors[i % flowerColors.length]),
      );
      flower.position.set(fx, 0.08, fz);
      flower.castShadow = true;
      this.scene.add(flower);
      // Stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4),
        stdMat("#2A7A1A"),
      );
      stem.position.set(fx, 0.04, fz);
      this.scene.add(stem);
    }

    // Trees in the yard
    const treePositions: [number, number][] = [
      [fenceMinX + 1.5, fenceMinZ + 2],
      [fenceMaxX - 1.5, fenceMinZ + 2],
      [fenceMinX + 2, fenceMaxZ - 2],
    ];
    treePositions.forEach(([tx, tz]) => {
      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6),
        stdMat("#6B4226", 0.85),
      );
      trunk.position.set(tx, 0.5, tz);
      trunk.castShadow = true;
      this.scene.add(trunk);
      // Canopy (layered spheres)
      const canopyColors = ["#2A7A1A", "#3A8A28", "#2E6E1E"];
      for (let c = 0; c < 3; c++) {
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.4 - c * 0.08, 8, 8),
          stdMat(canopyColors[c], 0.9),
        );
        canopy.position.set(
          tx + (c - 1) * 0.15,
          1.0 + c * 0.15,
          tz + (c % 2) * 0.1,
        );
        canopy.castShadow = true;
        this.scene.add(canopy);
      }
    });

    // Mailbox near the fence/road
    const mbX = fenceMaxX + 0.5;
    const mbZ = fenceMaxZ + 2.2;
    // Post
    const mailPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5),
      stdMat("#5A3A20"),
    );
    mailPost.position.set(mbX, 0.3, mbZ);
    this.scene.add(mailPost);
    // Box
    const mailBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.15),
      stdMat("#2244AA"),
    );
    mailBox.position.set(mbX, 0.65, mbZ);
    mailBox.castShadow = true;
    this.scene.add(mailBox);
    // Flag
    const mailFlag = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.08, 0.06),
      stdMat("#CC2222"),
    );
    mailFlag.position.set(mbX + 0.12, 0.68, mbZ);
    this.scene.add(mailFlag);

    // ── People walking on sidewalk (animated) ──
    const walkMinX = fenceMinX - 4;
    const walkMaxX = fenceMaxX + 4;
    const personDefs: [number, number, string, number][] = [
      [fenceMinX - 1, roadZ - 2.0, "#3A5A8A", 0.4],
      [fenceMinX + 3, roadZ + 2.0, "#8A3A5A", -0.35],
      [fenceMaxX + 1, roadZ - 2.0, "#5A8A3A", 0.3],
    ];
    personDefs.forEach(([px, pz, col, speed]) => {
      const personGroup = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.35, 6),
        stdMat(col),
      );
      body.position.y = 0.3;
      personGroup.add(body);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 7, 7),
        stdMat("#E8C8A8"),
      );
      head.position.y = 0.55;
      personGroup.add(head);
      // Legs (stored for walk animation)
      const legs: THREE.Object3D[] = [];
      for (const lx of [-0.04, 0.04]) {
        const legMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.2, 5),
          stdMat("#2A2A3A"),
        );
        legMesh.position.set(lx, 0.1, 0);
        personGroup.add(legMesh);
        legs.push(legMesh);
      }
      personGroup.position.set(px, 0, pz);
      // Face walking direction
      if (speed < 0) personGroup.rotation.y = Math.PI;
      personGroup.castShadow = true;
      this.scene.add(personGroup);
      this.outdoorPeople.push({
        group: personGroup, minX: walkMinX, maxX: walkMaxX,
        speed, dir: speed > 0 ? 1 : -1,
        leftLeg: legs[0], rightLeg: legs[1],
      });
    });

    // ── Cars (some parked, some driving) ──
    const driveMinX = fenceMinX - 8;
    const driveMaxX = fenceMaxX + 8;
    // [startX, startZ, bodyCol, windowCol, speed (0=parked)]
    const carDefs: [number, number, string, string, number][] = [
      // Parked car on driveway
      [dwX, fenceMaxZ + 1, "#4A6A8A", "#C0D0E0", 0],
      // Driving car on road (going right)
      [fenceMinX - 2, roadZ - 0.3, "#8A2A2A", "#B8C8D8", 1.8],
      // Driving car on road (going left)
      [fenceMaxX + 3, roadZ + 0.3, "#2A5A2A", "#C0D0D0", -1.5],
    ];
    const buildCar = (cx: number, cz: number, bodyCol: string, windowCol: string): THREE.Group => {
      const carGroup = new THREE.Group();
      const carBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.25, 0.45),
        stdMat(bodyCol, 0.5),
      );
      carBody.position.y = 0.18;
      carGroup.add(carBody);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.2, 0.4),
        stdMat(bodyCol, 0.5),
      );
      cabin.position.set(-0.05, 0.37, 0);
      carGroup.add(cabin);
      const winMat = new THREE.MeshStandardMaterial({
        color: windowCol, roughness: 0.1, metalness: 0.2,
        transparent: true, opacity: 0.6,
      });
      for (const wz of [-0.21, 0.21]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.01), winMat);
        win.position.set(-0.05, 0.39, wz);
        carGroup.add(win);
      }
      const wheelMat = stdMat("#1A1A1A", 0.8);
      const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8);
      for (const [wx2, wz2] of [[-0.25, -0.22], [-0.25, 0.22], [0.25, -0.22], [0.25, 0.22]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx2, 0.08, wz2);
        carGroup.add(wheel);
      }
      const hlMat = new THREE.MeshStandardMaterial({
        color: "#FFFFCC", emissive: "#FFFFAA", emissiveIntensity: 0.3,
      });
      for (const hz of [-0.15, 0.15]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), hlMat);
        hl.position.set(0.41, 0.18, hz);
        carGroup.add(hl);
      }
      carGroup.position.set(cx, 0, cz);
      carGroup.castShadow = true;
      this.scene.add(carGroup);
      return carGroup;
    };
    carDefs.forEach(([cx, cz, bodyCol, windowCol, speed]) => {
      const carGroup = buildCar(cx, cz, bodyCol, windowCol);
      // Face driving direction
      if (speed < 0) carGroup.rotation.y = Math.PI;
      if (speed !== 0) {
        this.outdoorCars.push({
          group: carGroup, minX: driveMinX, maxX: driveMaxX,
          speed, dir: speed > 0 ? 1 : -1,
        });
      }
    });

    // ── Neighbor houses ──
    // House dimensions — close to player house size
    const houseW = W * TS * 0.7;
    const houseD = H * TS * 0.5;
    const wallH = 1.5;

    const winGlassMat = new THREE.MeshStandardMaterial({
      color: "#A8D8EA", roughness: 0.1,
      emissive: "#88B8D8", emissiveIntensity: 0.15,
    });
    const sideWinMat = new THREE.MeshStandardMaterial({
      color: "#A8D8EA", roughness: 0.1,
      emissive: "#88B8D8", emissiveIntensity: 0.1,
    });

    const buildNeighborHouse = (hx: number, hz: number, wallCol: string, roofCol: string, faceFront: boolean) => {
      const houseGroup = new THREE.Group();
      // House body
      const hBody = new THREE.Mesh(
        new THREE.BoxGeometry(houseW, wallH, houseD),
        stdMat(wallCol, 0.85),
      );
      hBody.position.y = wallH / 2;
      houseGroup.add(hBody);
      // Roof layers (stepped)
      for (let r = 0; r < 4; r++) {
        const roofLayer = new THREE.Mesh(
          new THREE.BoxGeometry(houseW + 0.3 - r * 0.35, 0.12, houseD + 0.4 - r * 0.5),
          stdMat(roofCol, 0.8),
        );
        roofLayer.position.y = wallH + 0.06 + r * 0.12;
        houseGroup.add(roofLayer);
      }
      // Front face (facing road = -z if same side, +z if behind)
      const frontZ = faceFront ? -houseD / 2 - 0.01 : houseD / 2 + 0.01;
      const frontSign = faceFront ? -1 : 1;
      // Door
      const hDoor = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.65, 0.03),
        stdMat("#5A3A20"),
      );
      hDoor.position.set(0, 0.35, frontZ);
      houseGroup.add(hDoor);
      // Front windows
      const winSpacing = houseW * 0.25;
      for (const wx2 of [-winSpacing, winSpacing]) {
        const wFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.35, 0.04),
          stdMat("#E8E0D0", 0.7),
        );
        wFrame.position.set(wx2, wallH * 0.55, frontZ);
        houseGroup.add(wFrame);
        const hWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.25, 0.02),
          winGlassMat,
        );
        hWin.position.set(wx2, wallH * 0.55, frontZ + frontSign * -0.01);
        houseGroup.add(hWin);
      }
      // Side windows
      for (const sx of [-houseW / 2 - 0.01, houseW / 2 + 0.01]) {
        for (let sy = 0; sy < 2; sy++) {
          const sWin = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.3, 0.35),
            sideWinMat,
          );
          sWin.position.set(sx, wallH * 0.55, -houseD * 0.15 + sy * houseD * 0.35);
          houseGroup.add(sWin);
        }
      }
      // Garage on some houses
      if (hx > 0) {
        const garage = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.55, 0.03),
          stdMat("#A0907A", 0.8),
        );
        garage.position.set(-winSpacing * 1.5, 0.3, frontZ);
        houseGroup.add(garage);
      }
      // Yard fence on the front side
      const yardFence = new THREE.Mesh(
        new THREE.BoxGeometry(houseW * 1.2, 0.3, 0.04),
        stdMat(palette.fence, 0.7),
      );
      yardFence.position.set(0, 0.15, frontZ + frontSign * -0.8);
      houseGroup.add(yardFence);

      houseGroup.position.set(hx, 0, hz);
      houseGroup.castShadow = true;
      this.scene.add(houseGroup);
    };

    // Same side of the road (left and right of player's house)
    // Player's fence runs from fenceMinX to fenceMaxX, road is at roadZ (south)
    // Houses sit between fenceMinZ and fenceMaxZ, offset to the side
    const playerCenterZ = (fenceMinZ + fenceMaxZ) / 2;
    const sideHouseDefs: [number, number, string, string][] = [
      [fenceMinX - houseW * 0.65, playerCenterZ, "#D4C4A8", "#8B4A2A"],
      [fenceMaxX + houseW * 0.65, playerCenterZ, "#E0D0B8", "#7A5A3A"],
    ];
    sideHouseDefs.forEach(([hx, hz, wc, rc]) => buildNeighborHouse(hx, hz, wc, rc, true));

    // Across the road (facing player's house)
    const acrossZ = roadZ + 3.5 + houseD / 2;
    const acrossHouseDefs: [number, number, string, string][] = [
      [fenceMinX - houseW * 0.3, acrossZ, "#C0B8A0", "#6A3A1A"],
      [fenceMaxX + houseW * 0.3, acrossZ, "#D8C8B0", "#7A4A2A"],
    ];
    acrossHouseDefs.forEach(([hx, hz, wc, rc]) => buildNeighborHouse(hx, hz, wc, rc, true));

    // Behind the player's house (back yards share a fence)
    const behindZ = fenceMinZ - 1.5 - houseD / 2;
    const behindHouseDefs: [number, number, string, string][] = [
      [fenceMinX - houseW * 0.3, behindZ, "#C8C0B0", "#6A4A2A"],
      [0, behindZ, "#D0C4B4", "#7A5A3A"],
      [fenceMaxX + houseW * 0.3, behindZ, "#DCD0C0", "#8A5A2A"],
    ];
    behindHouseDefs.forEach(([hx, hz, wc, rc]) => buildNeighborHouse(hx, hz, wc, rc, false));

    // Shared back fence between player and behind-houses
    const backFence = new THREE.Mesh(
      new THREE.BoxGeometry((fenceMaxX - fenceMinX) + houseW * 2, 0.35, 0.06),
      stdMat(palette.fence, 0.7),
    );
    backFence.position.set(0, 0.175, fenceMinZ - 0.8);
    this.scene.add(backFence);
    // Fence posts for shared back fence
    for (let x = fenceMinX - houseW; x <= fenceMaxX + houseW; x += 0.8) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
      post.position.set(x, 0.2, fenceMinZ - 0.8);
      this.scene.add(post);
    }
  }

  private buildFloor(
    lvl: LevelData,
    palette: typeof PALETTES[keyof typeof PALETTES],
    W: number,
    H: number,
  ) {
    const TS = TILE_SIZE;
    const geo = new THREE.BoxGeometry(0.96 * TS, TILE_H, 0.96 * TS);
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < H; z++) {
        const isWall = this.allWallSet.has(`${x},${z}`);
        const isRug = lvl.rug && x >= lvl.rug.x && x < lvl.rug.x + lvl.rug.w
          && z >= lvl.rug.z && z < lvl.rug.z + lvl.rug.h;
        // Wall tiles use checkerboard floor color — hidden by wall panels
        const col = isRug ? palette.rug
          : (x + z) % 2 === 0 ? palette.floor1 : palette.floor2;
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((x - this.cx) * TS, TILE_H / 2, (z - this.cz) * TS);
        mesh.receiveShadow = true;
        mesh.userData = { gx: x, gz: z, isWall, baseColor: col };
        this.scene.add(mesh);
        if (!isWall) this.tileMeshes.push(mesh);
      }
    }
  }

  private buildWallDetails(
    lvl: LevelData,
    palette: typeof PALETTES[keyof typeof PALETTES],
    W: number,
    H: number,
  ) {
    const TS = TILE_SIZE;
    const wallColor = palette.wall;
    const baseColor = palette.baseboard;
    const artColors = ["#D4A0A0", "#A0C4D4", "#D4D4A0", "#C4A0D4", "#A0D4B4"];
    let artCounter = 0;

    // Opaque wall material (for non-hiding walls)
    const wallMatOpaque = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85 });
    // Split-panel materials for walls that hide tiles behind them
    const wallMatBottom = new THREE.MeshStandardMaterial({
      color: wallColor, roughness: 0.85, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const wallMatTop = new THREE.MeshStandardMaterial({
      color: wallColor, roughness: 0.85, transparent: true, opacity: 0.3, depthWrite: false,
    });
    const baseMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.9 });

    // Split dimensions: wall total height = 1.5
    const bottomH = 0.5;
    const topH = 1.0;

    // Build set of interior wall positions for single-panel rendering
    const interiorWallSet = new Set<string>();
    (lvl.interiorWalls ?? []).forEach(([x, z]) => interiorWallSet.add(`${x},${z}`));

    // Interior wall materials — same look as perimeter but transparent
    const interiorWallMat = new THREE.MeshStandardMaterial({
      color: wallColor, roughness: 0.85, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const interiorBaseMat = new THREE.MeshStandardMaterial({
      color: baseColor, roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false,
    });

    // Track which interior wall tiles already got a centered panel so we don't double-render
    const interiorRendered = new Set<string>();

    for (const wallKey of this.allWallSet) {
      const [wx, wz] = wallKey.split(",").map(Number);
      const wx3 = (wx - this.cx) * TS;
      const wz3 = (wz - this.cz) * TS;

      // Interior walls: render a single centered panel (like perimeter walls but transparent)
      if (interiorWallSet.has(wallKey) && !interiorRendered.has(wallKey)) {
        interiorRendered.add(wallKey);

        // Determine wall orientation: check which axis has non-wall neighbors on both sides
        const openEW = !this.allWallSet.has(`${wx - 1},${wz}`) && !this.allWallSet.has(`${wx + 1},${wz}`);

        // If open east-west, wall separates E/W → panel faces east/west → rotY = PI/2
        // If open north-south, wall separates N/S → panel faces north/south → rotY = 0
        const rotY = openEW ? Math.PI / 2 : 0;

        // Wall panel — same height as perimeter walls
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.92 * TS, 1.5, 0.06),
          interiorWallMat,
        );
        panel.position.set(wx3, TILE_H + 0.75, wz3);
        panel.rotation.y = rotY;
        panel.renderOrder = 1;
        this.scene.add(panel);

        // Baseboard on both sides
        for (const side of [-1, 1]) {
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, 0.06, 0.07),
            interiorBaseMat,
          );
          const bOff = side * 0.035;
          if (openEW) {
            base.position.set(wx3 + bOff, TILE_H + 0.03, wz3);
          } else {
            base.position.set(wx3, TILE_H + 0.03, wz3 + bOff);
          }
          base.rotation.y = rotY;
          base.renderOrder = 1;
          this.scene.add(base);
        }

        // Crown molding
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(0.94 * TS, 0.04, 0.08),
          interiorBaseMat,
        );
        crown.position.set(wx3, TILE_H + 1.48, wz3);
        crown.rotation.y = rotY;
        crown.renderOrder = 1;
        this.scene.add(crown);

        continue;
      }

      // --- Perimeter walls: render face panels toward non-wall neighbors ---

      // Does this wall hide tiles from camera? Camera is at (+X, +Y, +Z).
      const hidesAnyTile = [
        [wx, wz - 1],
        [wx - 1, wz],
      ].some(([nx, nz]) =>
        nx >= 0 && nx < W && nz >= 0 && nz < H && !this.allWallSet.has(`${nx},${nz}`)
      );

      // [neighborX, neighborZ, worldOffX, worldOffZ, rotY]
      const faces: [number, number, number, number, number][] = [
        [wx,     wz - 1,  0,             -TS * 0.46,  0            ],  // north face
        [wx,     wz + 1,  0,             +TS * 0.46,  Math.PI      ],  // south face
        [wx - 1, wz,     -TS * 0.46,     0,           Math.PI / 2  ],  // west face
        [wx + 1, wz,     +TS * 0.46,     0,          -Math.PI / 2  ],  // east face
      ];

      for (const [nx, nz, ox, oz, rotY] of faces) {
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        if (this.allWallSet.has(`${nx},${nz}`)) continue;

        if (hidesAnyTile) {
          // Split into two segments: semi-opaque bottom + transparent top
          const panelBottom = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, bottomH, 0.06),
            wallMatBottom,
          );
          panelBottom.position.set(wx3 + ox, TILE_H + bottomH / 2, wz3 + oz);
          panelBottom.rotation.y = rotY;
          panelBottom.renderOrder = 1;
          this.scene.add(panelBottom);

          const panelTop = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, topH, 0.06),
            wallMatTop,
          );
          panelTop.position.set(wx3 + ox, TILE_H + bottomH + topH / 2, wz3 + oz);
          panelTop.rotation.y = rotY;
          panelTop.renderOrder = 1;
          this.scene.add(panelTop);
        } else {
          // Fully opaque wall panel with decorations
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, 1.5, 0.06),
            wallMatOpaque,
          );
          panel.position.set(wx3 + ox, TILE_H + 0.75, wz3 + oz);
          panel.rotation.y = rotY;
          this.scene.add(panel);

          // Baseboard
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, 0.06, 0.07),
            baseMat,
          );
          base.position.set(wx3 + ox, TILE_H + 0.03, wz3 + oz);
          base.rotation.y = rotY;
          this.scene.add(base);

          // Crown molding
          const crown = new THREE.Mesh(
            new THREE.BoxGeometry(0.94 * TS, 0.04, 0.08),
            baseMat,
          );
          crown.position.set(wx3 + ox, TILE_H + 1.48, wz3 + oz);
          crown.rotation.y = rotY;
          this.scene.add(crown);

          // Wall art every 4 opaque panels
          artCounter++;
          if (artCounter % 4 === 0) {
            const frameMat = new THREE.MeshStandardMaterial({ color: "#4A2820", roughness: 0.7 });
            const canvasMat = new THREE.MeshStandardMaterial({
              color: artColors[(artCounter / 4 | 0) % artColors.length],
              roughness: 0.5,
            });
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22 * TS, 0.18, 0.03), frameMat);
            frame.position.set(wx3 + ox * 0.85, TILE_H + 0.75, wz3 + oz * 0.85);
            frame.rotation.y = rotY;
            this.scene.add(frame);
            const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.17 * TS, 0.13, 0.02), canvasMat);
            canvas.position.set(wx3 + ox * 0.83, TILE_H + 0.75, wz3 + oz * 0.83);
            canvas.rotation.y = rotY;
            this.scene.add(canvas);
          }
        }
      }
    }
  }

  private buildFurniture(
    lvl: LevelData,
    palette: typeof PALETTES[keyof typeof PALETTES],
  ) {
    for (const f of lvl.furniture) {
      const g = new THREE.Group();
      const centerX = (f.x + f.w / 2 - 0.5 - this.cx) * TILE_SIZE;
      const centerZ = (f.z + f.h / 2 - 0.5 - this.cz) * TILE_SIZE;
      g.position.set(centerX, TILE_H, centerZ);
      g.userData = { label: f.label, hasDecoy: !!f.hasDecoy };

      this.buildFurnitureShape(g, f, palette);

      if (f.hasDecoy) {
        const glowGeo = new THREE.SphereGeometry(0.07, 8, 8);
        const glowMat = new THREE.MeshStandardMaterial({
          color: "#FFD700", emissive: "#FFD700", emissiveIntensity: 1.0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.y = 0.75;
        g.add(glow);
        this.glowMeshes.push(glow);
      }

      g.castShadow = true;
      this.scene.add(g);
      this.furnitureGroups.push(g);
    }
  }


  private buildFurnitureShape(
    g: THREE.Group,
    f: FurnitureDef,
    _palette: typeof PALETTES[keyof typeof PALETTES],
  ) {
    const std = (col: string, rough = 0.6, met = 0.05) =>
      new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: met });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y; m.rotation.x = rx; m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };
    const leg = (lx: number, lz: number, h: number, col: string) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, h, 5), std(col, 0.7));
      m.position.set(lx, h / 2, lz); m.castShadow = true; g.add(m);
    };

    const TS = TILE_SIZE;
    const tw = f.w * 0.88 * TS;
    const th = f.h * 0.88 * TS;

    switch (f.shape) {
      case "table": {
        const col = f.col;
        add(new THREE.BoxGeometry(tw + 0.08, 0.06, th + 0.08), std(col, 0.6), 0.42);
        leg(-tw / 2 + 0.06, -th / 2 + 0.06, 0.4, col);
        leg( tw / 2 - 0.06, -th / 2 + 0.06, 0.4, col);
        leg(-tw / 2 + 0.06,  th / 2 - 0.06, 0.4, col);
        leg( tw / 2 - 0.06,  th / 2 - 0.06, 0.4, col);
        break;
      }
      case "shelf": {
        const wood = std(f.col, 0.7);
        add(new THREE.BoxGeometry(tw, 0.55, 0.1), std("#6A4020", 0.8), 0.3, 0, 0); // back
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(tw, 0.04, 0.22), wood, 0.08 + i * 0.2);
        }
        // Side panels
        add(new THREE.BoxGeometry(0.05, 0.55, 0.22), wood, 0.3, 0, 0).position.x = -tw / 2 + 0.025;
        add(new THREE.BoxGeometry(0.05, 0.55, 0.22), wood, 0.3, 0, 0).position.x =  tw / 2 - 0.025;
        // Books
        const bookCols = ["#AA3333", "#3366AA", "#228833", "#AA7722"];
        for (let i = 0; i < 4; i++) {
          const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09),
            std(bookCols[i % bookCols.length], 0.8));
          bk.position.set(-tw / 2 + 0.1 + i * 0.12, 0.38, 0.02);
          g.add(bk);
        }
        break;
      }
      case "fridge": {
        const fh = f.h * 0.88 * TS;
        add(new THREE.BoxGeometry(tw, fh, th), std("#CECECE", 0.3, 0.15), fh / 2);
        // Handle
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), std("#888", 0.3, 0.3));
        handle.rotation.x = Math.PI / 2;
        handle.position.set(tw / 2 - 0.04, fh * 0.6, 0.08);
        g.add(handle);
        // Seam
        const seam = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.01, 0.02, th + 0.01), std("#AAA", 0.5));
        seam.position.y = fh / 2;
        g.add(seam);
        break;
      }
      case "counter": {
        add(new THREE.BoxGeometry(tw, 0.35, th), std("#8A7A6A", 0.7), 0.18);
        add(new THREE.BoxGeometry(tw + 0.06, 0.05, th + 0.06), std("#D0C8B8", 0.4), 0.38); // countertop
        break;
      }
      case "lamp": {
        add(new THREE.CylinderGeometry(0.08, 0.1, 0.04, 8), std("#888", 0.5), 0.02); // base
        add(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), std("#666", 0.5), 0.25); // pole
        // Shade (inverted cone)
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, 0.2, 8, 1, true),
          new THREE.MeshStandardMaterial({ color: "#F0E0B0", roughness: 0.8, side: THREE.BackSide }));
        shade.position.y = 0.56;
        g.add(shade);
        // Bulb
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6),
          new THREE.MeshStandardMaterial({ color: "#FFFF99", emissive: "#FFFF99", emissiveIntensity: 1.5 }));
        bulb.position.y = 0.52;
        g.add(bulb);
        break;
      }
      case "plant": {
        // Pot
        add(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 8), std("#C07040", 0.9), 0.09);
        add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 8), std("#5A3A1A", 0.95), 0.19); // soil
        // Leaves
        const leafCols = ["#2A7A2A", "#3A8A2A", "#228822"];
        for (let i = 0; i < 4; i++) {
          const lm = new THREE.Mesh(new THREE.SphereGeometry(0.1 + i * 0.015, 6, 6),
            std(leafCols[i % leafCols.length], 0.9));
          lm.position.set(Math.sin(i * 1.5) * 0.06, 0.28 + i * 0.08, Math.cos(i * 1.5) * 0.06);
          g.add(lm);
        }
        break;
      }
      case "toybox": {
        add(new THREE.BoxGeometry(tw, 0.3, th), std(f.col, 0.7), 0.15); // box body
        // Tilted lid
        const lid = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.04, th), std("#D05030", 0.7));
        lid.position.set(0, 0.32, 0.12);
        lid.rotation.x = -0.5;
        g.add(lid);
        // Balls inside
        const ballCols = ["#FF4444", "#4488FF", "#44DD44"];
        for (let i = 0; i < 3; i++) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 7), std(ballCols[i], 0.5));
          ball.position.set((i - 1) * 0.13, 0.24, 0);
          g.add(ball);
        }
        break;
      }
      case "stool": {
        add(new THREE.CylinderGeometry(0.18, 0.16, 0.05, 8), std(f.col, 0.6), 0.33); // seat
        leg(-0.1, -0.1, 0.3, f.col); leg(0.1, -0.1, 0.3, f.col);
        leg(-0.1,  0.1, 0.3, f.col); leg(0.1,  0.1, 0.3, f.col);
        break;
      }
      case "shoeRack": {
        const wr = std(f.col, 0.8);
        add(new THREE.BoxGeometry(0.04, 0.4, th), wr, 0.2).position.x = -tw / 2 + 0.02;
        add(new THREE.BoxGeometry(0.04, 0.4, th), wr, 0.2).position.x =  tw / 2 - 0.02;
        add(new THREE.BoxGeometry(tw, 0.03, th), wr, 0.12);
        add(new THREE.BoxGeometry(tw, 0.03, th), wr, 0.28);
        // Shoe boxes
        const shoeCols = ["#1A1A1A", "#333366", "#553322"];
        for (let i = 0; i < 3; i++) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), std(shoeCols[i], 0.8));
          sh.position.set(-tw / 2 + 0.1 + i * 0.19, 0.18, 0);
          g.add(sh);
        }
        break;
      }
      case "couch": {
        const fab = std(f.col, 0.75);
        const fabDark = std(f.col + "AA", 0.8);
        add(new THREE.BoxGeometry(tw, 0.16, th), fab, 0.25); // seat
        add(new THREE.BoxGeometry(tw, 0.3, 0.14), fabDark, 0.44).position.z = th / 2 - 0.07; // back (south side, sitter faces north)
        // Arms
        add(new THREE.BoxGeometry(0.14, 0.22, th), fabDark, 0.36).position.x = -tw / 2 + 0.07;
        add(new THREE.BoxGeometry(0.14, 0.22, th), fabDark, 0.36).position.x =  tw / 2 - 0.07;
        // Cushion lines
        for (let i = 0; i < f.w; i++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, th * 0.8),
            std("#00000022", 0.9));
          line.position.set(-tw / 2 + (i + 0.5) * tw / f.w, 0.26, 0);
          g.add(line);
        }
        break;
      }
      case "tv": {
        add(new THREE.BoxGeometry(tw, 0.32, 0.08), std("#111", 0.3, 0.3), 0.3); // screen
        const screen = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.06, 0.24, 0.01),
          new THREE.MeshStandardMaterial({ color: "#0A0A2A", emissive: "#050510", emissiveIntensity: 0.5 }));
        screen.position.set(0, 0.3, -0.045);
        g.add(screen);
        // Stand
        add(new THREE.BoxGeometry(0.12, 0.12, 0.1), std("#222", 0.4), 0.06);
        break;
      }
      case "dresser": {
        add(new THREE.BoxGeometry(tw, 0.45, th), std(f.col, 0.7), 0.225);
        // Drawer lines
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(tw + 0.01, 0.01, th + 0.01), std("#5A3A10", 0.8), 0.09 + i * 0.145);
        }
        // Knobs
        for (let i = 0; i < 3; i++) {
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 5), std("#C0A040", 0.4, 0.3));
          knob.position.set(0, 0.09 + i * 0.145 + 0.06, -(th / 2) - 0.02);
          g.add(knob);
        }
        break;
      }
      case "bed": {
        add(new THREE.BoxGeometry(tw, 0.18, th), std("#F0EAE0", 0.7), 0.18); // mattress
        add(new THREE.BoxGeometry(tw, 0.3, 0.1), std(f.col, 0.7), 0.33).position.z = -th / 2 + 0.05; // headboard
        // Pillows
        const pw = std("#FFFFFF", 0.8);
        const pGeom = new THREE.BoxGeometry(0.22, 0.06, 0.18);
        [-0.15, 0.15].forEach((px) => {
          const p = new THREE.Mesh(pGeom, pw);
          p.position.set(px, 0.29, -th / 2 + 0.22);
          g.add(p);
        });
        break;
      }
      case "bathtub": {
        // Tub shell (open top)
        add(new THREE.BoxGeometry(tw, 0.26, th), std("#E8F0F0", 0.3, 0.1), 0.13);
        // Inner hollow (slightly smaller, same color but darker)
        const innerBox = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.1, 0.2, th - 0.1),
          new THREE.MeshStandardMaterial({ color: "#D0E8E8", roughness: 0.2 }));
        innerBox.position.set(0, 0.18, 0);
        g.add(innerBox);
        // Feet
        const footMat = std("#CCCCCC", 0.4, 0.2);
        [[-tw / 2 + 0.1, -th / 2 + 0.1], [tw / 2 - 0.1, -th / 2 + 0.1],
         [-tw / 2 + 0.1,  th / 2 - 0.1], [tw / 2 - 0.1,  th / 2 - 0.1]].forEach(([fx, fz]) => {
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 5), footMat);
          foot.position.set(fx, 0.04, fz);
          g.add(foot);
        });
        break;
      }
      case "bookcase": {
        const wood = std(f.col, 0.75);
        add(new THREE.BoxGeometry(tw, 0.65, 0.1), std("#5A3A10", 0.8), 0.33); // back
        add(new THREE.BoxGeometry(0.05, 0.65, 0.22), wood, 0.33).position.x = -tw / 2 + 0.025;
        add(new THREE.BoxGeometry(0.05, 0.65, 0.22), wood, 0.33).position.x =  tw / 2 - 0.025;
        for (let i = 0; i < 4; i++) {
          add(new THREE.BoxGeometry(tw, 0.04, 0.22), wood, 0.04 + i * 0.16);
        }
        // Books
        const bookCols2 = ["#BB2222","#2244BB","#228833","#AA7722","#882288","#226688"];
        for (let i = 0; i < 6; i++) {
          const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.1),
            std(bookCols2[i % bookCols2.length], 0.8));
          bk.position.set(-tw / 2 + 0.09 + i * 0.1, 0.3 + (i % 2) * 0.16, 0.02);
          g.add(bk);
        }
        break;
      }
      case "desk": {
        const col = f.col;
        add(new THREE.BoxGeometry(tw + 0.06, 0.05, th + 0.06), std(col, 0.6), 0.44); // top
        leg(-tw / 2 + 0.05, -th / 2 + 0.05, 0.42, col);
        leg( tw / 2 - 0.05, -th / 2 + 0.05, 0.42, col);
        leg(-tw / 2 + 0.05,  th / 2 - 0.05, 0.42, col);
        leg( tw / 2 - 0.05,  th / 2 - 0.05, 0.42, col);
        // Drawer box under right side
        add(new THREE.BoxGeometry(tw * 0.4, 0.18, th * 0.8), std(col, 0.7), 0.25).position.x = tw / 2 - 0.12;
        break;
      }
      case "tvUnit": {
        // Dresser body
        add(new THREE.BoxGeometry(tw, 0.35, th), std(f.col, 0.7), 0.18);
        // Top surface
        add(new THREE.BoxGeometry(tw + 0.04, 0.04, th + 0.04), std("#D0C8B8", 0.4), 0.37);
        // TV screen sitting on top, facing south (into room)
        const tvBody = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.8, 0.28, 0.06), std("#111", 0.3, 0.3));
        tvBody.position.set(0, 0.56, 0);
        tvBody.castShadow = true;
        g.add(tvBody);
        // Emissive screen face
        const scFace = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.7, 0.2, 0.01),
          new THREE.MeshStandardMaterial({ color: "#0A0A2A", emissive: "#050510", emissiveIntensity: 0.5 }),
        );
        scFace.position.set(0, 0.56, 0.035);
        g.add(scFace);
        // Drawer lines
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(tw + 0.01, 0.01, th + 0.01), std("#5A3A10", 0.8), 0.08 + i * 0.11);
        }
        break;
      }
      case "coffeeTable": {
        const col = f.col;
        add(new THREE.BoxGeometry(tw + 0.06, 0.04, th + 0.06), std(col, 0.6), 0.2);
        leg(-tw / 2 + 0.05, -th / 2 + 0.05, 0.18, col);
        leg( tw / 2 - 0.05, -th / 2 + 0.05, 0.18, col);
        leg(-tw / 2 + 0.05,  th / 2 - 0.05, 0.18, col);
        leg( tw / 2 - 0.05,  th / 2 - 0.05, 0.18, col);
        // Magazine on top
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.16), std("#DD6644", 0.8));
        mag.position.set(0.04, 0.23, -0.02); mag.rotation.y = 0.3;
        g.add(mag);
        break;
      }
      case "ottoman": {
        // Base
        add(new THREE.CylinderGeometry(0.2, 0.18, 0.12, 10), std(f.col, 0.75), 0.06);
        // Cushion top
        add(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 10), std(f.col, 0.7), 0.15);
        // Button
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), std("#333333", 0.5));
        btn.position.y = 0.19;
        g.add(btn);
        break;
      }
      case "laundryBasket": {
        // Basket body (wider at top)
        add(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 10, 1, true), std("#E8D8C0", 0.85), 0.18);
        // Rim
        add(new THREE.TorusGeometry(0.2, 0.02, 6, 12), std("#D0C0A0", 0.8), 0.35).rotation.x = Math.PI / 2;
        // Clothes peeking out
        const clotheCols = ["#FF6B8A", "#6BB5FF", "#FFD93D"];
        clotheCols.forEach((cc, i) => {
          const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), std(cc, 0.8));
          cloth.position.set(Math.sin(i * 2.1) * 0.1, 0.32 + i * 0.03, Math.cos(i * 2.1) * 0.1);
          g.add(cloth);
        });
        break;
      }
      case "toys": {
        // Scattered toys on floor
        // Block
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), std("#FF4444", 0.6));
        block.position.set(-0.12, 0.05, -0.08); block.rotation.y = 0.5;
        block.castShadow = true; g.add(block);
        // Ball
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 7), std("#4488FF", 0.5));
        ball.position.set(0.1, 0.06, 0.05);
        ball.castShadow = true; g.add(ball);
        // Crayon
        const crayon = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5), std("#44DD44", 0.6));
        crayon.rotation.z = Math.PI / 2; crayon.rotation.x = 0.3;
        crayon.position.set(0.0, 0.02, -0.12);
        g.add(crayon);
        // Yellow block
        const block2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), std("#FFD700", 0.6));
        block2.position.set(0.08, 0.04, -0.1); block2.rotation.y = -0.8;
        block2.castShadow = true; g.add(block2);
        break;
      }
      case "mirror": {
        // Frame
        add(new THREE.BoxGeometry(tw * 0.7, 0.5, 0.04), std("#4A2820", 0.7), 0.55);
        // Reflective surface
        const mirrorMesh = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.6, 0.4, 0.02),
          new THREE.MeshStandardMaterial({ color: "#C8D8E8", roughness: 0.1, metalness: 0.8 }),
        );
        mirrorMesh.position.set(0, 0.55, -0.02);
        g.add(mirrorMesh);
        break;
      }
      case "pictureFrame": {
        // Wall-mounted picture frame with colorful canvas
        add(new THREE.BoxGeometry(tw * 0.8, 0.45, 0.04), std("#5A3A20", 0.7), 0.55); // frame
        const canvas = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.65, 0.35, 0.02),
          new THREE.MeshStandardMaterial({ color: f.col, roughness: 0.6 }),
        );
        canvas.position.set(0, 0.55, -0.02);
        g.add(canvas);
        // Small highlight rectangle on the painting
        const highlight = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.25, 0.12, 0.005), std("#FFFFFF", 0.9));
        highlight.position.set(-tw * 0.1, 0.58, -0.035);
        g.add(highlight);
        break;
      }
      case "flowerVase": {
        // Tall narrow table with vase and flowers
        // Small pedestal table
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 6), std("#6A4A2A", 0.7), 0.18); // stem
        add(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 8), std("#6A4A2A", 0.6), 0.37); // tabletop
        // Vase
        add(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 8), std(f.col, 0.4, 0.1), 0.46);
        // Flowers - three colored spheres on stems
        const flowerCols = ["#FF6B8A", "#FFD700", "#FF4500"];
        for (let i = 0; i < 3; i++) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.15, 4), std("#2A8A2A", 0.8));
          stem.position.set(Math.sin(i * 2.1) * 0.03, 0.6, Math.cos(i * 2.1) * 0.03);
          g.add(stem);
          const flower = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), std(flowerCols[i], 0.6));
          flower.position.set(Math.sin(i * 2.1) * 0.04, 0.68 + i * 0.02, Math.cos(i * 2.1) * 0.04);
          g.add(flower);
        }
        break;
      }
      case "sink": {
        // Kitchen/bathroom sink with basin and faucet
        add(new THREE.BoxGeometry(tw, 0.35, th), std("#8A7A6A", 0.7), 0.18); // cabinet
        add(new THREE.BoxGeometry(tw + 0.04, 0.04, th + 0.04), std("#D0D0D0", 0.3, 0.15), 0.37); // countertop
        // Basin (recessed)
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 8),
          new THREE.MeshStandardMaterial({ color: "#E8E8E8", roughness: 0.2, metalness: 0.1 }));
        basin.position.set(0, 0.36, 0);
        g.add(basin);
        // Faucet
        const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 5),
          std("#C0C0C0", 0.2, 0.5));
        faucet.position.set(0, 0.46, -th / 2 + 0.08);
        g.add(faucet);
        // Faucet spout (horizontal)
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 5),
          std("#C0C0C0", 0.2, 0.5));
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, 0.52, -th / 2 + 0.14);
        g.add(spout);
        break;
      }
      case "oven": {
        // Kitchen stove/oven with burners
        add(new THREE.BoxGeometry(tw, 0.4, th), std("#333333", 0.5, 0.15), 0.2); // body
        add(new THREE.BoxGeometry(tw + 0.02, 0.03, th + 0.02), std("#444444", 0.4, 0.2), 0.42); // cooktop
        // Burners (4 rings)
        const burnerMat = std("#222222", 0.3, 0.3);
        [[-0.1, -0.08], [0.1, -0.08], [-0.1, 0.08], [0.1, 0.08]].forEach(([bx, bz]) => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12), burnerMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(bx, 0.44, bz);
          g.add(ring);
        });
        // Oven door handle
        const handle = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.6, 0.015, 0.015), std("#888", 0.3, 0.4));
        handle.position.set(0, 0.28, th / 2 + 0.01);
        g.add(handle);
        // Oven window
        const ovenWindow = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.5, 0.12, 0.01),
          new THREE.MeshStandardMaterial({ color: "#1A1A2A", roughness: 0.1, metalness: 0.2 }));
        ovenWindow.position.set(0, 0.15, th / 2 + 0.005);
        g.add(ovenWindow);
        break;
      }
      case "microwave": {
        // Small box on counter height
        add(new THREE.BoxGeometry(tw * 0.8, 0.2, th * 0.8), std("#888888", 0.4, 0.15), 0.48);
        // Door
        const door = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.5, 0.14, 0.01),
          new THREE.MeshStandardMaterial({ color: "#111122", roughness: 0.1 }));
        door.position.set(-tw * 0.05, 0.48, th * 0.4 + 0.005);
        g.add(door);
        // Handle
        const mh = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.015), std("#AAAAAA", 0.3, 0.4));
        mh.position.set(tw * 0.25, 0.48, th * 0.4 + 0.01);
        g.add(mh);
        // Pedestal (sits on counter)
        add(new THREE.BoxGeometry(tw * 0.85, 0.02, th * 0.85), std("#777", 0.5), 0.37);
        break;
      }
      case "nightstand": {
        // Small bedside table with drawer and lamp area
        add(new THREE.BoxGeometry(tw, 0.3, th), std(f.col, 0.7), 0.15); // body
        add(new THREE.BoxGeometry(tw + 0.02, 0.03, th + 0.02), std(f.col, 0.6), 0.32); // top
        // Drawer line
        add(new THREE.BoxGeometry(tw + 0.005, 0.008, th + 0.005), std("#4A3010", 0.8), 0.15);
        // Knob
        const nKnob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 5), std("#C0A040", 0.4, 0.3));
        nKnob.position.set(0, 0.15, -(th / 2) - 0.015);
        g.add(nKnob);
        break;
      }
      case "curtains": {
        // Wall-mounted curtain rod with drapes
        // Rod
        add(new THREE.CylinderGeometry(0.012, 0.012, tw * 1.1, 6), std("#8A7040", 0.4, 0.3), 0.7).rotation.z = Math.PI / 2;
        // Rod finials
        [-tw * 0.55, tw * 0.55].forEach((fx) => {
          const fin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 5), std("#8A7040", 0.4, 0.3));
          fin.position.set(fx, 0.7, 0);
          g.add(fin);
        });
        // Left drape
        const drapeMat = std(f.col, 0.85);
        const leftDrape = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.3, 0.55, 0.04), drapeMat);
        leftDrape.position.set(-tw * 0.32, 0.4, 0);
        g.add(leftDrape);
        // Right drape
        const rightDrape = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.3, 0.55, 0.04), drapeMat);
        rightDrape.position.set(tw * 0.32, 0.4, 0);
        g.add(rightDrape);
        break;
      }
      case "coatRack": {
        // Standing coat rack with hooks
        add(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 8), std("#5A3A20", 0.7), 0.015); // base
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6), std("#5A3A20", 0.7), 0.35); // pole
        // Top cap
        add(new THREE.SphereGeometry(0.03, 6, 6), std("#5A3A20", 0.7), 0.68);
        // Hooks
        for (let i = 0; i < 4; i++) {
          const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), std("#8A7040", 0.4, 0.3));
          hook.rotation.z = Math.PI / 3;
          hook.position.set(Math.sin(i * Math.PI / 2) * 0.06, 0.6, Math.cos(i * Math.PI / 2) * 0.06);
          g.add(hook);
        }
        // A jacket hanging
        const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.06), std("#2A3A5A", 0.8));
        jacket.position.set(0.06, 0.48, 0);
        g.add(jacket);
        break;
      }
      case "sideTableGlass": {
        // Side table with a glass of wine/water on top
        const col = f.col;
        add(new THREE.BoxGeometry(tw * 0.9, 0.04, th * 0.9), std(col, 0.6), 0.32); // tabletop
        leg(-tw / 2 + 0.06, -th / 2 + 0.06, 0.3, col);
        leg( tw / 2 - 0.06, -th / 2 + 0.06, 0.3, col);
        leg(-tw / 2 + 0.06,  th / 2 - 0.06, 0.3, col);
        leg( tw / 2 - 0.06,  th / 2 - 0.06, 0.3, col);
        // Glass
        const glass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.02, 0.08, 8, 1, true),
          new THREE.MeshStandardMaterial({ color: "#D0E8F0", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6 }),
        );
        glass.position.set(0.04, 0.38, -0.02);
        g.add(glass);
        // Liquid inside
        const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.05, 8), std("#8B1A2A", 0.5));
        liquid.position.set(0.04, 0.37, -0.02);
        g.add(liquid);
        // Coaster
        const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 8), std("#5A3A1A", 0.8));
        coaster.position.set(0.04, 0.34, -0.02);
        g.add(coaster);
        break;
      }
      case "kitchenIsland": {
        // Kitchen island: wider counter with overhead detail
        add(new THREE.BoxGeometry(tw, 0.38, th), std("#7A6A5A", 0.7), 0.19); // base
        add(new THREE.BoxGeometry(tw + 0.06, 0.05, th + 0.06), std("#E8DDD0", 0.35), 0.41); // countertop
        // Cutting board
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.12), std("#C8A870", 0.8));
        board.position.set(-0.05, 0.44, 0); board.rotation.y = 0.2;
        g.add(board);
        // Bowl
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
          std("#E0E0E0", 0.3, 0.1));
        bowl.rotation.x = Math.PI;
        bowl.position.set(0.1, 0.47, 0.02);
        g.add(bowl);
        break;
      }
      case "toiletries": {
        // Small shelf / tray with bathroom items
        add(new THREE.BoxGeometry(tw * 0.8, 0.03, th * 0.6), std("#E8E0D8", 0.6), 0.4); // tray
        // Bottle 1 (tall)
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), std("#3A8ABB", 0.4), 0.48).position.x = -0.06;
        // Bottle 2 (short round)
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6), std("#BB6A8A", 0.4), 0.45).position.x = 0.03;
        // Soap bar
        const soap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04), std("#F0E0C0", 0.7));
        soap.position.set(0.08, 0.42, 0.04);
        g.add(soap);
        break;
      }
      case "rugDecor": {
        // Small decorative floor rug (flat)
        const rugMesh = new THREE.Mesh(
          new THREE.BoxGeometry(tw, 0.015, th),
          new THREE.MeshStandardMaterial({ color: f.col, roughness: 0.9 }),
        );
        rugMesh.position.y = 0.008;
        rugMesh.receiveShadow = true;
        g.add(rugMesh);
        // Border stripe
        const border = new THREE.Mesh(
          new THREE.BoxGeometry(tw + 0.02, 0.012, th + 0.02),
          std("#8A7060", 0.9),
        );
        border.position.y = 0.005;
        border.receiveShadow = true;
        g.add(border);
        break;
      }
      case "clock": {
        // Back plate / circle face
        const face = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16),
          new THREE.MeshStandardMaterial({ color: "#FFFFF0", roughness: 0.4 }),
        );
        face.rotation.x = Math.PI / 2;
        face.position.set(0, 0.6, 0);
        g.add(face);
        // Frame ring
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.15, 0.015, 6, 24),
          std("#4A2820", 0.7),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 0.6, -0.02);
        g.add(ring);
        // Hour hand
        const hHand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.01), std("#333", 0.5));
        hHand.position.set(0, 0.63, -0.025);
        hHand.rotation.z = 0.8;
        g.add(hHand);
        // Minute hand
        const mHand = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.11, 0.01), std("#333", 0.5));
        mHand.position.set(0, 0.62, -0.03);
        mHand.rotation.z = -0.4;
        g.add(mHand);
        break;
      }
      case "window": {
        // Window frame with glass pane and horizontal blinds
        const frameMat = std("#E8E0D0", 0.7);
        // Outer frame
        add(new THREE.BoxGeometry(tw * 0.95, 0.6, 0.05), frameMat, 0.55);
        // Glass pane (slightly emissive sky blue)
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.8, 0.48, 0.02),
          new THREE.MeshStandardMaterial({
            color: "#A8D8EA", roughness: 0.1, metalness: 0.1,
            transparent: true, opacity: 0.5,
            emissive: "#88B8D8", emissiveIntensity: 0.15,
          }),
        );
        glass.position.set(0, 0.55, -0.015);
        g.add(glass);
        // Window sill
        add(new THREE.BoxGeometry(tw * 1.0, 0.03, 0.1), std("#D0C8B8", 0.6), 0.28);
        // Horizontal blinds (5 slats in front of glass)
        const blindMat = std("#F0EDE4", 0.8);
        for (let i = 0; i < 5; i++) {
          const slat = new THREE.Mesh(
            new THREE.BoxGeometry(tw * 0.76, 0.015, 0.025), blindMat,
          );
          slat.position.set(0, 0.35 + i * 0.1, 0.02);
          slat.rotation.x = 0.25; // tilted open
          g.add(slat);
        }
        // Top valance / header
        add(new THREE.BoxGeometry(tw * 0.95, 0.04, 0.06), frameMat, 0.82);
        break;
      }
      case "door": {
        // Door frame with partially open door
        const doorFrameMat = std("#E8E0D0", 0.7);
        // Frame: two vertical posts + top header
        const postGeo = new THREE.BoxGeometry(0.04, 0.85, 0.08);
        const leftPost = new THREE.Mesh(postGeo, doorFrameMat);
        leftPost.position.set(-tw * 0.42, 0.43, 0);
        g.add(leftPost);
        const rightPost = new THREE.Mesh(postGeo, doorFrameMat);
        rightPost.position.set(tw * 0.42, 0.43, 0);
        g.add(rightPost);
        // Header
        add(new THREE.BoxGeometry(tw * 0.9, 0.05, 0.08), doorFrameMat, 0.88);
        // Door panel (slightly ajar — rotated 25 degrees)
        const doorPanel = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.78, 0.8, 0.04),
          std("#8B6F5C", 0.75),
        );
        // Pivot from left edge: offset x by half-width, rotate, then shift
        const doorGroup = new THREE.Group();
        doorPanel.position.x = tw * 0.39;
        doorGroup.add(doorPanel);
        doorGroup.position.set(-tw * 0.39, 0.42, 0);
        doorGroup.rotation.y = -0.4; // slightly open
        g.add(doorGroup);
        // Door knob
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 6, 6),
          std("#C0A040", 0.3, 0.4),
        );
        knob.position.set(tw * 0.65, 0.42, -0.03);
        doorGroup.add(knob);
        break;
      }
      default: {
        // Generic fallback
        add(new THREE.BoxGeometry(tw, 0.45, th), new THREE.MeshToonMaterial({ color: f.col }), 0.23);
        break;
      }
    }
  }

  private buildTraps(lvl: LevelData) {
    const TS = TILE_SIZE;
    for (const t of lvl.traps) {
      const geo = new THREE.SphereGeometry(0.15, 8, 8);
      const mat = new THREE.MeshToonMaterial({ color: "#FFD700" });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((t.x - this.cx) * TS, TILE_H + 0.15, (t.z - this.cz) * TS);
      this.scene.add(mesh);

      const starGeo = new THREE.ConeGeometry(0.08, 0.12, 4);
      const starMat = new THREE.MeshToonMaterial({ color: "#FF6347" });
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set((t.x - this.cx) * TS, TILE_H + 0.35, (t.z - this.cz) * TS);
      this.scene.add(star);

      this.traps.push({ mesh, star, x: t.x, z: t.z, triggered: false });
    }
  }

  private buildGoal(lvl: LevelData, palette: typeof PALETTES[keyof typeof PALETTES]) {
    const TS = TILE_SIZE;
    const geo = new THREE.BoxGeometry(0.8 * TS, 0.15, 0.8 * TS);
    const mat = new THREE.MeshToonMaterial({
      color: palette.goal,
      emissive: palette.accent,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((lvl.goal.x - this.cx) * TS, TILE_H + 0.08, (lvl.goal.z - this.cz) * TS);
    this.scene.add(mesh);

    const ringGeo = new THREE.RingGeometry(0.35 * TS, 0.45 * TS, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.goalRing = new THREE.Mesh(ringGeo, ringMat);
    this.goalRing.rotation.x = -Math.PI / 2;
    this.goalRing.position.set((lvl.goal.x - this.cx) * TS, TILE_H + 0.18, (lvl.goal.z - this.cz) * TS);
    this.scene.add(this.goalRing);
  }

  private buildMom(lvl: LevelData) {
    const outfit = MOM_OUTFITS[lvl.scene];
    const g = new THREE.Group();

    const addMesh = (
      geo: THREE.BufferGeometry,
      col: string,
      y: number,
      rx = 0,
    ) => {
      const mat = new THREE.MeshToonMaterial({ color: col });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y; m.rotation.x = rx;
      m.castShadow = true;
      g.add(m);
      return m;
    };

    // Pants
    const pants = addMesh(new THREE.CylinderGeometry(0.15, 0.18, 0.5, 8), outfit.pantsColor, 0.25);
    this.momLower = pants;

    // Top — shape varies
    let headY = 0.92;
    switch (outfit.topStyle) {
      case "fitted":
        addMesh(new THREE.CylinderGeometry(0.13, 0.14, 0.25, 8), outfit.topColor, 0.63);
        headY = 0.88; break;
      case "oversized":
        addMesh(new THREE.CylinderGeometry(0.17, 0.16, 0.35, 8), outfit.topColor, 0.68);
        headY = 0.95; break;
      case "robe":
        addMesh(new THREE.CylinderGeometry(0.19, 0.18, 0.42, 8), outfit.topColor, 0.71);
        headY = 1.0; break;
      case "nightgown":
        addMesh(new THREE.CylinderGeometry(0.14, 0.15, 0.3, 8), outfit.topColor, 0.65);
        addMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.15, 8), outfit.topColor, 0.45); // skirt
        headY = 0.88; break;
    }

    // Head
    const head = addMesh(new THREE.SphereGeometry(0.13, 8, 8), "#F5D0B0", headY);
    this.momHead = head;

    // Eyes (on +Z face so they face movement direction)
    const eyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeL.position.set(-0.045, headY + 0.02, 0.11);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeR.position.set(0.045, headY + 0.02, 0.11);
    g.add(eyeR);

    // Hair
    const hairMat = new THREE.MeshToonMaterial({ color: "#4A2820" });
    switch (outfit.hair) {
      case "ponytail": {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), hairMat);
        bun.position.set(-0.08, headY + 0.03, 0);
        g.add(bun);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.2, 4), hairMat);
        tail.position.set(-0.15, headY - 0.07, 0);
        tail.rotation.z = Math.PI / 3;
        g.add(tail);
        break;
      }
      case "messyBun": {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), hairMat);
        bun.position.set(0, headY + 0.1, 0);
        g.add(bun);
        const w1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), hairMat);
        w1.position.set(-0.12, headY + 0.04, 0);
        g.add(w1);
        const w2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), hairMat);
        w2.position.set(0.12, headY + 0.04, 0.04);
        g.add(w2);
        break;
      }
      case "down": {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 4), hairMat);
        cap.scale.y = 0.5;
        cap.position.set(0, headY + 0.06, 0);
        g.add(cap);
        const drapeL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.25, 4), hairMat);
        drapeL.position.set(-0.14, headY - 0.1, 0);
        drapeL.rotation.z = 0.25;
        g.add(drapeL);
        const drapeR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.25, 4), hairMat);
        drapeR.position.set(0.14, headY - 0.1, 0);
        drapeR.rotation.z = -0.25;
        g.add(drapeR);
        break;
      }
    }

    g.position.set(
      (lvl.playerStart.x - this.cx) * TILE_SIZE,
      TILE_H,
      (lvl.playerStart.z - this.cz) * TILE_SIZE,
    );
    this.scene.add(g);
    this.mom = g;
    this.momPos = { x: lvl.playerStart.x, z: lvl.playerStart.z };
  }

  private buildNpcs(lvl: LevelData) {
    for (const def of lvl.npcs) {
      this.spawnNpc(def.type, def.x, def.z, def);
    }
  }

  private spawnNpc(
    type: "dog" | "toddler" | "husband",
    spawnX: number,
    spawnZ: number,
    def?: NpcDef,
    chasing = false,
  ): NpcState {
    const group = new THREE.Group();

    if (type === "dog") {
      // ── Proper sleeping dog ──────────────────────────────────────────────
      const bodyMat = new THREE.MeshToonMaterial({ color: "#8B6914" });
      const darkMat = new THREE.MeshToonMaterial({ color: "#6B5010" });
      const noseMat = new THREE.MeshToonMaterial({ color: "#3A2A1A" });

      // Body — cylinder laid horizontal (rotation.z = PI/2)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.45, 8), bodyMat);
      body.rotation.z = Math.PI / 2;
      body.position.set(0, 0.14, 0);
      body.castShadow = true;
      group.add(body);

      // Head — sphere forward of body
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bodyMat);
      head.position.set(0.25, 0.14, 0);
      head.castShadow = true;
      group.add(head);

      // Snout
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 7), bodyMat);
      snout.rotation.z = Math.PI / 2;
      snout.position.set(0.36, 0.12, 0);
      group.add(snout);

      // Nose
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), noseMat);
      nose.position.set(0.42, 0.13, 0);
      group.add(nose);

      // Ears (2 flat spheres drooping to sides)
      [0.07, -0.07].forEach((ez) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), darkMat);
        ear.scale.set(0.6, 0.3, 1.0);
        ear.position.set(0.22, 0.2, ez);
        group.add(ear);
      });

      // 4 Legs tucked under body
      [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]].forEach(([lx, lz]) => {
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.12, 5), bodyMat);
        limb.position.set(lx, 0.06, lz);
        group.add(limb);
      });

      // Tail — cone curving up from rear
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 6), bodyMat);
      tail.position.set(-0.27, 0.22, 0);
      tail.rotation.z = -0.8;
      group.add(tail);

      // Sound radius circle (r is in grid units, scale to world)
      const r = def?.radius ?? 2;
      const rW = r * TILE_SIZE;
      const circGeo = new THREE.RingGeometry(0.01, rW, 48);
      const circMat = new THREE.MeshBasicMaterial({ color: "#FF4444", transparent: true, opacity: 0.08, side: THREE.DoubleSide });
      const circ = new THREE.Mesh(circGeo, circMat);
      circ.rotation.x = -Math.PI / 2;
      circ.position.set((spawnX - this.cx) * TILE_SIZE, 0.02, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(circ);

      const pulseGeo = new THREE.RingGeometry(rW * 0.4, rW * 0.42, 48);
      const pulseMat = new THREE.MeshBasicMaterial({ color: "#FF6666", transparent: true, opacity: 0.15, side: THREE.DoubleSide });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.set((spawnX - this.cx) * TILE_SIZE, 0.03, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(pulse);

      // Sleep Z's
      const zGroup = new THREE.Group();
      zGroup.position.set((spawnX - this.cx) * TILE_SIZE + 0.3, 0.6, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(zGroup);
      const zSizes = [28, 22, 16];
      for (let i = 0; i < 3; i++) {
        const zSprite = this.makeZSprite("Z", zSizes[i]);
        zSprite.scale.set(0.28, 0.28, 1);
        const baseY = i * 0.22;
        zSprite.position.set(i * 0.1, baseY, 0);
        zSprite.userData = { phaseOffset: i * (Math.PI * 2 / 3), baseY };
        zGroup.add(zSprite);
      }

      // Bone thought bubble
      const dogTbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const dogTbGroup = new THREE.Group();
      dogTbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), dogTbMat));
      const dogDot1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dogTbMat);
      dogDot1.position.set(-0.12, -0.18, 0);
      dogTbGroup.add(dogDot1);
      const dogDot2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), dogTbMat);
      dogDot2.position.set(-0.18, -0.28, 0);
      dogTbGroup.add(dogDot2);
      const boneSprite = this.makeBoneSprite();
      boneSprite.position.set(0, 0.02, 0);
      dogTbGroup.add(boneSprite);
      dogTbGroup.position.set((spawnX - this.cx) * TILE_SIZE + 0.3, 0.65, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(dogTbGroup);

      group.position.set((spawnX - this.cx) * TILE_SIZE, TILE_H, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(group);
      const npc: NpcState = {
        type: "dog", group, pos: { x: spawnX, z: spawnZ }, startPos: { x: spawnX, z: spawnZ }, facing: 0,
        circ, pulse, zGroup, radius: r, thoughtBubble: dogTbGroup,
        patrolIdx: 0, patrolDir: 1, patrolTimer: 0,
        lured: false, lureTarget: null, lureTimer: 0,
        lastBubbleChange: 0, bubbleTextIdx: 0,
      };
      this.npcs.push(npc);
      return npc;

    } else if (type === "toddler") {
      const bodyMat = new THREE.MeshToonMaterial({ color: "#6CB4EE" });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 8), bodyMat);
      b.position.y = 0.13; b.castShadow = true;
      group.add(b);
      const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
        new THREE.MeshToonMaterial({ color: "#F5D8C0" }));
      h2.position.y = 0.42; h2.castShadow = true;
      group.add(h2);

      // Eyes (on +Z face so they face movement direction)
      const tEyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
      const tEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), tEyeMat);
      tEyeL.position.set(-0.06, 0.44, 0.13);
      group.add(tEyeL);
      const tEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), tEyeMat);
      tEyeR.position.set(0.06, 0.44, 0.13);
      group.add(tEyeR);

      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4),
        new THREE.MeshToonMaterial({ color: "#DEB887" }));
      tuft.position.y = 0.58;
      group.add(tuft);

      const coneLen = TODDLER_CONE_RANGE * TILE_SIZE;
      const coneW = Math.tan(TODDLER_CONE_ANGLE / 2) * coneLen;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(coneLen, coneW); shape.lineTo(coneLen, -coneW); shape.closePath();
      const coneMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: "#44FF44", transparent: true, opacity: 0.12, side: THREE.DoubleSide })
      );
      coneMesh.rotation.x = -Math.PI / 2;
      coneMesh.position.set((spawnX - this.cx) * TILE_SIZE, 0.04, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(coneMesh);

      // Baby talk speech bubble
      const toddlerTbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const toddlerTbGroup = new THREE.Group();
      toddlerTbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), toddlerTbMat));
      const tDot1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), toddlerTbMat);
      tDot1.position.set(-0.12, -0.18, 0);
      toddlerTbGroup.add(tDot1);
      const tDot2 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), toddlerTbMat);
      tDot2.position.set(-0.18, -0.28, 0);
      toddlerTbGroup.add(tDot2);
      const babyIdx = Math.floor(Math.random() * BABY_TALK.length);
      const babyText = this.makeTextSprite(BABY_TALK[babyIdx]);
      babyText.position.set(0, 0.04, 0);
      babyText.name = "bubbleText";
      toddlerTbGroup.add(babyText);
      toddlerTbGroup.position.set((spawnX - this.cx) * TILE_SIZE + 0.3, 0.9, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(toddlerTbGroup);

      group.position.set((spawnX - this.cx) * TILE_SIZE, TILE_H, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(group);
      const npc: NpcState = {
        type: "toddler", group, coneMesh, thoughtBubble: toddlerTbGroup,
        pos: { x: spawnX, z: spawnZ }, startPos: { x: spawnX, z: spawnZ }, facing: def?.facing ?? 0,
        patrol: def?.patrol, patrolIdx: 0, patrolDir: 1, patrolTimer: 0,
        coneRange: TODDLER_CONE_RANGE, coneAngle: TODDLER_CONE_ANGLE, speed: TODDLER_SPEED,
        lured: chasing, lureTarget: chasing ? { x: this.momPos.x, z: this.momPos.z } : null,
        lureTimer: 0, chasing,
        lastBubbleChange: 0, bubbleTextIdx: babyIdx,
      };
      this.npcs.push(npc);
      return npc;

    } else { // husband
      const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 8),
        new THREE.MeshToonMaterial({ color: "#4A5568" }));
      b3.position.y = 0.28; b3.castShadow = true;
      group.add(b3);
      const h3 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshToonMaterial({ color: "#E8C8A0" }));
      h3.position.y = 0.7; h3.castShadow = true;
      group.add(h3);

      // Eyes (on +Z face so they face movement direction)
      const hEyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
      const hEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), hEyeMat);
      hEyeL.position.set(-0.05, 0.72, 0.12);
      group.add(hEyeL);
      const hEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), hEyeMat);
      hEyeR.position.set(0.05, 0.72, 0.12);
      group.add(hEyeR);

      const coneLen2 = HUSBAND_CONE_RANGE * TILE_SIZE;
      const coneW2 = Math.tan(HUSBAND_CONE_ANGLE / 2) * coneLen2;
      const shape2 = new THREE.Shape();
      shape2.moveTo(0, 0); shape2.lineTo(coneLen2, coneW2); shape2.lineTo(coneLen2, -coneW2); shape2.closePath();
      const coneMesh2 = new THREE.Mesh(
        new THREE.ShapeGeometry(shape2),
        new THREE.MeshBasicMaterial({ color: "#FF8844", transparent: true, opacity: 0.1, side: THREE.DoubleSide })
      );
      coneMesh2.rotation.x = -Math.PI / 2;
      coneMesh2.position.set((spawnX - this.cx) * TILE_SIZE, 0.04, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(coneMesh2);

      const tbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const tbGroup = new THREE.Group();
      tbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), tbMat));
      const dot1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), tbMat);
      dot1.position.set(-0.15, -0.2, 0);
      tbGroup.add(dot1);
      const dot2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), tbMat);
      dot2.position.set(-0.22, -0.32, 0);
      tbGroup.add(dot2);
      const dadIdx = Math.floor(Math.random() * DAD_THOUGHTS.length);
      const initThought = def?.thought ?? DAD_THOUGHTS[dadIdx];
      const dadText = this.makeTextSprite(initThought);
      dadText.position.set(0, 0.04, 0);
      dadText.name = "bubbleText";
      tbGroup.add(dadText);
      tbGroup.position.set((spawnX - this.cx) * TILE_SIZE + 0.35, 1.2, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(tbGroup);

      group.position.set((spawnX - this.cx) * TILE_SIZE, TILE_H, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(group);
      const npc: NpcState = {
        type: "husband", group, coneMesh: coneMesh2, thoughtBubble: tbGroup,
        pos: { x: spawnX, z: spawnZ }, startPos: { x: spawnX, z: spawnZ }, facing: def?.facing ?? 0,
        patrol: def?.patrol, patrolIdx: 0, patrolDir: 1, patrolTimer: 0,
        coneRange: HUSBAND_CONE_RANGE, coneAngle: HUSBAND_CONE_ANGLE, speed: HUSBAND_SPEED,
        lured: false, lureTarget: null, lureTimer: 0,
        lastBubbleChange: 0, bubbleTextIdx: dadIdx,
      };
      this.npcs.push(npc);
      return npc;
    }
  }

  private buildHidingSpots(lvl: LevelData) {
    const TS = TILE_SIZE;
    for (const hs of lvl.hidingSpots ?? []) {
      const circGeo = new THREE.CircleGeometry(0.35, 16);
      const circMat = new THREE.MeshBasicMaterial({
        color: "#44FF88", transparent: true, opacity: 0.2, side: THREE.DoubleSide,
      });
      const circ = new THREE.Mesh(circGeo, circMat);
      circ.rotation.x = -Math.PI / 2;
      circ.position.set((hs.x - this.cx) * TS, TILE_H + 0.02, (hs.z - this.cz) * TS);
      this.scene.add(circ);
      this.hidingMeshes.push(circ);

      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshToonMaterial({ color: "#228B22" }),
      );
      bush.position.set((hs.x - this.cx) * TS, TILE_H + 0.15, (hs.z - this.cz) * TS);
      bush.castShadow = true;
      this.scene.add(bush);
      this.hidingMeshes.push(bush);
    }
  }

  // ── Canvas sprite helpers ─────────────────────────────────────────────────

  private makeZSprite(text: string, fontSize: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  }

  private makeBoneSprite(): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    // Draw a bone shape: two circles connected by a rectangle
    ctx.fillStyle = "#D2B48C";
    ctx.strokeStyle = "#8B7355";
    ctx.lineWidth = 2;
    // Shaft
    ctx.fillRect(20, 26, 24, 12);
    ctx.strokeRect(20, 26, 24, 12);
    // Left knobs
    ctx.beginPath(); ctx.arc(20, 26, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(20, 38, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Right knobs
    ctx.beginPath(); ctx.arc(44, 26, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(44, 38, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(0.4, 0.4, 1);
    return sprite;
  }

  private makeTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "#333333";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(1.0, 0.25, 1);
    return sprite;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────

  private animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.frame++;

    // Animate outdoor objects (always, regardless of game state)
    this.updateOutdoor(dt);

    if (this.caught) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Relax zoom-in phase (after winning, zoom back in on Mom)
    if (this.won) {
      if (this.relaxZoomPhase) {
        this.relaxZoomElapsed += dt;
        const zoomT = Math.min(this.relaxZoomElapsed / INTRO_ZOOM_SECS, 1);
        const eased = easeOutQuad(zoomT);
        this.frust = lerp(this.introFrustEnd, this.introFrustStart, eased);
        // Pan camera from room center to mom
        const momWX = this.mom.position.x;
        const momWZ = this.mom.position.z;
        const tx = lerp(0, momWX, eased);
        const tz = lerp(0, momWZ, eased);
        this.camTarget.set(tx, 0, tz);
        this.camera.position.set(15 + tx, 15, 15 + tz);
        this.camera.lookAt(this.camTarget);
        this.updateFrustum();
        if (zoomT >= 1) {
          this.relaxZoomPhase = false;
          this.relaxZoomCallback?.();
          this.callbacks.onWon(this.level.winText);
        }
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Intro zoom-out phase
    if (this.introPhase) {
      this.introElapsed += dt;
      if (this.introElapsed > INTRO_HOLD_SECS) {
        const zoomT = Math.min((this.introElapsed - INTRO_HOLD_SECS) / INTRO_ZOOM_SECS, 1);
        const eased = easeOutQuad(zoomT);
        this.frust = lerp(this.introFrustStart, this.introFrustEnd, eased);
        // Pan camera from mom to room center
        const momWX = this.mom.position.x;
        const momWZ = this.mom.position.z;
        const tx = lerp(momWX, 0, eased);
        const tz = lerp(momWZ, 0, eased);
        this.camTarget.set(tx, 0, tz);
        this.camera.position.set(15 + tx, 15, 15 + tz);
        this.camera.lookAt(this.camTarget);
        this.updateFrustum();
        if (zoomT >= 1) {
          this.introPhase = false;
          this.introCompleteCallback?.();
        }
      }
      // Goal ring pulse still runs during intro
      const s = 1 + Math.sin(this.frame * 0.05) * 0.15;
      this.goalRing.scale.set(s, s, 1);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.updateMom(dt);
    this.checkTraps();
    this.updateNpcs(dt);
    this.checkDetection();
    this.checkGoal();

    // Goal ring pulse
    const s = 1 + Math.sin(this.frame * 0.05) * 0.15;
    this.goalRing.scale.set(s, s, 1);

    // Glow mesh pulse (decoy indicators)
    this.glowMeshes.forEach((gm) => {
      const intensity = 0.6 + Math.sin(this.frame * 0.08) * 0.4;
      (gm.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
      const sc = 0.9 + Math.sin(this.frame * 0.08) * 0.15;
      gm.scale.setScalar(sc);
    });

    this.renderer.render(this.scene, this.camera);
  };

  private updateOutdoor(dt: number) {
    // Animate driving cars
    for (const car of this.outdoorCars) {
      car.group.position.x += car.speed * dt;
      // Wrap around when going off-screen
      if (car.speed > 0 && car.group.position.x > car.maxX) {
        car.group.position.x = car.minX;
      } else if (car.speed < 0 && car.group.position.x < car.minX) {
        car.group.position.x = car.maxX;
      }
    }
    // Animate walking people
    const time = this.frame * 0.03;
    for (const person of this.outdoorPeople) {
      person.group.position.x += person.speed * dt;
      // Wrap around
      if (person.speed > 0 && person.group.position.x > person.maxX) {
        person.group.position.x = person.minX;
      } else if (person.speed < 0 && person.group.position.x < person.minX) {
        person.group.position.x = person.maxX;
      }
      // Leg swing animation
      const swing = Math.sin(time * 4) * 0.35;
      person.leftLeg.rotation.x = swing;
      person.rightLeg.rotation.x = -swing;
    }
  }

  private updateMom(dt: number) {
    if (!this.momPath || this.momPathIdx >= this.momPath.length) {
      // Idle sway
      if (this.momHead) this.momHead.position.y += Math.sin(this.frame * 0.015) * 0.0005;
      return;
    }

    const target = this.momPath[this.momPathIdx];
    const dx = target.x - this.momPos.x;
    const dz = target.z - this.momPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);

    if (d < 0.05) {
      this.momPos.x = target.x;
      this.momPos.z = target.z;
      this.momPathIdx++;
    } else {
      const step = Math.min(SNEAK_SPEED * dt, d);
      this.momPos.x += (dx / d) * step;
      this.momPos.z += (dz / d) * step;
      this.mom.rotation.y = Math.atan2(dx, dz);
    }

    this.mom.position.set(
      (this.momPos.x - this.cx) * TILE_SIZE,
      TILE_H,
      (this.momPos.z - this.cz) * TILE_SIZE,
    );

    // Walking bob
    const f = this.frame;
    if (this.momLower) this.momLower.position.y = 0.25 + Math.sin(f * 0.3) * 0.02;
    if (this.momHead)  this.momHead.position.y  += Math.sin(f * 0.3 + 1) * 0.0005;

    if (f % 8 === 0) AudioManager.play("footstep-soft");

    // Proximity detection for decoy pickups
    let nearestPickup: string | null = null;
    for (const fg of this.furnitureGroups) {
      if (!fg.userData.hasDecoy) continue;
      const fd = this.level.furniture.find((furn) => furn.label === fg.userData.label);
      if (!fd) continue;
      const fx = fd.x + fd.w / 2 - 0.5;
      const fz = fd.z + fd.h / 2 - 0.5;
      if (dist2d(this.momPos.x, this.momPos.z, fx, fz) < PICKUP_RANGE) {
        const di = this.level.decoyItems?.find((d) => d.sourceFurniture === fd.label);
        if (di && !this.pickedUpItems.has(di.itemName)) {
          nearestPickup = di.itemName;
          break;
        }
      }
    }
    this.callbacks.onNearPickup(nearestPickup);
  }

  private checkTraps() {
    const mx = Math.round(this.momPos.x);
    const mz = Math.round(this.momPos.z);
    for (const tr of this.traps) {
      if (!tr.triggered && tr.x === mx && tr.z === mz) {
        tr.triggered = true;
        (tr.mesh.material as THREE.MeshToonMaterial).color.set("#FF0000");
        (tr.star.material as THREE.MeshToonMaterial).color.set("#FF0000");
        AudioManager.play("squeak");

        const summon = this.level.summonNpc;
        if (summon && !this.summoned) {
          this.summoned = true;
          this.spawnNpc(summon.type, summon.x, summon.z, undefined, true);
        } else {
          this.triggerCaught("toddler");
        }
      }
    }
  }

  private updateNpcs(dt: number) {
    for (const npc of this.npcs) {
      if (npc.type === "dog") {
        // Pulse animation
        if (npc.pulse) {
          const sc = 1 + Math.sin(this.frame * 0.04) * 0.15;
          npc.pulse.scale.set(sc, sc, 1);
          (npc.pulse.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(this.frame * 0.04) * 0.05;
        }

        // Dog can be lured to investigate
        if (npc.lured && npc.lureTarget) {
          const lt = npc.lureTarget;
          const dx = lt.x - npc.pos.x;
          const dz = lt.z - npc.pos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < 0.2) {
            npc.lureTimer += dt;
            // Hide Z's while dog is awake
            if (npc.zGroup) npc.zGroup.visible = false;
            if (npc.lureTimer > LURE_INVESTIGATE_SECS + 1) {
              npc.lured = false;
              npc.lureTimer = 0;
              // Return to start
              npc.lureTarget = { ...npc.startPos };
              if (npc.zGroup) npc.zGroup.visible = true;
            }
          } else {
            const spd = TODDLER_SPEED * dt;
            npc.pos.x += (dx / d) * Math.min(spd, d);
            npc.pos.z += (dz / d) * Math.min(spd, d);
          }
          npc.group.position.set((npc.pos.x - this.cx) * TILE_SIZE, TILE_H, (npc.pos.z - this.cz) * TILE_SIZE);
          if (npc.circ)  npc.circ.position.set((npc.pos.x - this.cx) * TILE_SIZE, 0.02, (npc.pos.z - this.cz) * TILE_SIZE);
          if (npc.pulse) npc.pulse.position.set((npc.pos.x - this.cx) * TILE_SIZE, 0.03, (npc.pos.z - this.cz) * TILE_SIZE);
          if (npc.zGroup) npc.zGroup.position.set((npc.pos.x - this.cx) * TILE_SIZE + 0.3, 0.6, (npc.pos.z - this.cz) * TILE_SIZE);
          if (npc.thoughtBubble) {
            npc.thoughtBubble.position.set(
              (npc.pos.x - this.cx) * TILE_SIZE + 0.3,
              0.65 + Math.sin(this.frame * 0.02) * 0.05,
              (npc.pos.z - this.cz) * TILE_SIZE,
            );
          }
        } else {
          // Sleeping Z animation
          if (npc.zGroup) {
            npc.zGroup.position.y = 0.6 + Math.sin(this.frame * 0.02) * 0.1;
            npc.zGroup.children.forEach((child) => {
              const phase = (child.userData.phaseOffset as number) ?? 0;
              const t = (this.frame * 0.03 + phase) % (Math.PI * 2);
              child.position.y = (child.userData.baseY as number) + Math.sin(t) * 0.06;
              (child as THREE.Sprite).material.opacity = 0.35 + Math.sin(t) * 0.35;
            });
          }
          // Dog thought bubble bob
          if (npc.thoughtBubble) {
            npc.thoughtBubble.position.y = 0.65 + Math.sin(this.frame * 0.02) * 0.05;
          }
        }
        continue;
      }

      // Summoned chaser: always track mom
      if (npc.chasing) {
        npc.lured = true;
        npc.lureTarget = { x: this.momPos.x, z: this.momPos.z };
      }

      // Patrol or lure movement
      if (npc.lured && npc.lureTarget) {
        const lt = npc.lureTarget;
        const dx = lt.x - npc.pos.x;
        const dz = lt.z - npc.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.2) {
          if (!npc.chasing) {
            npc.lureTimer += dt;
            if (npc.lureTimer > LURE_INVESTIGATE_SECS) {
              npc.lured = false;
              npc.lureTimer = 0;
            }
          }
        } else {
          const spd = (npc.speed ?? TODDLER_SPEED) * LURE_SPEED_MULTIPLIER * dt;
          npc.pos.x += (dx / d) * Math.min(spd, d);
          npc.pos.z += (dz / d) * Math.min(spd, d);
          npc.facing = Math.atan2(dx, dz);
        }
      } else if (npc.patrol) {
        const wp = npc.patrol[npc.patrolIdx];
        const dx = wp[0] - npc.pos.x;
        const dz = wp[1] - npc.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.05) {
          npc.patrolTimer += dt;
          if (npc.patrolTimer > 1.0) {
            npc.patrolTimer = 0;
            npc.patrolIdx = (npc.patrolIdx + 1) % npc.patrol.length;
          }
        } else {
          const spd = (npc.speed ?? TODDLER_SPEED) * dt;
          npc.pos.x += (dx / d) * Math.min(spd, d);
          npc.pos.z += (dz / d) * Math.min(spd, d);
          npc.facing = Math.atan2(dx, dz);
        }
      }

      npc.group.position.set((npc.pos.x - this.cx) * TILE_SIZE, TILE_H, (npc.pos.z - this.cz) * TILE_SIZE);
      if (npc.type === "toddler") {
        npc.group.rotation.y = npc.facing;
        npc.group.rotation.z = Math.sin(this.frame * 0.15) * 0.08;
      } else if (npc.type === "husband") {
        npc.group.rotation.y = npc.facing;
      }
      if (npc.coneMesh) {
        npc.coneMesh.position.set((npc.pos.x - this.cx) * TILE_SIZE, 0.04, (npc.pos.z - this.cz) * TILE_SIZE);
        npc.coneMesh.rotation.z = -(npc.facing - Math.PI / 2);
      }
      if (npc.thoughtBubble) {
        const bubbleY = npc.type === "toddler" ? 0.9 : 1.2;
        const bubbleX = npc.type === "toddler" ? 0.3 : 0.35;
        npc.thoughtBubble.position.set(
          (npc.pos.x - this.cx) * TILE_SIZE + bubbleX,
          bubbleY + Math.sin(this.frame * 0.02) * 0.05,
          (npc.pos.z - this.cz) * TILE_SIZE,
        );

        // Cycle text every ~3-4 seconds
        const cycleInterval = npc.type === "toddler" ? 180 : 240;
        if (this.frame - npc.lastBubbleChange > cycleInterval) {
          npc.lastBubbleChange = this.frame;
          const textArr = npc.type === "toddler" ? BABY_TALK : DAD_THOUGHTS;
          npc.bubbleTextIdx = (npc.bubbleTextIdx + 1) % textArr.length;
          // Remove old text sprite
          const old = npc.thoughtBubble.getObjectByName("bubbleText");
          if (old) npc.thoughtBubble.remove(old);
          // Add new text sprite
          const newText = this.makeTextSprite(textArr[npc.bubbleTextIdx]);
          newText.position.set(0, 0.04, 0);
          newText.name = "bubbleText";
          npc.thoughtBubble.add(newText);
        }
      }
    }
  }

  private checkDetection() {
    if (this.caught) return;
    const lvl = this.level;

    for (const npc of this.npcs) {
      if (npc.type === "dog") {
        const d = dist2d(this.momPos.x, this.momPos.z, npc.pos.x, npc.pos.z);
        if (d < (npc.radius ?? 2)) {
          if (npc.circ) {
            (npc.circ.material as THREE.MeshBasicMaterial).opacity = 0.3;
            (npc.circ.material as THREE.MeshBasicMaterial).color.set("#FF0000");
          }
          this.triggerCaught("dog");
          return;
        }
      } else {
        const inCone = pointInCone(
          this.momPos.x, this.momPos.z,
          npc.pos.x, npc.pos.z,
          npc.facing, npc.coneAngle!, npc.coneRange!
        );
        if (inCone) {
          const hiding = (lvl.hidingSpots ?? []).some(
            (hs) => Math.round(this.momPos.x) === hs.x && Math.round(this.momPos.z) === hs.z
          );
          if (!hiding) {
            if (npc.coneMesh) {
              (npc.coneMesh.material as THREE.MeshBasicMaterial).color.set("#FF0000");
            }
            this.triggerCaught(npc.type);
            return;
          }
        }
      }
    }
  }

  private checkGoal() {
    if (this.won) return;
    const lvl = this.level;
    if (
      Math.round(this.momPos.x) === lvl.goal.x &&
      Math.round(this.momPos.z) === lvl.goal.z
    ) {
      this.won = true;
      AudioManager.play("success");
      AudioManager.stopAmbient();
      this.relaxZoomPhase = true;
      this.relaxZoomElapsed = 0;
    }
  }

  private triggerCaught(npcType: NpcState["type"] = "toddler") {
    if (this.caught) return;
    this.caught = true;
    const soundKey = npcType === "dog" ? "caught-dog"
      : npcType === "husband" ? "caught-husband"
      : "caught-mommy";
    AudioManager.play(soundKey);
    const line = pickRandom(this.level.caughtLines);
    setTimeout(() => this.callbacks.onCaught(line), CAUGHT_DELAY_MS);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setDecoyItem(item: DecoyItemDef | null) {
    this.currentDecoyItem = item;
    if (item) this.pickedUpItems.add(item.itemName);
  }

  setIntroCompleteCallback(cb: () => void) {
    this.introCompleteCallback = cb;
  }

  setRelaxZoomCallback(cb: () => void) {
    this.relaxZoomCallback = cb;
  }

  setDeferredTapHandler(cb: (x: number, y: number) => void) {
    this.onDeferredTap = cb;
  }

  handleTap(clientX: number, clientY: number, decoyMode: false | "throw"): false | "thrown" {
    if (this.caught || this.won || this.introPhase) return false;

    const rect = this.element.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const hits = ray.intersectObjects(this.tileMeshes);
    if (hits.length === 0) return false;

    const tile = hits[0].object as THREE.Mesh;
    const { gx, gz } = tile.userData as { gx: number; gz: number; baseColor: string };

    if (decoyMode === "throw") {
      const targetNpc = this.currentDecoyItem?.targetNpc ?? "husband";
      const npc = this.npcs.find((n) => n.type === targetNpc);
      if (npc) {
        npc.lured = true;
        npc.lureTarget = { x: gx, z: gz };
        npc.lureTimer = 0;
      }
      (tile.material as THREE.MeshStandardMaterial).color.set("#FFD700");
      setTimeout(() => (tile.material as THREE.MeshStandardMaterial).color.set(tile.userData.baseColor), 500);

      if (this.decoyMesh) {
        this.scene.remove(this.decoyMesh);
        this.decoyMesh = null;
      }
      const decoyColor = this.currentDecoyItem?.meshColor ?? "#FFD700";
      this.decoyMesh = this.buildDecoyMesh(gx, gz, decoyColor);
      this.scene.add(this.decoyMesh);
      setTimeout(() => {
        if (this.decoyMesh) { this.scene.remove(this.decoyMesh); this.decoyMesh = null; }
      }, (LURE_INVESTIGATE_SECS + 2) * 1000);

      AudioManager.play("decoy-throw");
      return "thrown";
    }

    // Normal movement
    const lvl = this.level;
    const startX = Math.round(this.momPos.x);
    const startZ = Math.round(this.momPos.z);
    const path = findPath(startX, startZ, gx, gz, this.blocked, lvl.grid.w, lvl.grid.h);
    if (path && path.length > 1) {
      this.momPath = path.slice(1);
      this.momPathIdx = 0;
      const palette = PALETTES[lvl.scene];
      (tile.material as THREE.MeshStandardMaterial).color.set(palette.accent);
      setTimeout(() => (tile.material as THREE.MeshStandardMaterial).color.set(tile.userData.baseColor), 300);
    }

    return false;
  }

  private buildDecoyMesh(x: number, z: number, color: string): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color });
    // Small rounded shape for the decoy item
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat);
    g.add(body);
    // Subtle shimmer ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 16),
      new THREE.MeshBasicMaterial({ color: "#FFD700", transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.08;
    g.add(ring);
    g.position.set((x - this.cx) * TILE_SIZE, TILE_H + 0.3, (z - this.cz) * TILE_SIZE);
    return g;
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener("resize", this.onResize);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("touchstart", this.onTouchStart);
    canvas.removeEventListener("touchmove", this.onTouchMove);
    canvas.removeEventListener("touchend", this.onTouchEnd);
    if (this.pendingTapTimer) clearTimeout(this.pendingTapTimer);
    if (this.decoyMesh) { this.scene.remove(this.decoyMesh); this.decoyMesh = null; }
    AudioManager.stopAmbient();
    this.renderer.dispose();
    this.element.innerHTML = "";
  }

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      // Store coords but don't tap yet — wait to see if a second finger arrives
      this.pendingTapCoords = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.wasMultiTouch = false;
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      // Cancel any pending single-finger tap
      if (this.pendingTapTimer) { clearTimeout(this.pendingTapTimer); this.pendingTapTimer = null; }
      this.pendingTapCoords = null;
      this.wasMultiTouch = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDist = Math.hypot(dx, dy);
      this.pinchStartFrust = this.frust;
      this.panStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.panStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this.panStartOffset.copy(this.panOffset);
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    // When all fingers are lifted after a single-finger tap (no multi-touch), fire the tap
    if (e.touches.length === 0 && this.pendingTapCoords && !this.wasMultiTouch) {
      e.preventDefault(); // prevent synthetic click event on touch devices
      const coords = this.pendingTapCoords;
      this.pendingTapCoords = null;
      this.onDeferredTap?.(coords.x, coords.y);
    }
    if (e.touches.length === 0) {
      this.wasMultiTouch = false;
      this.pendingTapCoords = null;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && !this.introPhase && !this.relaxZoomPhase) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (this.pinchStartDist > 0) {
        // Pinch zoom
        const scale = this.pinchStartDist / dist;
        this.frust = Math.max(this.frustMin, Math.min(this.frustMax, this.pinchStartFrust * scale));
        this.introFrustEnd = this.frust;
        this.updateFrustum();
      }
      // Pan: convert screen-space delta to isometric world-space
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const screenDx = midX - this.panStartMidX;
      const screenDy = midY - this.panStartMidY;
      // Convert pixels to world units: frustum covers half the screen height
      const el = this.element;
      const pixelsPerUnit = el.clientHeight / (2 * this.frust);
      const worldDx = -screenDx / pixelsPerUnit;
      const worldDy = -screenDy / pixelsPerUnit;
      // Isometric camera right direction: (1, 0, -1) / sqrt(2)
      // Isometric camera up direction: (-1, 2, -1) / sqrt(6), but projected on XZ: (-1, 0, -1) / sqrt(2)
      const INV_SQRT2 = 1 / Math.SQRT2;
      this.panOffset.x = this.panStartOffset.x + (worldDx * INV_SQRT2 + worldDy * -INV_SQRT2);
      this.panOffset.z = this.panStartOffset.z + (worldDx * -INV_SQRT2 + worldDy * -INV_SQRT2);
      this.applyCameraOffset();
    }
  };

  private applyCameraOffset() {
    const ox = this.panOffset.x;
    const oz = this.panOffset.z;
    this.camera.position.set(15 + ox, 15, 15 + oz);
    this.camTarget.set(ox, 0, oz);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  private updateFrustum() {
    const el = this.element;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    const a = w / h;
    const f = this.frust;
    this.camera.left = -f * a;
    this.camera.right = f * a;
    this.camera.top = f;
    this.camera.bottom = -f;
    this.camera.updateProjectionMatrix();
  }

  private onResize = () => {
    this.updateFrustum();
    const el = this.element;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
  };
}
