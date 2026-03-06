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
  // limb references for walk animation
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
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
  private momLeftLeg: THREE.Object3D | null = null;
  private momRightLeg: THREE.Object3D | null = null;
  private momLeftCalf: THREE.Object3D | null = null;
  private momRightCalf: THREE.Object3D | null = null;
  private momLeftArm: THREE.Object3D | null = null;
  private momRightArm: THREE.Object3D | null = null;

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
  private introPaused = false;
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

  // ── Relax scene (Level 1 3D interactive) ───────────────────────────────────
  private relaxSceneActive = false;
  private relaxClickCallback: ((itemId: string, feedback: string, screenX: number, screenY: number) => void) | null = null;
  private relaxClickables: THREE.Object3D[] = [];
  private relaxCheesePieces: THREE.Mesh[] = [];
  private relaxWineGlass: THREE.Group | null = null;
  private relaxTvScreen: THREE.Mesh | null = null;
  private relaxTvLight: THREE.PointLight | null = null;

  // Relax animation state machine
  private relaxAnim: {
    type: "idle" | "cheese-reach" | "cheese-eat" | "cheese-return" | "wine-reach" | "wine-drink" | "wine-return";
    elapsed: number;
    duration: number;
    target?: THREE.Mesh; // cheese piece being eaten
  } = { type: "idle", elapsed: 0, duration: 0 };

  // Relax animation — multi-phase sit-down sequence
  // Phases: 0=walk-step1, 1=walk-step2, 2=turn-and-sit, 3=head-settle,
  //         4=left-leg-up, 5=right-leg-up, 6=arms, 7=done
  private relaxPhase = -1;
  private relaxPhaseT = 0;
  private relaxWaypoints: THREE.Vector3[] = [];  // walk targets
  private relaxWalkStartPos: THREE.Vector3 | null = null;
  private relaxStartRotY = 0;
  private relaxSeatPos: THREE.Vector3 | null = null; // couch seat position

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
      if (f.shape === "door") return; // doors are walkable
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
    const stdMat = (col: string, rough = 0.7) =>
      new THREE.MeshStandardMaterial({ color: col, roughness: rough });
    const fenceMat = new THREE.MeshStandardMaterial({ color: palette.fence, roughness: 0.7 });

    // ── Player's lot dimensions ──
    // House edges in world coords
    const houseMinX = -this.cx * TS;
    const houseMaxX = (W - this.cx) * TS;
    const houseMinZ = -this.cz * TS;  // north edge (back)
    const houseMaxZ = (H - this.cz) * TS;  // south edge (front)
    const houseW = houseMaxX - houseMinX;
    const houseD = houseMaxZ - houseMinZ;

    // Yard padding: small front yard, large back yard
    const frontPad = 2.0 * TS;
    const backPad = 14.0 * TS;
    const sidePad = 2.5 * TS;

    const fenceMinX = houseMinX - sidePad;
    const fenceMaxX = houseMaxX + sidePad;
    const fenceMinZ = houseMinZ - backPad;   // big back yard
    const fenceMaxZ = houseMaxZ + frontPad;   // small front yard

    // ── Lot dimensions for neighbor houses ──
    const lotW = houseW * 0.85;         // neighbor lot width
    const lotD = fenceMaxZ - fenceMinZ;  // same depth as player lot
    const lotGap = 0.4;                  // gap between lots
    const neighborHouseW = lotW * 0.7;
    const neighborHouseD = houseD * 0.65;
    const wallH = 1.5;

    // ── Road position ──
    const roadZ = fenceMaxZ + 3.5;
    // Full street width spans all lots
    const totalMinX = fenceMinX - (lotW + lotGap);
    const totalMaxX = fenceMaxX + (lotW + lotGap);
    const roadW = totalMaxX - totalMinX + 6;
    const roadCenterX = (totalMinX + totalMaxX) / 2;

    // ── Grass plane (huge, covers entire neighborhood) ──
    const grassW = roadW + 10;
    const grassD = lotD * 4 + 20;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(grassW, grassD),
      new THREE.MeshStandardMaterial({ color: palette.grass, roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(roadCenterX, -0.01, roadZ);
    grass.receiveShadow = true;
    this.scene.add(grass);

    // ── Helper: build a fence rectangle ──
    const buildFenceRect = (x1: number, z1: number, x2: number, z2: number, gateZ?: number, simple = false) => {
      const addRail = (px: number, pz: number, rw: number, rd: number) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.05, rd), fenceMat);
        rail.position.set(px, 0.25, pz);
        this.scene.add(rail);
      };
      // Rails on all 4 sides
      addRail((x1 + x2) / 2, z1, x2 - x1, 0.06);
      addRail((x1 + x2) / 2, z2, x2 - x1, 0.06);
      addRail(x1, (z1 + z2) / 2, 0.06, z2 - z1);
      addRail(x2, (z1 + z2) / 2, 0.06, z2 - z1);
      // Posts — only for player fence (simple=false), sparse spacing
      if (!simple) {
        const spacing = 1.6;
        for (let x = x1; x <= x2; x += spacing) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
          post.position.set(x, 0.2, z1); this.scene.add(post);
          const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
          post2.position.set(x, 0.2, z2); this.scene.add(post2);
        }
        for (let z = z1; z <= z2; z += spacing) {
          if (gateZ !== undefined && Math.abs(z - gateZ) < 0.6) continue;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
          post.position.set(x1, 0.2, z); this.scene.add(post);
          const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), fenceMat);
          post2.position.set(x2, 0.2, z); this.scene.add(post2);
        }
      }
    };

    // Player's fence
    buildFenceRect(fenceMinX, fenceMinZ, fenceMaxX, fenceMaxZ, fenceMaxZ);

    // ── Helper: add bushes at corners ──
    const bushColors = ["#3A7A2A", "#4A8A30", "#2A6A1A", "#5A9A38"];
    const addBushes = (x1: number, z1: number, x2: number, z2: number) => {
      const corners: [number, number][] = [
        [x1 + 0.5, z1 + 0.5], [x2 - 0.5, z1 + 0.5],
        [x1 + 0.5, z2 - 0.5], [x2 - 0.5, z2 - 0.5],
      ];
      corners.forEach(([bx, bz], i) => {
        const r = 0.15 + (i % 3) * 0.04;
        const bush = new THREE.Mesh(
          new THREE.SphereGeometry(r, 7, 7),
          stdMat(bushColors[i % bushColors.length], 0.9),
        );
        bush.position.set(bx, r, bz);
        bush.castShadow = true;
        this.scene.add(bush);
      });
    };
    addBushes(fenceMinX, fenceMinZ, fenceMaxX, fenceMaxZ);

    // ── Driveway ──
    const dwX = fenceMaxX - 1.5;
    const dwZ1 = (houseMaxZ + fenceMaxZ) / 2;
    const dwZ2 = roadZ + 1.5;
    const driveway = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.02, dwZ2 - dwZ1),
      stdMat("#B0A898", 0.9),
    );
    driveway.position.set(dwX, 0.005, (dwZ1 + dwZ2) / 2);
    driveway.receiveShadow = true;
    this.scene.add(driveway);

    // ── Front road ──
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(roadW, 0.02, 3.0),
      stdMat("#3A3A3A", 0.95),
    );
    road.position.set(roadCenterX, 0.003, roadZ);
    road.receiveShadow = true;
    this.scene.add(road);
    // Yellow center line
    for (let i = 0; i < 12; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(roadW / 18, 0.015, 0.06),
        stdMat("#E8C840"),
      );
      dash.position.set(totalMinX + (i + 0.5) * roadW / 12, 0.025, roadZ);
      this.scene.add(dash);
    }
    // Sidewalks
    for (const sideOff of [-2.0, 2.0]) {
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(roadW + 2, 0.02, 0.8),
        stdMat("#C8C0B4", 0.85),
      );
      sidewalk.position.set(roadCenterX, 0.006, roadZ + sideOff);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    }

    // ── Flower beds along front of player's house ──
    const flowerColors = ["#FF6B8A", "#FFD700", "#FF4500", "#DA70D6", "#FF69B4", "#FFA500"];
    for (let i = 0; i < 10; i++) {
      const fx = fenceMinX + 1.5 + i * ((fenceMaxX - fenceMinX - 3) / 10);
      const fz = fenceMaxZ - 0.7;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        stdMat(flowerColors[i % flowerColors.length]),
      );
      flower.position.set(fx, 0.08, fz);
      this.scene.add(flower);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4),
        stdMat("#2A7A1A"),
      );
      stem.position.set(fx, 0.04, fz);
      this.scene.add(stem);
    }

    // ── Trees in the back yard (spread across larger yard) ──
    const treePositions: [number, number][] = [
      [fenceMinX + 1.5, fenceMinZ + 2],
      [fenceMaxX - 1.5, fenceMinZ + 2],
      [(fenceMinX + fenceMaxX) / 2 - 2, fenceMinZ + 1.5],
      [fenceMaxX - 2, houseMinZ - 5],
      [fenceMinX + 1.5, houseMinZ - 5],
    ];
    const addTree = (tx: number, tz: number) => {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6),
        stdMat("#6B4226", 0.85),
      );
      trunk.position.set(tx, 0.5, tz);
      trunk.castShadow = true;
      this.scene.add(trunk);
      const canopyColors = ["#2A7A1A", "#3A8A28", "#2E6E1E"];
      for (let c = 0; c < 3; c++) {
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.4 - c * 0.08, 8, 8),
          stdMat(canopyColors[c], 0.9),
        );
        canopy.position.set(tx + (c - 1) * 0.15, 1.0 + c * 0.15, tz + (c % 2) * 0.1);
        canopy.castShadow = true;
        this.scene.add(canopy);
      }
    };
    treePositions.forEach(([tx, tz]) => addTree(tx, tz));

    // ── Mailbox ──
    const mbX = fenceMaxX + 0.5;
    const mbZ = fenceMaxZ + 2.0;
    const mailPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), stdMat("#5A3A20"));
    mailPost.position.set(mbX, 0.3, mbZ);
    this.scene.add(mailPost);
    const mailBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.15), stdMat("#2244AA"));
    mailBox.position.set(mbX, 0.65, mbZ);
    this.scene.add(mailBox);
    const mailFlag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.06), stdMat("#CC2222"));
    mailFlag.position.set(mbX + 0.12, 0.68, mbZ);
    this.scene.add(mailFlag);

    // ── Attached Garage (right side of house, driveway leads into it) ──
    const garageW = 2.0;
    const garageD = houseD * 0.45;
    const garageX = houseMaxX + garageW / 2;
    const garageZ = houseMaxZ - garageD / 2;
    // Garage walls
    const garageMat = stdMat(palette.wall, 0.85);
    const garageBody = new THREE.Mesh(
      new THREE.BoxGeometry(garageW, 1.3, garageD),
      garageMat,
    );
    garageBody.position.set(garageX, 0.65, garageZ);
    garageBody.castShadow = true;
    this.scene.add(garageBody);
    // Garage roof (flat, slightly sloped look via layers)
    for (let r = 0; r < 3; r++) {
      const roofLayer = new THREE.Mesh(
        new THREE.BoxGeometry(garageW + 0.3 - r * 0.15, 0.06, garageD + 0.3 - r * 0.15),
        stdMat("#7A5A3A", 0.8),
      );
      roofLayer.position.set(garageX, 1.33 + r * 0.06, garageZ);
      this.scene.add(roofLayer);
    }
    // Garage door (front-facing, segmented panels)
    const garageDoorMat = stdMat("#A0907A", 0.75);
    const garageDoor = new THREE.Mesh(
      new THREE.BoxGeometry(garageW * 0.8, 1.0, 0.04),
      garageDoorMat,
    );
    garageDoor.position.set(garageX, 0.52, garageZ + garageD / 2 + 0.02);
    this.scene.add(garageDoor);
    // Garage door panel lines (horizontal segments)
    for (let i = 0; i < 4; i++) {
      const panelLine = new THREE.Mesh(
        new THREE.BoxGeometry(garageW * 0.78, 0.01, 0.01),
        stdMat("#8A7A6A"),
      );
      panelLine.position.set(garageX, 0.15 + i * 0.25, garageZ + garageD / 2 + 0.04);
      this.scene.add(panelLine);
    }
    // Garage door handle
    const garHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.025, 0.025),
      stdMat("#666666", 0.3),
    );
    garHandle.position.set(garageX, 0.45, garageZ + garageD / 2 + 0.05);
    this.scene.add(garHandle);
    // Extend driveway into garage
    const dwExtend = new THREE.Mesh(
      new THREE.BoxGeometry(garageW * 0.9, 0.02, garageD * 0.3),
      stdMat("#B0A898", 0.9),
    );
    dwExtend.position.set(garageX, 0.005, garageZ + garageD / 2 + garageD * 0.15);
    dwExtend.receiveShadow = true;
    this.scene.add(dwExtend);

    // ── Playhouse (back yard, left side) ──
    const phX = fenceMinX + 2.5;
    const phZ = fenceMinZ + 3.0;
    const phGroup = new THREE.Group();
    // Walls (colorful)
    const phBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.9, 1.0),
      stdMat("#E84040", 0.7),
    );
    phBody.position.y = 0.45;
    phGroup.add(phBody);
    // Peaked roof
    const phRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.5, 4),
      stdMat("#FFD700", 0.6),
    );
    phRoof.position.y = 1.15;
    phRoof.rotation.y = Math.PI / 4;
    phGroup.add(phRoof);
    // Door opening (dark cutout)
    const phDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.55, 0.04),
      stdMat("#3A1A1A", 0.9),
    );
    phDoor.position.set(0, 0.30, 0.51);
    phGroup.add(phDoor);
    // Window cutout (on side)
    const phWin = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.25, 0.25),
      new THREE.MeshStandardMaterial({
        color: "#88CCFF", roughness: 0.1, transparent: true, opacity: 0.5,
      }),
    );
    phWin.position.set(0.61, 0.50, 0);
    phGroup.add(phWin);
    // Window frame
    const phWinFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.28, 0.28),
      stdMat("#FFFFFF", 0.7),
    );
    phWinFrame.position.set(0.61, 0.50, 0);
    phGroup.add(phWinFrame);
    phGroup.position.set(phX, 0, phZ);
    phGroup.castShadow = true;
    this.scene.add(phGroup);

    // ── BBQ Grill (back yard, near house, right-center) ──
    const grillX = (houseMinX + houseMaxX) / 2 + 1.0;
    const grillZ = houseMinZ - 2.0;
    const grillGroup = new THREE.Group();
    // Grill body
    const grillBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.35, 0.4),
      stdMat("#2A2A2A", 0.8),
    );
    grillBody.position.y = 0.55;
    grillGroup.add(grillBody);
    // Grill lid (dome)
    const grillLid = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      stdMat("#1A1A1A", 0.7),
    );
    grillLid.position.set(0, 0.72, 0);
    grillGroup.add(grillLid);
    // Handle on lid
    const grillHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5),
      stdMat("#888888", 0.3),
    );
    grillHandle.rotation.x = Math.PI / 2;
    grillHandle.position.set(0, 0.78, 0.18);
    grillGroup.add(grillHandle);
    // 4 legs
    for (const [lx, lz] of [[-0.22, -0.14], [0.22, -0.14], [-0.22, 0.14], [0.22, 0.14]]) {
      const grillLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.38, 5),
        stdMat("#333333", 0.6),
      );
      grillLeg.position.set(lx, 0.19, lz);
      grillGroup.add(grillLeg);
    }
    // Shelf underneath
    const grillShelf = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.02, 0.3),
      stdMat("#444444", 0.7),
    );
    grillShelf.position.set(0, 0.25, 0);
    grillGroup.add(grillShelf);
    grillGroup.position.set(grillX, 0, grillZ);
    grillGroup.castShadow = true;
    this.scene.add(grillGroup);

    // ── Patio Table & Chairs (back yard, center) ──
    const patioX = (houseMinX + houseMaxX) / 2 - 1.0;
    const patioZ = houseMinZ - 3.5;
    const patioGroup = new THREE.Group();
    // Round table
    const patioPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, 0.45, 6),
      stdMat("#6A5A4A", 0.7),
    );
    patioPedestal.position.y = 0.23;
    patioGroup.add(patioPedestal);
    const patioTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.03, 12),
      stdMat("#8B7355", 0.65),
    );
    patioTop.position.y = 0.47;
    patioGroup.add(patioTop);
    // 4 chairs around table
    const chairAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    chairAngles.forEach((angle) => {
      const dist = 0.75;
      const cx2 = Math.cos(angle) * dist;
      const cz2 = Math.sin(angle) * dist;
      // Chair seat
      const cSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.02, 0.3),
        stdMat("#6A5A4A", 0.7),
      );
      cSeat.position.set(cx2, 0.30, cz2);
      patioGroup.add(cSeat);
      // Chair back
      const cBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.25, 0.02),
        stdMat("#6A5A4A", 0.7),
      );
      cBack.position.set(
        cx2 + Math.cos(angle) * 0.14,
        0.43,
        cz2 + Math.sin(angle) * 0.14,
      );
      cBack.rotation.y = -angle + Math.PI / 2;
      patioGroup.add(cBack);
      // Chair legs (2 visible)
      for (const offset of [-0.1, 0.1]) {
        const cLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.30, 4),
          stdMat("#5A4A3A", 0.7),
        );
        cLeg.position.set(cx2 + Math.cos(angle + Math.PI / 2) * offset, 0.15, cz2 + Math.sin(angle + Math.PI / 2) * offset);
        patioGroup.add(cLeg);
      }
    });
    patioGroup.position.set(patioX, 0, patioZ);
    patioGroup.castShadow = true;
    this.scene.add(patioGroup);

    // ── Helper: build a neighbor house ──
    const winGlassMat = new THREE.MeshStandardMaterial({
      color: "#A8D8EA", roughness: 0.1,
      emissive: "#88B8D8", emissiveIntensity: 0.15,
    });

    const buildNeighborHouse = (
      hx: number, hz: number, hw: number, hd: number,
      wallCol: string, roofCol: string, faceDir: "south" | "north",
    ) => {
      const g = new THREE.Group();
      // Body
      g.add((() => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(hw, wallH, hd), stdMat(wallCol, 0.85));
        b.position.y = wallH / 2;
        return b;
      })());
      // Stepped roof
      for (let r = 0; r < 4; r++) {
        const rl = new THREE.Mesh(
          new THREE.BoxGeometry(hw + 0.3 - r * 0.35, 0.12, hd + 0.4 - r * 0.5),
          stdMat(roofCol, 0.8),
        );
        rl.position.y = wallH + 0.06 + r * 0.12;
        g.add(rl);
      }
      // Front face
      const frontOff = faceDir === "south" ? hd / 2 + 0.01 : -hd / 2 - 0.01;
      // Door
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 0.03), stdMat("#5A3A20"));
      door.position.set(0, 0.35, frontOff);
      g.add(door);
      // Front windows
      const ws = hw * 0.25;
      for (const wx of [-ws, ws]) {
        const wf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.04), stdMat("#E8E0D0", 0.7));
        wf.position.set(wx, wallH * 0.55, frontOff);
        g.add(wf);
        const wg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.02), winGlassMat);
        wg.position.set(wx, wallH * 0.55, frontOff);
        g.add(wg);
      }
      // Side windows
      for (const sx of [-hw / 2 - 0.01, hw / 2 + 0.01]) {
        for (let i = 0; i < 2; i++) {
          const sw = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.3, 0.35),
            winGlassMat,
          );
          sw.position.set(sx, wallH * 0.55, -hd * 0.15 + i * hd * 0.35);
          g.add(sw);
        }
      }
      // Garage
      if (Math.random() > 0.4) {
        const gar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.03), stdMat("#A0907A", 0.8));
        gar.position.set(-ws * 1.5, 0.3, frontOff);
        g.add(gar);
      }
      g.position.set(hx, 0, hz);
      g.castShadow = true;
      this.scene.add(g);
    };

    // ── Helper: build a neighbor lot (fence + house + yard decor) ──
    const buildNeighborLot = (
      lotMinX: number, lotMinZ: number, lotMaxX: number, lotMaxZ: number,
      wallCol: string, roofCol: string, faceDir: "south" | "north",
    ) => {
      // Fence around the lot
      buildFenceRect(lotMinX, lotMinZ, lotMaxX, lotMaxZ, undefined, true);

      // House position within the lot
      const hw = Math.min(neighborHouseW, (lotMaxX - lotMinX) * 0.7);
      const hd = Math.min(neighborHouseD, (lotMaxZ - lotMinZ) * 0.4);
      const lotCenterX = (lotMinX + lotMaxX) / 2;
      // House sits closer to the front, leaving big back yard
      const houseZ = faceDir === "south"
        ? lotMaxZ - hd * 0.7  // closer to south fence (front)
        : lotMinZ + hd * 0.7; // closer to north fence (front)

      buildNeighborHouse(lotCenterX, houseZ, hw, hd, wallCol, roofCol, faceDir);

      // Driveway stub from house to front fence
      const dwFrontZ = faceDir === "south" ? lotMaxZ : lotMinZ;
      const dwLen = Math.abs(dwFrontZ - houseZ) + 0.5;
      const dwStub = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.02, dwLen),
        stdMat("#B0A898", 0.9),
      );
      dwStub.position.set(lotCenterX + hw * 0.3, 0.004, (dwFrontZ + houseZ) / 2);
      this.scene.add(dwStub);

      // Tree in the back yard
      const treeZ = faceDir === "south" ? lotMinZ + 1.5 : lotMaxZ - 1.5;
      addTree(lotMinX + 1.5, treeZ);
    };

    // ── Side neighbors (same side of road, facing south toward the front road) ──
    const houseColors: [string, string][] = [
      ["#D4C4A8", "#8B4A2A"], ["#E0D0B8", "#7A5A3A"],
      ["#C8B898", "#6A3A1A"], ["#DCC8A8", "#8A5A2A"],
    ];

    // Left neighbor
    {
      const lx1 = fenceMinX - (lotW + lotGap);
      const [wc, rc] = houseColors[0];
      buildNeighborLot(lx1, fenceMinZ, lx1 + lotW, fenceMaxZ, wc, rc, "south");
    }
    // Right neighbor
    {
      const rx1 = fenceMaxX + lotGap;
      const [wc, rc] = houseColors[1];
      buildNeighborLot(rx1, fenceMinZ, rx1 + lotW, fenceMaxZ, wc, rc, "south");
    }

    // ── Across-the-road houses (facing north toward the front road) ──
    const acrossLotMinZ = roadZ + 2.5;
    const acrossLotMaxZ = acrossLotMinZ + lotD;
    const acrossColors: [string, string][] = [
      ["#C0B8A0", "#6A3A1A"], ["#D8C8B0", "#7A4A2A"],
      ["#C8C0A8", "#5A4A2A"], ["#E0D0B0", "#8A4A1A"],
      ["#B8B0A0", "#6A4A3A"],
    ];
    // Houses across the road (3 lots)
    const acrossPositions = [
      fenceMinX - (lotW + lotGap),
      fenceMinX + (fenceMaxX - fenceMinX - lotW) / 2,
      fenceMaxX + lotGap,
    ];
    acrossPositions.forEach((ax, i) => {
      buildNeighborLot(ax, acrossLotMinZ, ax + lotW, acrossLotMaxZ, acrossColors[i][0], acrossColors[i][1], "north");
    });

    // ── Back-to-back houses (facing north, their back yards face player's back yard) ──
    // Shared back fence line
    const sharedFenceZ = fenceMinZ - 0.5;
    const backLotMinZ = sharedFenceZ - lotD;
    const backLotMaxZ = sharedFenceZ;

    // Back road (behind the back row of houses)
    const backRoadZ = backLotMinZ - 1.5;
    const backRoad = new THREE.Mesh(
      new THREE.BoxGeometry(roadW, 0.02, 3.0),
      stdMat("#3A3A3A", 0.95),
    );
    backRoad.position.set(roadCenterX, 0.003, backRoadZ);
    backRoad.receiveShadow = true;
    this.scene.add(backRoad);
    // Yellow dashes on back road
    for (let i = 0; i < 12; i++) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(roadW / 18, 0.015, 0.06),
        stdMat("#E8C840"),
      );
      dash.position.set(totalMinX + (i + 0.5) * roadW / 12, 0.025, backRoadZ);
      this.scene.add(dash);
    }
    // Back road sidewalks
    for (const sideOff of [-2.0, 2.0]) {
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(roadW + 2, 0.02, 0.8),
        stdMat("#C8C0B4", 0.85),
      );
      sw.position.set(roadCenterX, 0.006, backRoadZ + sideOff);
      sw.receiveShadow = true;
      this.scene.add(sw);
    }

    // Back neighbor lots (facing north toward the back road, 3 lots)
    const backColors: [string, string][] = [
      ["#C8C0B0", "#6A4A2A"], ["#D0C4B4", "#7A5A3A"],
      ["#DCD0C0", "#8A5A2A"],
    ];
    acrossPositions.forEach((bx, i) => {
      buildNeighborLot(bx, backLotMinZ, bx + lotW, backLotMaxZ, backColors[i][0], backColors[i][1], "north");
    });

    // Shared back fence (wooden, taller than picket fence)
    const sharedFenceLen = totalMaxX - totalMinX + 4;
    const sharedFence = new THREE.Mesh(
      new THREE.BoxGeometry(sharedFenceLen, 0.45, 0.08),
      stdMat("#8B7355", 0.8),
    );
    sharedFence.position.set(roadCenterX, 0.225, sharedFenceZ);
    this.scene.add(sharedFence);
    for (let x = totalMinX - 2; x <= totalMaxX + 2; x += 2.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), stdMat("#6B5335", 0.8));
      post.position.set(x, 0.25, sharedFenceZ);
      this.scene.add(post);
    }

    // ── People walking on sidewalks (animated) ──
    const walkMinX = totalMinX - 4;
    const walkMaxX = totalMaxX + 4;
    const personDefs: [number, number, string, number][] = [
      [fenceMinX - 1, roadZ - 2.0, "#3A5A8A", 0.4],
      [fenceMinX + 3, roadZ + 2.0, "#8A3A5A", -0.35],
      [fenceMaxX + 1, roadZ - 2.0, "#5A8A3A", 0.3],
      [fenceMinX - 2, backRoadZ - 2.0, "#5A3A8A", -0.3],
      [fenceMaxX + 2, backRoadZ + 2.0, "#8A5A3A", 0.35],
    ];
    personDefs.forEach(([px, pz, col, speed]) => {
      const personGroup = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.35, 6),
        stdMat(col),
      );
      body.position.y = 0.3;
      personGroup.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 7, 7),
        stdMat("#E8C8A8"),
      );
      head.position.y = 0.55;
      personGroup.add(head);
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
      if (speed < 0) personGroup.rotation.y = Math.PI;
      personGroup.castShadow = true;
      this.scene.add(personGroup);
      this.outdoorPeople.push({
        group: personGroup, minX: walkMinX, maxX: walkMaxX,
        speed, dir: speed > 0 ? 1 : -1,
        leftLeg: legs[0], rightLeg: legs[1],
      });
    });

    // ── Cars (parked + driving on both roads) ──
    const driveMinX = totalMinX - 6;
    const driveMaxX = totalMaxX + 6;
    const buildCar = (cx: number, cz: number, bodyCol: string, windowCol: string): THREE.Group => {
      const carGroup = new THREE.Group();
      const carBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.45), stdMat(bodyCol, 0.5));
      carBody.position.y = 0.18;
      carGroup.add(carBody);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.4), stdMat(bodyCol, 0.5));
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

    // [startX, z, bodyCol, windowCol, speed]
    const carDefs: [number, number, string, string, number][] = [
      // Parked on player's driveway
      [dwX, fenceMaxZ + 1, "#4A6A8A", "#C0D0E0", 0],
      // Front road traffic
      [fenceMinX - 2, roadZ - 0.3, "#8A2A2A", "#B8C8D8", 1.8],
      [fenceMaxX + 3, roadZ + 0.3, "#2A5A2A", "#C0D0D0", -1.5],
      // Back road traffic
      [fenceMinX + 4, backRoadZ - 0.3, "#5A2A6A", "#C8C0D8", 1.4],
      [fenceMaxX - 1, backRoadZ + 0.3, "#6A5A2A", "#D0D0C0", -1.6],
    ];
    carDefs.forEach(([cx, cz, bodyCol, windowCol, speed]) => {
      const carGroup = buildCar(cx, cz, bodyCol, windowCol);
      if (speed < 0) carGroup.rotation.y = Math.PI;
      if (speed !== 0) {
        this.outdoorCars.push({
          group: carGroup, minX: driveMinX, maxX: driveMaxX,
          speed, dir: speed > 0 ? 1 : -1,
        });
      }
    });
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
    const baseMatTransparent = new THREE.MeshStandardMaterial({
      color: baseColor, roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false,
    });

    // Split dimensions: wall total height = 1.5
    const bottomH = 0.5;
    const topH = 1.0;

    // Build set of interior wall positions for single-panel rendering
    const interiorWallSet = new Set<string>();
    (lvl.interiorWalls ?? []).forEach(([x, z]) => interiorWallSet.add(`${x},${z}`));

    // Build set of window wall positions
    const windowWallSet = new Set<string>();
    (lvl.windowWalls ?? []).forEach(([x, z]) => windowWallSet.add(`${x},${z}`));

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

        // --- Window wall: render window instead of solid panel ---
        if (windowWallSet.has(wallKey)) {
          const pw = 0.92 * TS;  // panel width
          const wh = 1.5;        // total wall height
          const sillY = 0.3;     // sill height from floor
          const winH = 0.85;     // window pane height
          const winW = pw * 0.78; // window pane width
          const frameD = 0.04;   // frame depth (slightly in front of wall)
          const cx3 = wx3 + ox;
          const cz3 = wz3 + oz;
          const transparent = hidesAnyTile;

          // Wall below the window (kick panel)
          const kickMat = transparent ? wallMatBottom : wallMatOpaque;
          const kick = new THREE.Mesh(new THREE.BoxGeometry(pw, sillY, 0.06), kickMat);
          kick.position.set(cx3, TILE_H + sillY / 2, cz3);
          kick.rotation.y = rotY;
          if (transparent) kick.renderOrder = 1;
          this.scene.add(kick);

          // Wall above the window (header)
          const headerH = wh - sillY - winH;
          const headerMat = transparent ? wallMatTop : wallMatOpaque;
          const header = new THREE.Mesh(new THREE.BoxGeometry(pw, headerH, 0.06), headerMat);
          header.position.set(cx3, TILE_H + sillY + winH + headerH / 2, cz3);
          header.rotation.y = rotY;
          if (transparent) header.renderOrder = 1;
          this.scene.add(header);

          // Wall strips on left and right of window
          const stripW = (pw - winW) / 2;
          for (const side of [-1, 1]) {
            const strip = new THREE.Mesh(
              new THREE.BoxGeometry(stripW, winH, 0.06),
              transparent ? wallMatBottom : wallMatOpaque,
            );
            strip.position.set(cx3, TILE_H + sillY + winH / 2, cz3);
            strip.rotation.y = rotY;
            // Offset along the panel's local X axis
            const localOff = side * (winW / 2 + stripW / 2);
            strip.translateX(localOff);
            if (transparent) strip.renderOrder = 1;
            this.scene.add(strip);
          }

          // Glass pane
          const glassMat = new THREE.MeshStandardMaterial({
            color: "#B8D8F0", roughness: 0.1, metalness: 0.05,
            transparent: true, opacity: 0.35, depthWrite: false,
          });
          const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.01), glassMat);
          glass.position.set(cx3, TILE_H + sillY + winH / 2, cz3);
          glass.rotation.y = rotY;
          glass.renderOrder = 2;
          this.scene.add(glass);

          // Window frame (4 pieces around the glass)
          const frameMat = new THREE.MeshStandardMaterial({ color: "#FAFAFA", roughness: 0.6 });
          const frameT = 0.018; // frame thickness
          // Top frame
          const ft = new THREE.Mesh(new THREE.BoxGeometry(winW + frameT * 2, frameT, frameD), frameMat);
          ft.position.set(cx3, TILE_H + sillY + winH + frameT / 2, cz3);
          ft.rotation.y = rotY;
          ft.translateZ(-0.02);
          this.scene.add(ft);
          // Bottom frame (sill)
          const sillMat = new THREE.MeshStandardMaterial({ color: "#F0F0F0", roughness: 0.5 });
          const fb = new THREE.Mesh(new THREE.BoxGeometry(winW + frameT * 2, frameT * 1.5, frameD * 2), sillMat);
          fb.position.set(cx3, TILE_H + sillY - frameT / 2, cz3);
          fb.rotation.y = rotY;
          fb.translateZ(-0.03);
          this.scene.add(fb);
          // Left frame
          const fl = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, frameD), frameMat);
          fl.position.set(cx3, TILE_H + sillY + winH / 2, cz3);
          fl.rotation.y = rotY;
          fl.translateX(-winW / 2 - frameT / 2);
          fl.translateZ(-0.02);
          this.scene.add(fl);
          // Right frame
          const fr = new THREE.Mesh(new THREE.BoxGeometry(frameT, winH, frameD), frameMat);
          fr.position.set(cx3, TILE_H + sillY + winH / 2, cz3);
          fr.rotation.y = rotY;
          fr.translateX(winW / 2 + frameT / 2);
          fr.translateZ(-0.02);
          this.scene.add(fr);

          // Cross/mullion pattern — vertical bar + horizontal bar
          const mullionMat = new THREE.MeshStandardMaterial({ color: "#F5F5F5", roughness: 0.6 });
          const mullionT = 0.012;
          // Vertical mullion
          const mv = new THREE.Mesh(new THREE.BoxGeometry(mullionT, winH, frameD * 0.7), mullionMat);
          mv.position.set(cx3, TILE_H + sillY + winH / 2, cz3);
          mv.rotation.y = rotY;
          mv.translateZ(-0.025);
          this.scene.add(mv);
          // Horizontal mullion
          const mh = new THREE.Mesh(new THREE.BoxGeometry(winW, mullionT, frameD * 0.7), mullionMat);
          mh.position.set(cx3, TILE_H + sillY + winH * 0.55, cz3);
          mh.rotation.y = rotY;
          mh.translateZ(-0.025);
          this.scene.add(mh);

          // Blinds — horizontal slats covering top ~55% of window
          const blindsMat = new THREE.MeshStandardMaterial({
            color: "#F0EDE8", roughness: 0.7,
            transparent: true, opacity: 0.85, depthWrite: false,
          });
          const blindCount = 10;
          const blindZoneH = winH * 0.55;
          const blindStartY = TILE_H + sillY + winH - blindZoneH;
          for (let bi = 0; bi < blindCount; bi++) {
            const by = blindStartY + (bi + 0.5) * (blindZoneH / blindCount);
            const blind = new THREE.Mesh(
              new THREE.BoxGeometry(winW * 0.96, 0.012, 0.015),
              blindsMat,
            );
            blind.position.set(cx3, by, cz3);
            blind.rotation.y = rotY;
            blind.translateZ(-0.035);
            blind.renderOrder = 3;
            this.scene.add(blind);
          }
          // Valance/header bar at top of blinds
          const valance = new THREE.Mesh(
            new THREE.BoxGeometry(winW * 1.02, 0.04, 0.03),
            new THREE.MeshStandardMaterial({ color: "#E8E0D5", roughness: 0.6 }),
          );
          valance.position.set(cx3, TILE_H + sillY + winH + 0.01, cz3);
          valance.rotation.y = rotY;
          valance.translateZ(-0.04);
          this.scene.add(valance);

          // Baseboard
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(pw, 0.06, 0.07),
            baseMat,
          );
          base.position.set(cx3, TILE_H + 0.03, cz3);
          base.rotation.y = rotY;
          this.scene.add(base);

          continue;
        }

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

          // Baseboard
          const baseT = new THREE.Mesh(
            new THREE.BoxGeometry(0.92 * TS, 0.06, 0.07),
            baseMatTransparent,
          );
          baseT.position.set(wx3 + ox, TILE_H + 0.03, wz3 + oz);
          baseT.rotation.y = rotY;
          baseT.renderOrder = 1;
          this.scene.add(baseT);

          // Crown molding
          const crownT = new THREE.Mesh(
            new THREE.BoxGeometry(0.94 * TS, 0.04, 0.08),
            baseMatTransparent,
          );
          crownT.position.set(wx3 + ox, TILE_H + 1.48, wz3 + oz);
          crownT.rotation.y = rotY;
          crownT.renderOrder = 1;
          this.scene.add(crownT);

          // Picture frames on transparent walls too
          artCounter++;
          if (artCounter % 3 === 0) {
            const fColor = "#4A2820";
            const cColor = artColors[(artCounter / 3 | 0) % artColors.length];
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(0.3 * TS, 0.25, 0.03),
              new THREE.MeshStandardMaterial({ color: fColor, roughness: 0.7, transparent: true, opacity: 0.55 }),
            );
            frame.position.set(wx3 + ox * 0.85, TILE_H + 0.8, wz3 + oz * 0.85);
            frame.rotation.y = rotY;
            frame.renderOrder = 2;
            this.scene.add(frame);
            const canvas = new THREE.Mesh(
              new THREE.BoxGeometry(0.24 * TS, 0.19, 0.02),
              new THREE.MeshStandardMaterial({ color: cColor, roughness: 0.5, transparent: true, opacity: 0.55 }),
            );
            canvas.position.set(wx3 + ox * 0.83, TILE_H + 0.8, wz3 + oz * 0.83);
            canvas.rotation.y = rotY;
            canvas.renderOrder = 2;
            this.scene.add(canvas);
          }
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

          // Picture frames every 3 opaque panels
          artCounter++;
          if (artCounter % 3 === 0) {
            const fColor = "#4A2820";
            const cColor = artColors[(artCounter / 3 | 0) % artColors.length];
            const frame = new THREE.Mesh(
              new THREE.BoxGeometry(0.3 * TS, 0.25, 0.03),
              new THREE.MeshStandardMaterial({ color: fColor, roughness: 0.7 }),
            );
            frame.position.set(wx3 + ox * 0.85, TILE_H + 0.8, wz3 + oz * 0.85);
            frame.rotation.y = rotY;
            this.scene.add(frame);
            const canvas = new THREE.Mesh(
              new THREE.BoxGeometry(0.24 * TS, 0.19, 0.02),
              new THREE.MeshStandardMaterial({ color: cColor, roughness: 0.5 }),
            );
            canvas.position.set(wx3 + ox * 0.83, TILE_H + 0.8, wz3 + oz * 0.83);
            canvas.rotation.y = rotY;
            this.scene.add(canvas);
            const hl = new THREE.Mesh(
              new THREE.BoxGeometry(0.06 * TS, 0.04, 0.005),
              new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.3, transparent: true, opacity: 0.3 }),
            );
            hl.position.set(wx3 + ox * 0.82, TILE_H + 0.85, wz3 + oz * 0.82);
            hl.rotation.y = rotY;
            this.scene.add(hl);
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

      if (f.rot) g.rotation.y = f.rot;

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
        // Dresser body (thin depth)
        const dDepth = Math.min(th, 0.3);
        add(new THREE.BoxGeometry(tw, 0.35, dDepth), std(f.col, 0.7), 0.18);
        // Top surface
        add(new THREE.BoxGeometry(tw + 0.04, 0.04, dDepth + 0.04), std("#D0C8B8", 0.4), 0.37);
        // TV screen sitting on top — tall like a real TV (3× height)
        const tvBody = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.8, 0.84, 0.06), std("#111", 0.3, 0.3));
        tvBody.position.set(0, 0.84, 0);
        tvBody.castShadow = true;
        g.add(tvBody);
        // Emissive screen face
        const scFace = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.7, 0.72, 0.01),
          new THREE.MeshStandardMaterial({ color: "#0A0A2A", emissive: "#050510", emissiveIntensity: 0.5 }),
        );
        scFace.position.set(0, 0.84, 0.035);
        g.add(scFace);
        // Drawer lines
        for (let i = 0; i < 2; i++) {
          add(new THREE.BoxGeometry(tw + 0.01, 0.01, dDepth + 0.01), std("#5A3A10", 0.8), 0.1 + i * 0.13);
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
        // Door spanning the doorway — use the longer dimension as visual width
        const dw = Math.max(tw, th);
        const doorTrimMat = std("#D0C4B0", 0.7);
        const doorPanelMat = std("#8B6F5C", 0.75);
        // Rotate entire door group so it spans along z (the doorway axis)
        const doorRoot = new THREE.Group();
        if (th > tw) doorRoot.rotation.y = Math.PI / 2;
        // Crown molding header
        const crownHeader = new THREE.Mesh(
          new THREE.BoxGeometry(dw * 1.0, 0.06, 0.12),
          doorTrimMat,
        );
        crownHeader.position.set(0, 0.90, 0);
        doorRoot.add(crownHeader);
        // Trim strip below crown
        const trimStrip = new THREE.Mesh(
          new THREE.BoxGeometry(dw * 0.96, 0.03, 0.10),
          doorTrimMat,
        );
        trimStrip.position.set(0, 0.86, 0);
        doorRoot.add(trimStrip);
        // Side trim (vertical casing)
        const sideTrimGeo = new THREE.BoxGeometry(0.035, 0.86, 0.09);
        const leftTrim = new THREE.Mesh(sideTrimGeo, doorTrimMat);
        leftTrim.position.set(-dw * 0.47, 0.43, 0);
        doorRoot.add(leftTrim);
        const rightTrim = new THREE.Mesh(sideTrimGeo, doorTrimMat);
        rightTrim.position.set(dw * 0.47, 0.43, 0);
        doorRoot.add(rightTrim);
        // Door panel (slightly ajar)
        const doorPanel = new THREE.Mesh(
          new THREE.BoxGeometry(dw * 0.88, 0.82, 0.035),
          doorPanelMat,
        );
        const doorGroup = new THREE.Group();
        doorPanel.position.x = -dw * 0.44;
        doorGroup.add(doorPanel);
        doorGroup.position.set(dw * 0.44, 0.42, 0);
        doorGroup.rotation.y = 0.45; // slightly open
        doorRoot.add(doorGroup);
        // Door knob
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 6, 6),
          std("#C0A040", 0.3, 0.4),
        );
        knob.position.set(-dw * 0.72, 0.42, 0.03);
        doorGroup.add(knob);
        // Transom wall above door — fill gap between door top and ceiling (wall height 1.5)
        const transomH = 1.5 - 0.93; // wall top minus door crown top
        const transomMat = new THREE.MeshStandardMaterial({
          color: _palette.wall, roughness: 0.85,
          transparent: true, opacity: 0.45, depthWrite: false,
        });
        const transom = new THREE.Mesh(
          new THREE.BoxGeometry(dw * 1.02, transomH, 0.06),
          transomMat,
        );
        transom.position.set(0, 0.93 + transomH / 2, 0);
        transom.renderOrder = 1;
        doorRoot.add(transom);
        // Crown molding at ceiling level above transom
        const transomCrown = new THREE.Mesh(
          new THREE.BoxGeometry(dw * 1.04, 0.04, 0.08),
          new THREE.MeshStandardMaterial({
            color: _palette.baseboard, roughness: 0.9,
            transparent: true, opacity: 0.5, depthWrite: false,
          }),
        );
        transomCrown.position.set(0, 1.48, 0);
        transomCrown.renderOrder = 1;
        doorRoot.add(transomCrown);
        g.add(doorRoot);
        break;
      }
      case "fireplace": {
        // Brick surround
        const brickMat = std("#8B4513", 0.85);
        // Back wall of fireplace
        add(new THREE.BoxGeometry(tw * 0.95, 0.85, 0.08), brickMat, 0.43);
        // Left pillar
        const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, th * 0.6), brickMat);
        pillarL.position.set(-tw * 0.42, 0.43, th * 0.15);
        pillarL.castShadow = true; g.add(pillarL);
        // Right pillar
        const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, th * 0.6), brickMat);
        pillarR.position.set(tw * 0.42, 0.43, th * 0.15);
        pillarR.castShadow = true; g.add(pillarR);
        // Mantle shelf
        const mantle = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 1.05, 0.05, th * 0.7),
          std("#5A3A20", 0.6),
        );
        mantle.position.set(0, 0.88, th * 0.1);
        mantle.castShadow = true; g.add(mantle);
        // Firebox opening (dark)
        const firebox = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.55, 0.5, 0.04),
          new THREE.MeshStandardMaterial({ color: "#1A0A0A", roughness: 0.95 }),
        );
        firebox.position.set(0, 0.30, th * 0.22);
        g.add(firebox);
        // Glowing embers
        const emberMat = new THREE.MeshStandardMaterial({
          color: "#FF4500", emissive: "#FF4500", emissiveIntensity: 0.8,
          roughness: 0.9,
        });
        for (let i = 0; i < 5; i++) {
          const ember = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.02, 5, 5), emberMat);
          ember.position.set(
            -0.1 + Math.random() * 0.2,
            0.08 + Math.random() * 0.04,
            th * 0.2,
          );
          g.add(ember);
        }
        // Flame wisps (small orange/yellow triangles)
        const flameMat = new THREE.MeshStandardMaterial({
          color: "#FF8C00", emissive: "#FF6600", emissiveIntensity: 0.6,
          transparent: true, opacity: 0.7,
        });
        for (let i = 0; i < 3; i++) {
          const flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.12 + Math.random() * 0.08, 4),
            flameMat,
          );
          flame.position.set(-0.06 + i * 0.06, 0.18, th * 0.2);
          g.add(flame);
        }
        // Hearth base
        add(new THREE.BoxGeometry(tw * 1.05, 0.04, th * 0.7), brickMat, 0.02);
        break;
      }
      case "toilet": {
        const porcelain = std("#F0F0F0", 0.3);
        // Bowl base
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.10, 0.25, 8),
          porcelain,
        );
        bowl.position.set(0, 0.13, 0.08);
        bowl.castShadow = true; g.add(bowl);
        // Bowl rim (torus)
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.11, 0.02, 6, 12),
          porcelain,
        );
        rim.rotation.x = -Math.PI / 2;
        rim.position.set(0, 0.26, 0.08);
        g.add(rim);
        // Seat
        const seat = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12),
          std("#EEEEEE", 0.4),
        );
        seat.position.set(0, 0.27, 0.08);
        g.add(seat);
        // Tank
        const tank = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.30, 0.12),
          porcelain,
        );
        tank.position.set(0, 0.28, -0.10);
        tank.castShadow = true; g.add(tank);
        // Tank lid
        const tankLid = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.025, 0.14),
          std("#E8E8E8", 0.3),
        );
        tankLid.position.set(0, 0.44, -0.10);
        g.add(tankLid);
        // Flush handle
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4),
          std("#C0C0C0", 0.2, 0.5),
        );
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.14, 0.40, -0.10);
        g.add(handle);
        break;
      }
      case "vanity": {
        // Cabinet base
        const cabinetMat = std(f.col || "#6A5A4A", 0.7);
        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.9, 0.45, th * 0.7),
          cabinetMat,
        );
        cab.position.set(0, 0.23, 0);
        cab.castShadow = true; g.add(cab);
        // Cabinet doors (lines)
        const lineMat = std("#5A4A3A", 0.8);
        const doorLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.35, th * 0.65),
          lineMat,
        );
        doorLine.position.set(0, 0.22, 0.01);
        g.add(doorLine);
        // Drawer knobs
        for (const kx of [-0.12, 0.12]) {
          const knobV = new THREE.Mesh(
            new THREE.SphereGeometry(0.015, 5, 5),
            std("#C0A060", 0.3, 0.4),
          );
          knobV.position.set(kx, 0.22, th * 0.36);
          g.add(knobV);
        }
        // White countertop
        const counterTop = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.95, 0.04, th * 0.75),
          std("#F0F0F0", 0.3),
        );
        counterTop.position.set(0, 0.47, 0);
        counterTop.castShadow = true; g.add(counterTop);
        // Basin (inset oval)
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.10, 0.08, 0.04, 12),
          std("#E0E8F0", 0.2),
        );
        basin.position.set(0, 0.46, 0.05);
        g.add(basin);
        // Faucet
        const faucetBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6),
          std("#C0C0C0", 0.15, 0.5),
        );
        faucetBase.position.set(0, 0.54, -0.06);
        g.add(faucetBase);
        const spout = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4),
          std("#C0C0C0", 0.15, 0.5),
        );
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, 0.60, -0.02);
        g.add(spout);
        // Mirror above (wall-mounted)
        const mirrorFrame = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.6, 0.4, 0.03),
          std("#4A2820", 0.6),
        );
        mirrorFrame.position.set(0, 0.88, -th * 0.3);
        g.add(mirrorFrame);
        const mirrorGlass = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.55, 0.36, 0.01),
          new THREE.MeshStandardMaterial({
            color: "#C8D8E8", roughness: 0.05, metalness: 0.3,
          }),
        );
        mirrorGlass.position.set(0, 0.88, -th * 0.28);
        g.add(mirrorGlass);
        break;
      }
      case "roundGlassTable": {
        // Pedestal base
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 0.35, 8),
          std("#888888", 0.3, 0.3),
        );
        pedestal.position.set(0, 0.18, 0);
        pedestal.castShadow = true; g.add(pedestal);
        // Glass top (transparent circle)
        const glassTop = new THREE.Mesh(
          new THREE.CylinderGeometry(tw * 0.42, tw * 0.42, 0.02, 16),
          new THREE.MeshStandardMaterial({
            color: "#C8E8F0", roughness: 0.05, metalness: 0.1,
            transparent: true, opacity: 0.4,
          }),
        );
        glassTop.position.set(0, 0.37, 0);
        g.add(glassTop);
        // Small decorative item on top (coaster + glass)
        const coaster = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.005, 8),
          std("#5A3A20", 0.8),
        );
        coaster.position.set(0.05, 0.385, 0.03);
        g.add(coaster);
        break;
      }
      case "diningChair": {
        const chairMat = std(f.col || "#6B4226", 0.7);
        // Seat
        const chairSeat = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.7, 0.03, th * 0.7),
          chairMat,
        );
        chairSeat.position.set(0, 0.28, 0);
        chairSeat.castShadow = true; g.add(chairSeat);
        // 4 legs
        const legH = 0.27;
        const lGeo = new THREE.CylinderGeometry(0.015, 0.015, legH, 4);
        for (const [lx, lz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
          const cLeg = new THREE.Mesh(lGeo, chairMat);
          cLeg.position.set(lx, legH / 2, lz);
          cLeg.castShadow = true; g.add(cLeg);
        }
        // Backrest
        const backrest = new THREE.Mesh(
          new THREE.BoxGeometry(tw * 0.65, 0.28, 0.025),
          chairMat,
        );
        backrest.position.set(0, 0.43, -th * 0.32);
        backrest.rotation.x = 0.05; // slight lean
        backrest.castShadow = true; g.add(backrest);
        break;
      }
      case "diningTable": {
        const dtCol = f.col;
        // Thick tabletop
        add(new THREE.BoxGeometry(tw + 0.06, 0.07, th + 0.06), std(dtCol, 0.55), 0.46);
        // Apron (skirt) under tabletop
        const apronMat = std(dtCol, 0.65);
        // Long sides
        const apronLong = new THREE.BoxGeometry(tw - 0.08, 0.06, 0.03);
        const aF = new THREE.Mesh(apronLong, apronMat);
        aF.position.set(0, 0.40, -th / 2 + 0.06); aF.castShadow = true; g.add(aF);
        const aB = new THREE.Mesh(apronLong, apronMat);
        aB.position.set(0, 0.40, th / 2 - 0.06); aB.castShadow = true; g.add(aB);
        // Short sides
        const apronShort = new THREE.BoxGeometry(0.03, 0.06, th - 0.08);
        const aL = new THREE.Mesh(apronShort, apronMat);
        aL.position.set(-tw / 2 + 0.06, 0.40, 0); aL.castShadow = true; g.add(aL);
        const aR = new THREE.Mesh(apronShort, apronMat);
        aR.position.set(tw / 2 - 0.06, 0.40, 0); aR.castShadow = true; g.add(aR);
        // 4 turned legs
        const dtLegH = 0.37;
        const dtLegGeo = new THREE.CylinderGeometry(0.03, 0.025, dtLegH, 6);
        const dtLegMat = std(dtCol, 0.7);
        for (const [lx, lz] of [
          [-tw / 2 + 0.07, -th / 2 + 0.07],
          [ tw / 2 - 0.07, -th / 2 + 0.07],
          [-tw / 2 + 0.07,  th / 2 - 0.07],
          [ tw / 2 - 0.07,  th / 2 - 0.07],
        ]) {
          const dtLeg = new THREE.Mesh(dtLegGeo, dtLegMat);
          dtLeg.position.set(lx, dtLegH / 2, lz);
          dtLeg.castShadow = true; g.add(dtLeg);
        }
        break;
      }
      case "credenza": {
        const crCol = f.col;
        const crWood = std(crCol, 0.65);
        // Main body — low & wide
        add(new THREE.BoxGeometry(tw, 0.40, th), crWood, 0.24);
        // Top surface
        add(new THREE.BoxGeometry(tw + 0.02, 0.03, th + 0.02), std(crCol, 0.5), 0.455);
        // Two door panels on front face
        const doorW = (tw - 0.08) / 2;
        const crDoorMat = std("#5A3018", 0.7);
        for (const dx of [-doorW / 2 - 0.01, doorW / 2 + 0.01]) {
          const crDoor = new THREE.Mesh(
            new THREE.BoxGeometry(doorW - 0.02, 0.30, 0.015), crDoorMat,
          );
          crDoor.position.set(dx, 0.22, -th / 2 - 0.005);
          crDoor.castShadow = true; g.add(crDoor);
        }
        // Door knobs
        const crKnobMat = std("#C0A040", 0.3, 0.4);
        for (const dx of [-0.04, 0.04]) {
          const crKnob = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 5, 5), crKnobMat,
          );
          crKnob.position.set(dx, 0.24, -th / 2 - 0.02);
          g.add(crKnob);
        }
        // Short tapered legs
        const crLegH = 0.04;
        const crLegGeo = new THREE.BoxGeometry(0.04, crLegH, 0.04);
        const crLegMat = std(crCol, 0.7);
        for (const [lx, lz] of [
          [-tw / 2 + 0.05, -th / 2 + 0.04],
          [ tw / 2 - 0.05, -th / 2 + 0.04],
          [-tw / 2 + 0.05,  th / 2 - 0.04],
          [ tw / 2 - 0.05,  th / 2 - 0.04],
        ]) {
          const crLeg = new THREE.Mesh(crLegGeo, crLegMat);
          crLeg.position.set(lx, crLegH / 2, lz);
          crLeg.castShadow = true; g.add(crLeg);
        }
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

    // Legs — each is a group (pivot at hip) with thigh + knee-pivot + calf + shoe
    const legMat = new THREE.MeshToonMaterial({ color: outfit.pantsColor });
    const shoeMat = new THREE.MeshToonMaterial({ color: "#3A2A1A" });

    const buildLeg = (xOff: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xOff, 0.30, 0);
      // Thigh
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.15, 6), legMat);
      thigh.position.y = -0.075;
      thigh.castShadow = true;
      legGroup.add(thigh);
      // Knee pivot (calf + shoe hang from here)
      const knee = new THREE.Group();
      knee.position.y = -0.15;
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.15, 6), legMat);
      calf.position.y = -0.075;
      calf.castShadow = true;
      knee.add(calf);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.09), shoeMat);
      shoe.position.set(0, -0.14, 0.01);
      knee.add(shoe);
      legGroup.add(knee);
      g.add(legGroup);
      return { legGroup, knee };
    };

    const leftResult = buildLeg(-0.07);
    this.momLeftLeg = leftResult.legGroup;
    this.momLeftCalf = leftResult.knee;

    const rightResult = buildLeg(0.07);
    this.momRightLeg = rightResult.legGroup;
    this.momRightCalf = rightResult.knee;

    // Hips / waist connector
    addMesh(new THREE.CylinderGeometry(0.13, 0.14, 0.12, 8), outfit.pantsColor, 0.36);
    this.momLower = leftResult.legGroup; // keep for backward compat

    // Top — shape varies
    let headY = 0.92;
    let shoulderY = 0.7;
    switch (outfit.topStyle) {
      case "fitted":
        addMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8), outfit.topColor, 0.57);
        headY = 0.85; shoulderY = 0.65; break;
      case "oversized":
        addMesh(new THREE.CylinderGeometry(0.16, 0.14, 0.35, 8), outfit.topColor, 0.60);
        headY = 0.90; shoulderY = 0.70; break;
      case "robe":
        addMesh(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 8), outfit.topColor, 0.63);
        headY = 0.95; shoulderY = 0.75; break;
      case "nightgown":
        addMesh(new THREE.CylinderGeometry(0.14, 0.13, 0.3, 8), outfit.topColor, 0.57);
        addMesh(new THREE.CylinderGeometry(0.15, 0.18, 0.15, 8), outfit.topColor, 0.38); // skirt over legs
        headY = 0.85; shoulderY = 0.65; break;
    }

    // Arms (cylinders hanging from shoulders, pivoting)
    const armMat = new THREE.MeshToonMaterial({ color: outfit.topColor });
    const skinMat = new THREE.MeshToonMaterial({ color: "#F5D0B0" });

    const leftArm = new THREE.Group();
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 5), armMat);
    upperArmL.position.y = -0.1;
    leftArm.add(upperArmL);
    const foreArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.12, 5), skinMat);
    foreArmL.position.y = -0.22;
    leftArm.add(foreArmL);
    leftArm.position.set(-0.17, shoulderY, 0);
    leftArm.castShadow = true;
    g.add(leftArm);
    this.momLeftArm = leftArm;

    const rightArm = new THREE.Group();
    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 5), armMat);
    upperArmR.position.y = -0.1;
    rightArm.add(upperArmR);
    const foreArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.12, 5), skinMat);
    foreArmR.position.y = -0.22;
    rightArm.add(foreArmR);
    rightArm.position.set(0.17, shoulderY, 0);
    rightArm.castShadow = true;
    g.add(rightArm);
    this.momRightArm = rightArm;

    // Head
    const head = addMesh(new THREE.SphereGeometry(0.13, 8, 8), "#F5D0B0", headY);
    this.momHead = head;

    // Eyes — children of head so they move with head bob
    const eyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeL.position.set(-0.045, 0.02, 0.11);
    head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
    eyeR.position.set(0.045, 0.02, 0.11);
    head.add(eyeR);

    // Hair — children of head so they move with head bob
    const hairMat = new THREE.MeshToonMaterial({ color: "#4A2820" });
    switch (outfit.hair) {
      case "ponytail": {
        // Hair cap covering top of head
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 6), hairMat);
        cap.scale.y = 0.6;
        cap.position.set(0, 0.07, 0.0);
        head.add(cap);
        // Tie point at back of head
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), hairMat);
        bun.position.set(0, -0.02, -0.12);
        head.add(bun);
        // Ponytail hanging down
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.3, 5), hairMat);
        tail.position.set(0, -0.17, -0.14);
        tail.rotation.x = 0.3;
        head.add(tail);
        break;
      }
      case "messyBun": {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), hairMat);
        bun.position.set(0, 0.1, 0);
        head.add(bun);
        const w1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), hairMat);
        w1.position.set(-0.12, 0.04, 0);
        head.add(w1);
        const w2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), hairMat);
        w2.position.set(0.12, 0.04, 0.04);
        head.add(w2);
        break;
      }
      case "down": {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 4), hairMat);
        cap.scale.y = 0.5;
        cap.position.set(0, 0.06, -0.02);
        head.add(cap);
        // Back drape (longest)
        const drapeBack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.3, 5), hairMat);
        drapeBack.position.set(0, -0.12, -0.1);
        drapeBack.rotation.x = 0.2;
        head.add(drapeBack);
        // Side drapes
        const drapeL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.28, 4), hairMat);
        drapeL.position.set(-0.12, -0.12, -0.04);
        drapeL.rotation.z = 0.2;
        head.add(drapeL);
        const drapeR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.28, 4), hairMat);
        drapeR.position.set(0.12, -0.12, -0.04);
        drapeR.rotation.z = -0.2;
        head.add(drapeR);
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

      // Bone thought bubble (child of group so it moves with dog)
      const dogTbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const dogTbGroup = new THREE.Group();
      dogTbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), dogTbMat));
      // Stem dots trailing down toward dog's head (head at local 0.25, 0.14, 0)
      const dogDot1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dogTbMat);
      dogDot1.position.set(0, -0.15, 0);
      dogTbGroup.add(dogDot1);
      const dogDot2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), dogTbMat);
      dogDot2.position.set(-0.03, -0.28, 0);
      dogTbGroup.add(dogDot2);
      const boneSprite = this.makeBoneSprite();
      boneSprite.position.set(0, 0.02, 0);
      dogTbGroup.add(boneSprite);
      dogTbGroup.position.set(0.25, 0.55, 0);
      group.add(dogTbGroup);

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
      const tSkinMat = new THREE.MeshToonMaterial({ color: "#F5D8C0" });

      // Legs
      const tLeftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.15, 5), bodyMat);
      tLeftLeg.position.set(-0.05, 0.08, 0); tLeftLeg.castShadow = true;
      group.add(tLeftLeg);
      const tRightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.15, 5), bodyMat);
      tRightLeg.position.set(0.05, 0.08, 0); tRightLeg.castShadow = true;
      group.add(tRightLeg);

      // Shoes
      const tShoeMat = new THREE.MeshToonMaterial({ color: "#FF6B6B" });
      const tShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.06), tShoeMat);
      tShoeL.position.set(-0.05, 0.01, 0.01); group.add(tShoeL);
      const tShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.06), tShoeMat);
      tShoeR.position.set(0.05, 0.01, 0.01); group.add(tShoeR);

      // Body (torso)
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 8), bodyMat);
      b.position.y = 0.24; b.castShadow = true;
      group.add(b);

      // Arms
      const tLeftArm = new THREE.Group();
      const tArmUL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.12, 5), bodyMat);
      tArmUL.position.y = -0.06; tLeftArm.add(tArmUL);
      const tHandL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 5), tSkinMat);
      tHandL.position.y = -0.13; tLeftArm.add(tHandL);
      tLeftArm.position.set(-0.12, 0.30, 0);
      group.add(tLeftArm);

      const tRightArm = new THREE.Group();
      const tArmUR = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.12, 5), bodyMat);
      tArmUR.position.y = -0.06; tRightArm.add(tArmUR);
      const tHandR = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 5), tSkinMat);
      tHandR.position.y = -0.13; tRightArm.add(tHandR);
      tRightArm.position.set(0.12, 0.30, 0);
      group.add(tRightArm);

      // Head (proportionally large for a toddler)
      const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), tSkinMat);
      h2.position.y = 0.50; h2.castShadow = true;
      group.add(h2);

      // Eyes (on +Z face so they face movement direction)
      const tEyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
      const tEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), tEyeMat);
      tEyeL.position.set(-0.06, 0.52, 0.13);
      group.add(tEyeL);
      const tEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), tEyeMat);
      tEyeR.position.set(0.06, 0.52, 0.13);
      group.add(tEyeR);

      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4),
        new THREE.MeshToonMaterial({ color: "#DEB887" }));
      tuft.position.y = 0.66;
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

      // Baby talk speech bubble (child of group so it moves with toddler)
      const toddlerTbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const toddlerTbGroup = new THREE.Group();
      toddlerTbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), toddlerTbMat));
      const tDot1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), toddlerTbMat);
      tDot1.position.set(-0.08, -0.18, 0);
      toddlerTbGroup.add(tDot1);
      const tDot2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), toddlerTbMat);
      tDot2.position.set(-0.14, -0.30, 0);
      toddlerTbGroup.add(tDot2);
      const babyIdx = Math.floor(Math.random() * BABY_TALK.length);
      const babyText = this.makeTextSprite(BABY_TALK[babyIdx]);
      babyText.position.set(0, 0.04, 0);
      babyText.name = "bubbleText";
      toddlerTbGroup.add(babyText);
      toddlerTbGroup.position.set(0.2, 0.75, 0);
      group.add(toddlerTbGroup);

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
        leftLeg: tLeftLeg, rightLeg: tRightLeg, leftArm: tLeftArm, rightArm: tRightArm,
      };
      this.npcs.push(npc);
      return npc;

    } else { // husband
      const hBodyMat = new THREE.MeshToonMaterial({ color: "#4A5568" });
      const hSkinMat = new THREE.MeshToonMaterial({ color: "#E8C8A0" });
      const hPantsMat = new THREE.MeshToonMaterial({ color: "#3A4A5A" });

      // Legs
      const hLeftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.35, 6), hPantsMat);
      hLeftLeg.position.set(-0.08, 0.18, 0); hLeftLeg.castShadow = true;
      group.add(hLeftLeg);
      const hRightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.35, 6), hPantsMat);
      hRightLeg.position.set(0.08, 0.18, 0); hRightLeg.castShadow = true;
      group.add(hRightLeg);

      // Shoes
      const hShoeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
      const hShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.1), hShoeMat);
      hShoeL.position.set(-0.08, 0.01, 0.01); group.add(hShoeL);
      const hShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.1), hShoeMat);
      hShoeR.position.set(0.08, 0.01, 0.01); group.add(hShoeR);

      // Waist
      const hWaist = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.1, 8), hPantsMat);
      hWaist.position.y = 0.40; hWaist.castShadow = true;
      group.add(hWaist);

      // Torso (shirt)
      const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.3, 8), hBodyMat);
      b3.position.y = 0.60; b3.castShadow = true;
      group.add(b3);

      // Arms
      const hLeftArm = new THREE.Group();
      const hArmUL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.22, 5), hBodyMat);
      hArmUL.position.y = -0.11; hLeftArm.add(hArmUL);
      const hForeL = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.03, 0.15, 5), hSkinMat);
      hForeL.position.y = -0.25; hLeftArm.add(hForeL);
      hLeftArm.position.set(-0.19, 0.70, 0);
      group.add(hLeftArm);

      const hRightArm = new THREE.Group();
      const hArmUR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.22, 5), hBodyMat);
      hArmUR.position.y = -0.11; hRightArm.add(hArmUR);
      const hForeR = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.03, 0.15, 5), hSkinMat);
      hForeR.position.y = -0.25; hRightArm.add(hForeR);
      hRightArm.position.set(0.19, 0.70, 0);
      group.add(hRightArm);

      // Head
      const h3 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), hSkinMat);
      h3.position.y = 0.90; h3.castShadow = true;
      group.add(h3);

      // Short hair
      const hHairMat = new THREE.MeshToonMaterial({ color: "#3A2A1A" });
      const hHair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 4), hHairMat);
      hHair.scale.y = 0.4;
      hHair.position.set(0, 0.97, -0.02);
      group.add(hHair);

      // Eyes (on +Z face so they face movement direction)
      const hEyeMat = new THREE.MeshToonMaterial({ color: "#2A1A0A" });
      const hEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), hEyeMat);
      hEyeL.position.set(-0.05, 0.92, 0.12);
      group.add(hEyeL);
      const hEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), hEyeMat);
      hEyeR.position.set(0.05, 0.92, 0.12);
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

      // Thought bubble (child of group so it moves with husband)
      const tbMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 });
      const tbGroup = new THREE.Group();
      tbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), tbMat));
      const dot1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), tbMat);
      dot1.position.set(-0.10, -0.22, 0);
      tbGroup.add(dot1);
      const dot2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), tbMat);
      dot2.position.set(-0.18, -0.36, 0);
      tbGroup.add(dot2);
      const dadIdx = Math.floor(Math.random() * DAD_THOUGHTS.length);
      const initThought = def?.thought ?? DAD_THOUGHTS[dadIdx];
      const dadText = this.makeTextSprite(initThought);
      dadText.position.set(0, 0.04, 0);
      dadText.name = "bubbleText";
      tbGroup.add(dadText);
      tbGroup.position.set(0.25, 1.25, 0);
      group.add(tbGroup);

      group.position.set((spawnX - this.cx) * TILE_SIZE, TILE_H, (spawnZ - this.cz) * TILE_SIZE);
      this.scene.add(group);
      const npc: NpcState = {
        type: "husband", group, coneMesh: coneMesh2, thoughtBubble: tbGroup,
        pos: { x: spawnX, z: spawnZ }, startPos: { x: spawnX, z: spawnZ }, facing: def?.facing ?? 0,
        patrol: def?.patrol, patrolIdx: 0, patrolDir: 1, patrolTimer: 0,
        coneRange: HUSBAND_CONE_RANGE, coneAngle: HUSBAND_CONE_ANGLE, speed: HUSBAND_SPEED,
        lured: false, lureTarget: null, lureTimer: 0,
        lastBubbleChange: 0, bubbleTextIdx: dadIdx,
        leftLeg: hLeftLeg, rightLeg: hRightLeg, leftArm: hLeftArm, rightArm: hRightArm,
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
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3;
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
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "#333333";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(0.5, 0.13, 1);
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

      // ── 3D relax scene updates ──
      if (this.relaxSceneActive) {
        this.updateRelaxScene(dt);
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Intro zoom-out phase
    if (this.introPhase) {
      if (!this.introPaused) this.introElapsed += dt;
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
      // Idle — reset limbs and add gentle sway
      if (this.momHead) this.momHead.position.y += Math.sin(this.frame * 0.015) * 0.0005;
      if (this.momLeftLeg) this.momLeftLeg.rotation.x *= 0.9;
      if (this.momRightLeg) this.momRightLeg.rotation.x *= 0.9;
      if (this.momLeftArm) this.momLeftArm.rotation.x *= 0.9;
      if (this.momRightArm) this.momRightArm.rotation.x *= 0.9;
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

    // Walking animation — leg/arm swing + head bob
    const f = this.frame;
    const swing = Math.sin(f * 0.25) * 0.4;
    if (this.momLeftLeg) this.momLeftLeg.rotation.x = swing;
    if (this.momRightLeg) this.momRightLeg.rotation.x = -swing;
    if (this.momLeftArm) this.momLeftArm.rotation.x = -swing * 0.7;
    if (this.momRightArm) this.momRightArm.rotation.x = swing * 0.7;
    if (this.momHead) this.momHead.position.y += Math.sin(f * 0.5) * 0.001;

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
          // Thought bubble bobs (it's a child of group, so only adjust local Y)
          if (npc.thoughtBubble) {
            npc.thoughtBubble.position.y = 0.50 + Math.sin(this.frame * 0.02) * 0.05;
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
          // Dog thought bubble bob (child of group, local Y)
          if (npc.thoughtBubble) {
            npc.thoughtBubble.position.y = 0.50 + Math.sin(this.frame * 0.02) * 0.05;
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

      // Determine if NPC is moving (for walk animation)
      const isMoving = (npc.lured && npc.lureTarget) || (npc.patrol && npc.patrolTimer === 0);

      if (npc.type === "toddler") {
        npc.group.rotation.y = npc.facing;
        npc.group.rotation.z = Math.sin(this.frame * 0.15) * 0.08;
        // Toddler waddle — fast, exaggerated swing
        if (isMoving) {
          const tSwing = Math.sin(this.frame * 0.3) * 0.5;
          if (npc.leftLeg) npc.leftLeg.rotation.x = tSwing;
          if (npc.rightLeg) npc.rightLeg.rotation.x = -tSwing;
          if (npc.leftArm) npc.leftArm.rotation.x = -tSwing * 0.6;
          if (npc.rightArm) npc.rightArm.rotation.x = tSwing * 0.6;
        } else {
          if (npc.leftLeg) npc.leftLeg.rotation.x *= 0.9;
          if (npc.rightLeg) npc.rightLeg.rotation.x *= 0.9;
          if (npc.leftArm) npc.leftArm.rotation.x *= 0.9;
          if (npc.rightArm) npc.rightArm.rotation.x *= 0.9;
        }
      } else if (npc.type === "husband") {
        npc.group.rotation.y = npc.facing;
        // Husband walk — slower, more deliberate
        if (isMoving) {
          const hSwing = Math.sin(this.frame * 0.2) * 0.35;
          if (npc.leftLeg) npc.leftLeg.rotation.x = hSwing;
          if (npc.rightLeg) npc.rightLeg.rotation.x = -hSwing;
          if (npc.leftArm) npc.leftArm.rotation.x = -hSwing * 0.5;
          if (npc.rightArm) npc.rightArm.rotation.x = hSwing * 0.5;
        } else {
          if (npc.leftLeg) npc.leftLeg.rotation.x *= 0.9;
          if (npc.rightLeg) npc.rightLeg.rotation.x *= 0.9;
          if (npc.leftArm) npc.leftArm.rotation.x *= 0.9;
          if (npc.rightArm) npc.rightArm.rotation.x *= 0.9;
        }
      }
      if (npc.coneMesh) {
        npc.coneMesh.position.set((npc.pos.x - this.cx) * TILE_SIZE, 0.04, (npc.pos.z - this.cz) * TILE_SIZE);
        npc.coneMesh.rotation.z = -(npc.facing - Math.PI / 2);
      }
      if (npc.thoughtBubble) {
        // Bubble is child of group — just bob the local Y
        const baseY = npc.type === "toddler" ? 0.75 : 1.25;
        npc.thoughtBubble.position.y = baseY + Math.sin(this.frame * 0.02) * 0.05;

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

  // ── Relax scene update — sitting pose, animations, TV ─────────────────────
  // Phase durations in seconds
  // 0=walk-step1, 1=walk-step2, 2=turn-and-sit, 3=head-settle,
  // 4=left-leg-up, 5=right-leg-up, 6=arms
  private static readonly RELAX_PHASE_DURATIONS = [0.6, 0.6, 0.8, 0.4, 0.5, 0.5, 0.5];

  private updateRelaxScene(dt: number) {
    const f = this.frame;

    // ── Multi-phase relax animation ──
    this.updateRelaxAnimation(dt);

    // ── TV reality show animation ──
    if (this.relaxTvScreen?.material instanceof THREE.MeshStandardMaterial) {
      const mat = this.relaxTvScreen.material;
      // Slowly cycling colors to simulate a reality show
      const r = 0.3 + Math.sin(f * 0.013) * 0.2 + Math.sin(f * 0.031) * 0.1;
      const g = 0.35 + Math.sin(f * 0.017 + 1.2) * 0.15 + Math.sin(f * 0.023) * 0.1;
      const b = 0.4 + Math.sin(f * 0.011 + 2.4) * 0.2;
      mat.color.setRGB(r, g, b);
      mat.emissive.setRGB(r * 0.8, g * 0.8, b * 0.8);
      // Occasional scene-change flash
      if (mat.emissiveIntensity > 1.5) {
        mat.emissiveIntensity = Math.max(1.2, mat.emissiveIntensity - dt * 4);
      }
    }
    // Sync TV point light color
    if (this.relaxTvLight && this.relaxTvScreen?.material instanceof THREE.MeshStandardMaterial) {
      this.relaxTvLight.color.copy(this.relaxTvScreen.material.emissive);
    }

    // ── Glow pulses on clickable items ──
    for (const gm of this.glowMeshes) {
      if (gm.userData.isGlow && gm.material instanceof THREE.MeshStandardMaterial) {
        gm.material.opacity = 0.15 + Math.sin(f * 0.06) * 0.15;
        gm.material.emissiveIntensity = 0.4 + Math.sin(f * 0.06) * 0.3;
      }
    }

    // ── Arm animations (cheese eating, wine drinking) ──
    this.updateRelaxAnim(dt);
  }

  /**
   * Multi-phase relax animation:
   * 0: walk step 1 (goal → gap entry, NW direction)
   * 1: walk step 2 (through gap, westward)
   * 2: turn toward TV + sit down (thighs horizontal, calves vertical)
   * 3: head settles back on cushion
   * 4: left leg straightens onto coffee table
   * 5: right leg straightens onto coffee table
   * 6: arms drape over armrests
   */
  private updateRelaxAnimation(dt: number) {
    if (this.relaxPhase < 0 || this.relaxPhase >= 7) return;

    const durations = Game.RELAX_PHASE_DURATIONS;
    const dur = durations[this.relaxPhase];
    this.relaxPhaseT = Math.min(this.relaxPhaseT + dt / dur, 1);
    const t = easeOutQuad(this.relaxPhaseT);

    switch (this.relaxPhase) {
      // ── Phase 0: Walk step 1 — from goal toward gap entry (NW on screen) ──
      case 0: {
        const start = this.relaxWalkStartPos!;
        const wp = this.relaxWaypoints[0];
        if (start && wp) {
          this.mom.position.x = lerp(start.x, wp.x, t);
          this.mom.position.z = lerp(start.z, wp.z, t);
          // Face walking direction
          const dx = wp.x - start.x;
          const dz = wp.z - start.z;
          this.mom.rotation.y = Math.atan2(dx, dz);
          // Walk bob
          if (t < 0.95) this.mom.position.y = start.y + Math.sin(t * Math.PI * 2) * 0.004;
          // Leg swing
          const swing = Math.sin(t * Math.PI * 4) * 0.35;
          if (this.momLeftLeg) this.momLeftLeg.rotation.x = swing;
          if (this.momRightLeg) this.momRightLeg.rotation.x = -swing;
        }
        break;
      }
      // ── Phase 1: Walk step 2 — through gap westward ──
      case 1: {
        const start = this.relaxWaypoints[0];
        const wp = this.relaxWaypoints[1];
        if (start && wp) {
          this.mom.position.x = lerp(start.x, wp.x, t);
          this.mom.position.z = lerp(start.z, wp.z, t);
          const dx = wp.x - start.x;
          const dz = wp.z - start.z;
          this.mom.rotation.y = Math.atan2(dx, dz);
          if (t < 0.95) this.mom.position.y = start.y + Math.sin(t * Math.PI * 2) * 0.004;
          const swing = Math.sin(t * Math.PI * 4) * 0.35;
          if (this.momLeftLeg) this.momLeftLeg.rotation.x = swing;
          if (this.momRightLeg) this.momRightLeg.rotation.x = -swing;
        }
        break;
      }
      // ── Phase 2: Turn toward TV and squat down onto couch ──
      case 2: {
        const seat = this.relaxSeatPos;
        const from = this.relaxWaypoints[1];
        if (seat && from) {
          // Slide from gap northward onto couch seat
          this.mom.position.x = lerp(from.x, seat.x, t);
          this.mom.position.z = lerp(from.z, seat.z, t);
          // Turn to face TV (+Z direction, rotation.y = 0)
          this.mom.rotation.y = lerp(this.relaxStartRotY, 0, Math.min(t * 2, 1));
          // Squat arc: dip below standing height in first half,
          // then rise to seat height in second half — never into the couch
          const squat = Math.sin(t * Math.PI) * 0.06; // mid-squat dip
          this.mom.position.y = lerp(from.y, seat.y, t) - squat * (1 - t);
          // Thighs rotate to horizontal (pointing forward, +Z)
          const thighAngle = lerp(0, -Math.PI / 2, t);
          if (this.momLeftLeg) this.momLeftLeg.rotation.x = thighAngle;
          if (this.momRightLeg) this.momRightLeg.rotation.x = thighAngle;
          // Calves bend at knee to hang vertical
          const calfAngle = lerp(0, Math.PI / 2, t);
          if (this.momLeftCalf) this.momLeftCalf.rotation.x = calfAngle;
          if (this.momRightCalf) this.momRightCalf.rotation.x = calfAngle;
          // Torso stays vertical — no lean
          this.mom.rotation.x = 0;
        }
        break;
      }
      // ── Phase 3: Head tilts slightly backward (leaning on back cushion) ──
      case 3: {
        if (this.momHead) this.momHead.rotation.x = lerp(0, 0.15, t);
        break;
      }
      // ── Phase 4: Left leg lifts from knee — calf straightens onto coffee table ──
      case 4: {
        if (this.momLeftCalf) {
          // From 90° bent (π/2) to straight (0) — extends leg fully horizontal
          this.momLeftCalf.rotation.x = lerp(Math.PI / 2, 0, t);
        }
        break;
      }
      // ── Phase 5: Right leg lifts from knee — calf straightens onto coffee table ──
      case 5: {
        if (this.momRightCalf) {
          this.momRightCalf.rotation.x = lerp(Math.PI / 2, 0, t);
        }
        break;
      }
      // ── Phase 6: Arms drape over armrests ──
      case 6: {
        if (this.momLeftArm) {
          this.momLeftArm.rotation.z = lerp(0, 0.6, t);
          this.momLeftArm.rotation.x = lerp(0, 0.4, t);
        }
        if (this.momRightArm) {
          this.momRightArm.rotation.z = lerp(0, -0.6, t);
          this.momRightArm.rotation.x = lerp(0, 0.4, t);
        }
        break;
      }
    }

    // Advance to next phase when current completes
    if (this.relaxPhaseT >= 1) {
      if (this.relaxPhase === 0) {
        // Snap to waypoint 1 position
        this.mom.position.copy(this.relaxWaypoints[0]);
      } else if (this.relaxPhase === 1) {
        // Snap to waypoint 2 — store rotation at this point for the turn
        this.mom.position.copy(this.relaxWaypoints[1]);
        this.relaxStartRotY = this.mom.rotation.y;
        // Reset leg swing to neutral before sitting
        if (this.momLeftLeg) this.momLeftLeg.rotation.x = 0;
        if (this.momRightLeg) this.momRightLeg.rotation.x = 0;
      } else if (this.relaxPhase === 2) {
        // Snap to seat position (computed at correct seat-top height)
        if (this.relaxSeatPos) this.mom.position.copy(this.relaxSeatPos);
        const couchFurn = this.level.furniture.find(f => f.label === "couch");
        if (couchFurn) {
          this.momPos.x = couchFurn.x + couchFurn.w / 2 - 0.5;
          this.momPos.z = couchFurn.z + couchFurn.h / 2 - 0.5;
        }
      }
      this.relaxPhase++;
      this.relaxPhaseT = 0;
    }
  }

  private updateRelaxAnim(dt: number) {
    const anim = this.relaxAnim;
    if (anim.type === "idle") return;

    anim.elapsed += dt;
    const t = Math.min(anim.elapsed / anim.duration, 1);
    const eased = easeOutQuad(t);

    switch (anim.type) {
      case "cheese-reach": {
        // Right arm reaches forward toward coffee table
        if (this.momRightArm) {
          this.momRightArm.rotation.x = lerp(0.2, -1.0, eased);
          this.momRightArm.rotation.z = lerp(-0.3, -0.1, eased);
        }
        if (t >= 1) {
          // Grab the cheese piece — hide it
          if (anim.target) {
            anim.target.visible = false;
            // Remove from clickables
            const idx = this.relaxClickables.indexOf(anim.target);
            if (idx >= 0) this.relaxClickables.splice(idx, 1);
            const pidx = this.relaxCheesePieces.indexOf(anim.target);
            if (pidx >= 0) this.relaxCheesePieces.splice(pidx, 1);
          }
          this.relaxAnim = { type: "cheese-eat", elapsed: 0, duration: 0.6 };
        }
        break;
      }
      case "cheese-eat": {
        // Bring arm up to mouth
        if (this.momRightArm) {
          this.momRightArm.rotation.x = lerp(-1.0, -0.3, eased);
          this.momRightArm.rotation.z = lerp(-0.1, -0.15, eased);
        }
        // Head tilts forward slightly to "eat"
        if (this.momHead && t > 0.3 && t < 0.7) {
          this.momHead.rotation.x = lerp(-0.1, 0.05, (t - 0.3) / 0.4);
        }
        if (t >= 1) {
          this.relaxAnim = { type: "cheese-return", elapsed: 0, duration: 0.4 };
        }
        break;
      }
      case "cheese-return": {
        // Return arm to resting position
        if (this.momRightArm) {
          this.momRightArm.rotation.x = lerp(-0.3, 0.2, eased);
          this.momRightArm.rotation.z = lerp(-0.15, -0.3, eased);
        }
        if (this.momHead) this.momHead.rotation.x = lerp(0.05, -0.1, eased);
        if (t >= 1) {
          this.relaxAnim = { type: "idle", elapsed: 0, duration: 0 };
        }
        break;
      }
      case "wine-reach": {
        // Left arm reaches to the side (toward side table)
        if (this.momLeftArm) {
          this.momLeftArm.rotation.x = lerp(0.2, -0.4, eased);
          this.momLeftArm.rotation.z = lerp(0.3, 0.6, eased);
        }
        if (t >= 1) {
          this.relaxAnim = { type: "wine-drink", elapsed: 0, duration: 0.8 };
        }
        break;
      }
      case "wine-drink": {
        // Bring arm from side to mouth (across body and up)
        if (this.momLeftArm) {
          // Phase 1: bring to mouth (first 50%)
          if (t < 0.5) {
            const subT = easeOutQuad(t / 0.5);
            this.momLeftArm.rotation.x = lerp(-0.4, -0.6, subT);
            this.momLeftArm.rotation.z = lerp(0.6, 0.1, subT);
          }
          // Phase 2: tip and hold (50-100%)
          else {
            const subT = (t - 0.5) / 0.5;
            this.momLeftArm.rotation.x = lerp(-0.6, -0.5, subT);
            // Tilt wrist/glass
            this.momLeftArm.rotation.z = lerp(0.1, 0.15, Math.sin(subT * Math.PI) * 0.5 + 0.5);
          }
        }
        // Head tilts back for drinking
        if (this.momHead) {
          if (t > 0.3 && t < 0.8) {
            this.momHead.rotation.x = lerp(-0.1, -0.2, (t - 0.3) / 0.5);
          } else if (t >= 0.8) {
            this.momHead.rotation.x = lerp(-0.2, -0.1, (t - 0.8) / 0.2);
          }
        }
        if (t >= 1) {
          this.relaxAnim = { type: "wine-return", elapsed: 0, duration: 0.5 };
        }
        break;
      }
      case "wine-return": {
        // Return arm to resting position
        if (this.momLeftArm) {
          this.momLeftArm.rotation.x = lerp(-0.5, 0.2, eased);
          this.momLeftArm.rotation.z = lerp(0.15, 0.3, eased);
        }
        if (this.momHead) this.momHead.rotation.x = lerp(-0.1, -0.1, eased);
        if (t >= 1) {
          this.relaxAnim = { type: "idle", elapsed: 0, duration: 0 };
        }
        break;
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

  setIntroPaused(v: boolean) {
    this.introPaused = v;
  }

  setRelaxZoomCallback(cb: () => void) {
    this.relaxZoomCallback = cb;
  }

  setDeferredTapHandler(cb: (x: number, y: number) => void) {
    this.onDeferredTap = cb;
  }

  setRelaxClickCallback(cb: (itemId: string, feedback: string, screenX: number, screenY: number) => void) {
    this.relaxClickCallback = cb;
  }

  /** Called from GameView after zoom completes for 3D relax scenes */
  enterRelaxScene() {
    this.relaxSceneActive = true;

    // Compute walk waypoints: goal → gap between couch & coffee table → couch front
    const couchGroup = this.furnitureGroups.find(g => g.userData.label === "couch");
    const coffeeTableGroup = this.furnitureGroups.find(g => g.userData.label === "coffeeTable");
    const couchFurn = this.level.furniture.find(f => f.label === "couch");

    const momY = this.mom.position.y;
    // The gap between couch south edge and coffee table north edge
    const gapZ = couchGroup && coffeeTableGroup
      ? (couchGroup.position.z + (couchFurn ? couchFurn.h * TILE_SIZE * 0.5 : 0.5)
         + coffeeTableGroup.position.z - (this.level.furniture.find(f => f.label === "coffeeTable")?.h ?? 2) * TILE_SIZE * 0.5) / 2
      : this.mom.position.z + 0.3;

    // East end of the gap (entry point — just west of goal)
    const gapEntryX = couchGroup
      ? couchGroup.position.x + (couchFurn ? couchFurn.w * TILE_SIZE * 0.5 : 1.0) + TILE_SIZE * 0.5
      : this.mom.position.x - 0.3;
    // Center of couch in x (where she'll sit)
    const couchCenterX = couchGroup ? couchGroup.position.x : this.mom.position.x - 1.0;
    // Seat z: center of the couch (she sits facing TV/south)
    const seatZ = couchGroup ? couchGroup.position.z : gapZ - 0.3;
    // Seat Y: Mom's hip bottom (local y=0.30) rests on couch seat top surface
    // Couch seat top = group.y(0.15) + seat center(0.25) + half-thickness(0.08) = 0.48
    const seatTopY = (couchGroup?.position.y ?? TILE_H) + 0.33;
    const seatedMomY = seatTopY - 0.30; // hip pivot sits on seat surface

    this.relaxWaypoints = [
      new THREE.Vector3(gapEntryX, momY, gapZ),       // step 1: into the gap
      new THREE.Vector3(couchCenterX, momY, gapZ),     // step 2: walk west through gap
    ];
    this.relaxSeatPos = new THREE.Vector3(couchCenterX, seatedMomY, seatZ);
    this.relaxWalkStartPos = this.mom.position.clone();
    this.relaxStartRotY = this.mom.rotation.y;

    // Kick off phase 0 (first walk step)
    this.relaxPhase = 0;
    this.relaxPhaseT = 0;

    // Find existing furniture groups by label (coffeeTableGroup already declared above)
    const tvGroup = this.furnitureGroups.find(g => g.userData.label === "tv");
    const sideTableGroup = this.furnitureGroups.find(g => g.userData.label === "sideTable");

    // ── Turn on the TV ──
    if (tvGroup) {
      // Find the screen face mesh (the emissive one) inside the tvUnit group
      tvGroup.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const mat = child.material;
          if (mat.emissive && mat.emissiveIntensity > 0.3 && mat.color.getHexString() === "0a0a2a") {
            // This is the TV screen face — make it glow
            this.relaxTvScreen = child;
            child.material = new THREE.MeshStandardMaterial({
              color: "#446688",
              emissive: "#446688",
              emissiveIntensity: 1.2,
              roughness: 0.3,
            });
            child.userData.relaxItem = "tv";
            this.relaxClickables.push(child);
          }
        }
      });
      // Add a point light to simulate TV glow
      const tvLight = new THREE.PointLight("#6688AA", 0.6, 3);
      tvLight.position.set(0, 0.6, 0.2);
      tvGroup.add(tvLight);
      this.relaxTvLight = tvLight;
    }

    // ── Enhance wine glass on side table — make it more prominent and clickable ──
    if (sideTableGroup) {
      // Build a nicer wine glass on the side table
      const wineGroup = new THREE.Group();

      // Stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6),
        new THREE.MeshStandardMaterial({ color: "#E8F0F0", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 })
      );
      stem.position.y = 0.03;
      wineGroup.add(stem);

      // Base
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.006, 8),
        new THREE.MeshStandardMaterial({ color: "#E8F0F0", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 })
      );
      base.position.y = 0;
      wineGroup.add(base);

      // Bowl (open cylinder)
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.015, 0.06, 8, 1, true),
        new THREE.MeshStandardMaterial({ color: "#E0F0F0", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.5 })
      );
      bowl.position.y = 0.09;
      wineGroup.add(bowl);

      // Wine liquid
      const wine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.013, 0.04, 8),
        new THREE.MeshStandardMaterial({ color: "#8B1A2A", emissive: "#3A0808", emissiveIntensity: 0.3, roughness: 0.5 })
      );
      wine.position.y = 0.08;
      wineGroup.add(wine);

      wineGroup.position.set(0.04, 0.34, -0.02);
      wineGroup.userData.relaxItem = "wine";
      sideTableGroup.add(wineGroup);
      this.relaxWineGlass = wineGroup;
      this.relaxClickables.push(wineGroup);

      // Add glow hint
      const wineGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: "#FFD700", emissive: "#FFD700", emissiveIntensity: 0.6, transparent: true, opacity: 0.3 })
      );
      wineGlow.position.copy(wineGroup.position);
      wineGlow.position.y += 0.06;
      wineGlow.userData.isGlow = true;
      sideTableGroup.add(wineGlow);
      this.glowMeshes.push(wineGlow);
    }

    // ── Build cheese tray on coffee table ──
    if (coffeeTableGroup) {
      const trayGroup = new THREE.Group();

      // Wooden tray/board
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.015, 0.12),
        new THREE.MeshStandardMaterial({ color: "#B8956A", roughness: 0.8 })
      );
      tray.position.y = 0;
      tray.castShadow = true;
      trayGroup.add(tray);

      // Cheese pieces (4 small wedges)
      const cheeseMat = new THREE.MeshStandardMaterial({ color: "#F0D050", roughness: 0.6 });
      const cheesePositions = [
        { x: -0.05, z: -0.02 },
        { x: 0.03, z: -0.03 },
        { x: -0.02, z: 0.03 },
        { x: 0.06, z: 0.02 },
      ];
      cheesePositions.forEach((pos, i) => {
        const piece = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.02, 0.025),
          cheeseMat.clone()
        );
        piece.position.set(pos.x, 0.018, pos.z);
        piece.rotation.y = Math.random() * Math.PI;
        piece.castShadow = true;
        piece.userData.relaxItem = "cheese";
        piece.userData.cheeseIdx = i;
        trayGroup.add(piece);
        this.relaxCheesePieces.push(piece);
        this.relaxClickables.push(piece);
      });

      // Position tray on top of coffee table
      trayGroup.position.set(0, 0.22, 0);
      coffeeTableGroup.add(trayGroup);

      // Add glow hint for cheese
      const cheeseGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: "#FFD700", emissive: "#FFD700", emissiveIntensity: 0.6, transparent: true, opacity: 0.3 })
      );
      cheeseGlow.position.set(0, 0.28, 0);
      cheeseGlow.userData.isGlow = true;
      coffeeTableGroup.add(cheeseGlow);
      this.glowMeshes.push(cheeseGlow);
    }

    // Hide the goal ring
    if (this.goalRing) this.goalRing.visible = false;
  }

  /** Handle click during 3D relax scene — returns true if something was clicked */
  handleRelaxClick(clientX: number, clientY: number): boolean {
    if (!this.relaxSceneActive) return false;
    if (this.relaxPhase < 7) return false; // relax animation still playing
    if (this.relaxAnim.type !== "idle") return false; // arm animation in progress

    const rect = this.element.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);

    // Collect all clickable meshes (need to traverse groups)
    const clickTargets: THREE.Object3D[] = [];
    for (const obj of this.relaxClickables) {
      if (obj instanceof THREE.Group) {
        obj.traverse((c: THREE.Object3D) => { if (c instanceof THREE.Mesh) clickTargets.push(c); });
      } else {
        clickTargets.push(obj);
      }
    }

    const hits = ray.intersectObjects(clickTargets, false);
    if (hits.length === 0) return false;

    // Walk up to find the userData.relaxItem
    let hit = hits[0].object;
    let itemId: string | undefined;
    while (hit) {
      if (hit.userData?.relaxItem) { itemId = hit.userData.relaxItem; break; }
      hit = hit.parent as THREE.Object3D;
    }
    if (!itemId) return false;

    if (itemId === "cheese") {
      // Find which cheese piece was clicked
      const cheeseMesh = this.relaxCheesePieces.find(p => {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) { if (obj === p) return true; obj = obj.parent; }
        return false;
      });
      if (!cheeseMesh) return false;
      this.relaxAnim = { type: "cheese-reach", elapsed: 0, duration: 0.5, target: cheeseMesh };
      this.relaxClickCallback?.("cheese", "*mmm*", clientX, clientY);
      return true;
    }

    if (itemId === "wine") {
      this.relaxAnim = { type: "wine-reach", elapsed: 0, duration: 0.5 };
      this.relaxClickCallback?.("wine", "*sip*", clientX, clientY);
      return true;
    }

    if (itemId === "tv") {
      // Flash the TV
      if (this.relaxTvScreen?.material instanceof THREE.MeshStandardMaterial) {
        this.relaxTvScreen.material.emissiveIntensity = 3.0;
      }
      this.relaxClickCallback?.("tv", "*drama!*", clientX, clientY);
      return true;
    }

    return false;
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

  /** Project Mom's head into screen (CSS pixel) coordinates */
  getMomScreenPos(): { x: number; y: number } {
    const headWorldY = this.mom.position.y + 1.05; // above head top (head center ~0.90 + radius 0.13)
    const v = new THREE.Vector3(this.mom.position.x, headWorldY, this.mom.position.z);
    v.project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
    };
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
