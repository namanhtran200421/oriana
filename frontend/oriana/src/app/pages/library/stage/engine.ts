import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StoryEntry } from '../../../core/story';
import { FocusPass } from './focus-pass';
import { mulberry } from './noise';
import {
  ShelvedBook,
  bankersLamp,
  bookParts,
  bookcase,
  desk,
  fillShelf,
  letter,
  shelvedBooks,
  volumeMesh,
} from './props';
import {
  NoteText,
  cover,
  glow,
  leather,
  leatherGrain,
  note,
  pageEdges,
  spine,
  walnut,
} from './textures';

export interface StageVolume {
  story: StoryEntry;
  volume: number;
  roman: string;
  finished: boolean;
  reading: boolean;
}

export interface StageOptions {
  volumes: StageVolume[];
  volumeLabel: string;
  note: NoteText;
  paper: string;
  /** Phones and small GPUs: fewer pixels, smaller maps, no depth of field. */
  lite: boolean;
  onHover: (slug: string | null) => void;
  /** How far the room has got with being built, 0 to 1. */
  onProgress?: (done: number) => void;
}

export interface Stage {
  /**
   * 0 at the desk, 1 facing the shelf: where the camera is on its journey.
   * `immediate` puts it there at once, as when returning to a page.
   */
  setProgress(progress: number, immediate?: boolean): void;
  /** Pointer in normalised device coordinates, or null when it leaves. */
  setPointer(x: number | null, y: number): void;
  /** The volume under the pointer, if the shelf is in reach. */
  hovered(): string | null;
  /** The volume at a point in normalised device coordinates, for a tap. */
  pick(x: number, y: number): string | null;
  /** Draws a volume forward as if reached for, from outside the canvas. */
  highlight(slug: string | null): void;
  takeDown(slug: string): Promise<void>;
  putBack(): Promise<void>;
  /** Leans in towards the held book, for the moment before reading. */
  leanIn(): Promise<void>;
  resize(width: number, height: number): void;
  dispose(): void;
}

// The journey, keyed by scroll progress. Each shot is where the camera stands
// and where it looks; the letter's shots are worked out to fit the screen.
interface Shot {
  at: number;
  position: [number, number, number] | 'letter';
  look: [number, number, number];
}

const LETTER_AT = new THREE.Vector3(0.13, 0.76, 0.07);
const LETTER_SIZE = { width: 0.21, length: 0.297 };
/** Where the camera looks at the letter from: above it and towards the room. */
const LETTER_VIEW = new THREE.Vector3(0, 0.535, 0.41).normalize();

const SHOTS: Shot[] = [
  { at: 0, position: [0.18, 1.32, 2.05], look: [-0.06, 0.95, -0.1] },
  { at: 0.16, position: [0.16, 1.2, 1.15], look: [0.08, 0.82, 0.0] },
  { at: 0.34, position: 'letter', look: [0.13, 0.765, 0.06] },
  { at: 0.52, position: 'letter', look: [0.13, 0.765, 0.06] },
  { at: 0.7, position: [0.0, 1.42, 0.9], look: [0.0, 1.38, -1.0] },
  { at: 0.86, position: [0.0, 1.45, 0.32], look: [0.0, 1.43, -1.05] },
  { at: 1, position: [0.0, 1.45, 0.26], look: [0.0, 1.43, -1.05] },
];

const SHELF_Z = -1.05;
const HER_SHELF = 1.3;

/**
 * Quality steps, best first. When frames run long the room steps down one,
 * and stays there: fewer pixels first, then the depth of field.
 */
const TIERS = {
  full: [
    { ratio: 2, focus: true },
    { ratio: 1.5, focus: true },
    { ratio: 1.25, focus: false },
    { ratio: 1, focus: false },
  ],
  lite: [
    { ratio: 1.5, focus: false },
    { ratio: 1.25, focus: false },
    { ratio: 1, focus: false },
  ],
};
/** Below this many frames a second, sustained, the room steps down. */
const FLOOR_FPS = 45;
/** With nothing moving, the room is redrawn this often, to spare the battery. */
const IDLE_FPS = 30;

export async function createStage(
  canvas: HTMLCanvasElement,
  options: StageOptions,
): Promise<Stage> {
  const report = options.onProgress ?? (() => undefined);
  const lite = options.lite;
  const mapSize = lite ? 256 : 512;
  report(0.02);

  // Canvas lettering needs its faces loaded before it is painted.
  await Promise.all(
    [
      '600 64px Cinzel',
      '500 64px Cinzel',
      '500 64px "Cormorant Garamond"',
      'italic 400 64px "Cormorant Garamond"',
      '400 64px "Crimson Pro"',
    ].map((font) => document.fonts?.load(font).catch(() => undefined)),
  );
  report(0.08);

  // Every surface at once: the worker bakes while the lettering is painted.
  let baked = 0;
  const total = 5 + options.volumes.length;
  const counted = <T>(work: Promise<T>): Promise<T> =>
    work.then((value) => {
      report(0.08 + (++baked / total) * 0.72);
      return value;
    });
  const grain = leatherGrain(mapSize);
  const [[hide, wood, darkWood, edges, noteMaps], volumeSurfaces] = await Promise.all([
    Promise.all([
      counted(leather(mapSize)),
      counted(walnut(mapSize, 3, 1)),
      counted(walnut(mapSize, 9, 0.6)),
      counted(pageEdges(lite ? 128 : 256)),
      counted(note(options.paper, options.note, lite ? 0.75 : 1)),
    ]),
    Promise.all(
      options.volumes.map(async (volume) => {
        const ground = await grain;
        return counted(
          Promise.all([
            spine(volume.story, volume.volume, volume.roman, ground),
            cover(volume.story, volume.volume, `${options.volumeLabel} ${volume.roman}`, ground),
          ]),
        );
      }),
    ),
  ]);
  report(0.82);

  // The composer draws the scene into its own multisampled target, so the
  // canvas itself needs no antialiasing.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  const tiers = lite ? TIERS.lite : TIERS.full;
  let tier = 0;
  const ratioFor = (t: number) => Math.min(devicePixelRatio || 1, tiers[t].ratio);
  renderer.setPixelRatio(ratioFor(tier));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Almost nothing in the room moves, so shadows are only redrawn when
  // something does (see `shadowsDirty`).
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#070504');
  scene.fog = new THREE.FogExp2('#080504', 0.24);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.06;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 30);

  // ---------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------
  const leatherMaterial = new THREE.MeshStandardMaterial({
    map: hide.map,
    normalMap: hide.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: hide.roughnessMap,
    roughness: 1,
  });
  const pagesMaterial = new THREE.MeshStandardMaterial({
    map: edges.map,
    color: '#a8987c',
    roughness: 0.95,
  });
  const giltMaterial = new THREE.MeshStandardMaterial({
    color: '#c9a45a',
    metalness: 1,
    roughness: 0.38,
  });
  const brass = new THREE.MeshStandardMaterial({ color: '#b48f4c', metalness: 1, roughness: 0.3 });

  const woodMaterial = (surface: typeof wood, repeat: [number, number], turned = false) => {
    const tex = (t?: THREE.Texture) => {
      if (!t) return undefined;
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.set(...repeat);
      if (turned) {
        c.center.set(0.5, 0.5);
        c.rotation = Math.PI / 2;
      }
      return c;
    };
    return new THREE.MeshStandardMaterial({
      map: tex(surface.map),
      normalMap: tex(surface.normalMap),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: tex(surface.roughnessMap),
      roughness: 1,
    });
  };
  const upright = woodMaterial(wood, [1, 3]);
  const board = woodMaterial(wood, [1, 4], true);
  const back = woodMaterial(darkWood, [14, 6]);
  back.color = new THREE.Color('#4a3e34');
  back.normalScale.set(0.2, 0.2);
  const floorWood = woodMaterial(darkWood, [10, 10], true);

  // ---------------------------------------------------------------------
  // The room
  // ---------------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorWood);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.95 }),
  );
  wall.position.set(0, 3, SHELF_Z - 0.2);
  wall.receiveShadow = true;
  scene.add(wall);

  // The bookcases: Oriana's in the middle, and one beside it. The window
  // stands to the left.
  const shelves = [0.1, 0.5, 0.9, 1.3, 1.7, 2.1];
  const shelfHeight = 0.36;
  const caseWidth = 2.2;
  const caseDepth = 0.34;
  const bookSize = { width: 0.052, height: 0.31, depth: 0.22 };
  const slots = options.volumes.map((_, i) => ({
    x: (i - (options.volumes.length - 1) / 2) * 0.32 - 0.04,
    width: bookSize.width,
  }));

  const parts = bookParts(8);
  for (const [x, seed] of [
    [0, 0],
    [2.36, 101],
  ]) {
    const unit = bookcase(caseWidth, 2.48, caseDepth, shelves, { upright, board, back });
    unit.position.set(x, 0, SHELF_Z);
    scene.add(unit);
    const books: ShelvedBook[] = shelves.flatMap((y, row) =>
      fillShelf(
        seed + row * 17,
        -caseWidth / 2 + 0.05,
        caseWidth / 2 - 0.05,
        shelfHeight,
        x === 0 && y === HER_SHELF ? slots : [],
      ).map((book) => ({ ...book, y })),
    );
    const group = shelvedBooks(books, parts, {
      leather: leatherMaterial,
      pages: pagesMaterial,
      gilt: giltMaterial,
    });
    group.position.set(x, 0, SHELF_Z + 0.04);
    scene.add(group);
  }

  // Oriana's volumes, each on a pivot at its centre so it can be taken down.
  const fineParts = bookParts(32);
  const volumes = new Map<
    string,
    { pivot: THREE.Group; home: THREE.Matrix4; volume: StageVolume }
  >();
  options.volumes.forEach((volume, i) => {
    const binding = leatherMaterial.clone();
    binding.color = new THREE.Color(
      { crimson: '#7e1c2b', mahogany: '#6a3d25', oak: '#5e4a30' }[
        volume.story.binding ?? 'crimson'
      ] ?? '#7e1c2b',
    );
    const [spineSurface, coverSurface] = volumeSurfaces[i];
    const mesh = volumeMesh(
      fineParts,
      bookSize,
      { spine: spineSurface, cover: coverSurface },
      { leather: binding, pages: pagesMaterial, gilt: giltMaterial },
    );
    mesh.position.y = -bookSize.height / 2;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.position.set(slots[i].x, HER_SHELF + bookSize.height / 2 + 0.001, SHELF_Z + 0.04);
    pivot.userData['slug'] = volume.story.slug;
    pivot.updateMatrix();
    scene.add(pivot);

    // A silk ribbon hanging from a volume left half read.
    if (volume.reading) {
      const ribbon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.008, 0.07),
        new THREE.MeshStandardMaterial({
          color: '#8b2635',
          roughness: 0.45,
          side: THREE.DoubleSide,
        }),
      );
      ribbon.position.set(0.01, -bookSize.height / 2 - 0.03, bookSize.depth * 0.35);
      pivot.add(ribbon);
    }
    volumes.set(volume.story.slug, { pivot, home: pivot.matrix.clone(), volume });
  });

  // The desk, the lamp, the letter, and a few things left on the desk.
  const deskTop = 0.76;
  // The desk's writing leather, tiled small so it holds up close.
  const fine = (t: THREE.Texture | null) => {
    if (!t) return null;
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(6, 3);
    return c;
  };
  const greenLeather = new THREE.MeshStandardMaterial({
    color: '#2f5c40',
    map: fine(leatherMaterial.map),
    normalMap: fine(leatherMaterial.normalMap),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: fine(leatherMaterial.roughnessMap),
    roughness: 1,
  });
  scene.add(desk(1.5, 0.78, deskTop, woodMaterial(wood, [2, 1], true), greenLeather));

  const lamp = bankersLamp(brass);
  lamp.group.position.set(-0.6, deskTop, -0.2);
  lamp.group.rotation.y = 0.35;
  scene.add(lamp.group);

  const seal = new THREE.MeshPhysicalMaterial({
    color: '#7e1a28',
    roughness: 0.32,
    clearcoat: 0.8,
  });
  const theLetter = letter(noteMaps.front, noteMaps.back, seal);
  theLetter.group.position.copy(LETTER_AT).add(new THREE.Vector3(0, 0.0016, 0));
  theLetter.group.rotation.y = -0.06;
  scene.add(theLetter.group);

  // A pile of two books, and an inkwell.
  [
    { colour: '#25402f', size: [0.17, 0.24, 0.045], y: 0, turn: 0.08 },
    { colour: '#5a2228', size: [0.15, 0.22, 0.04], y: 0.045, turn: -0.12 },
  ].forEach((b) => {
    const m = leatherMaterial.clone();
    m.color = new THREE.Color(b.colour);
    const book = new THREE.Mesh(new RoundedBoxGeometry(b.size[0], b.size[2], b.size[1], 2, 0.006), m);
    book.position.set(0.55, deskTop + b.y + b.size[2] / 2, -0.12);
    book.rotation.y = b.turn;
    book.castShadow = book.receiveShadow = true;
    scene.add(book);
  });

  const inkwell = new THREE.Group();
  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(0.055, 0.045, 0.055, 3, 0.012),
    new THREE.MeshPhysicalMaterial({
      color: '#0d1418',
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
    }),
  );
  glass.position.y = 0.0225;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.016, 24), brass);
  cap.position.y = 0.052;
  inkwell.add(glass, cap);
  inkwell.traverse((o) => (o.castShadow = true));
  inkwell.position.set(0.42, deskTop, 0.12);
  scene.add(inkwell);

  // The window, to the left of the shelves: night, a moon, leaded glass.
  scene.add(gothicWindow(new THREE.Vector3(-1.9, 0, SHELF_Z - 0.1), upright));

  // ---------------------------------------------------------------------
  // Light
  // ---------------------------------------------------------------------
  lamp.group.updateMatrixWorld(true);
  const lampAt = lamp.light.clone().applyMatrix4(lamp.group.matrixWorld);
  const lampLight = new THREE.SpotLight('#ffc98a', 4.2, 0, 1.35, 1, 2);
  lampLight.position.copy(lampAt);
  lampLight.target.position.set(-0.38, deskTop, 0.1);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.setScalar(lite ? 1024 : 2048);
  lampLight.shadow.bias = -0.0003;
  lampLight.shadow.radius = 8;
  lampLight.shadow.normalBias = 0.01;
  lampLight.shadow.camera.near = 0.05;
  lampLight.shadow.camera.far = 4;
  scene.add(lampLight, lampLight.target);

  const spill = new THREE.PointLight('#ffb366', 0.55, 0, 2);
  spill.position.copy(lampAt).add(new THREE.Vector3(0, 0.06, 0));
  scene.add(spill);

  // A picture light over the bookcase, raking down the spines.
  const pictureLight = new THREE.SpotLight('#ffd7a0', 7, 0, 0.42, 0.95, 2);
  pictureLight.position.set(0, 2.62, SHELF_Z + 0.75);
  pictureLight.target.position.set(0, 1.38, SHELF_Z);
  pictureLight.castShadow = true;
  pictureLight.shadow.mapSize.setScalar(1024);
  pictureLight.shadow.bias = -0.0004;
  pictureLight.shadow.radius = 4;
  pictureLight.shadow.normalBias = 0.01;
  scene.add(pictureLight, pictureLight.target);

  const moon = new THREE.DirectionalLight('#8aa3d8', 0.55);
  moon.position.set(-3.2, 3, -1.6);
  moon.target.position.set(0.2, 0.7, 0.2);
  scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight('#1c2438', '#0b0705', 0.18));

  // A key light that follows the camera, for the book held in the hand.
  const handLight = new THREE.SpotLight('#ffe2b8', 0, 0, 0.5, 0.9, 2);
  scene.add(handLight, handLight.target);

  // Dust in the lamplight.
  const dust = motes(lite ? 260 : 520, glow(), lampAt);
  scene.add(dust.points);

  // The curtain of shadow drawn behind a book taken down.
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({
      color: '#050302',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  curtain.renderOrder = 10;
  scene.add(curtain);

  // ---------------------------------------------------------------------
  // Post: depth of field, a little bloom, film grain and vignette. The
  // scene is drawn once, multisampled, with its depth kept for the focus.
  // ---------------------------------------------------------------------
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: lite ? 2 : 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const focus = lite ? null : new FocusPass(camera);
  if (focus) {
    focus.uniforms.maxBlur.value = 0.008;
    composer.addPass(focus);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grainPass = new ShaderPass(FILM);
  composer.addPass(grainPass);

  // ---------------------------------------------------------------------
  // The loop
  // ---------------------------------------------------------------------
  let width = 1;
  let height = 1;
  let progress = 0;
  let shown = 0;
  const pointer = new THREE.Vector2();
  let pointerIn = false;
  let pointerAt = -Infinity;
  const look = new THREE.Vector3();
  const goal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  const raycaster = new THREE.Raycaster();
  let hover: string | null = null;
  let lastHover: string | null = null;
  let highlighted: string | null = null;
  const slide = new Map<string, number>();
  let held: { slug: string; t: number; dir: 1 | -1; resolve: () => void } | null = null;
  let heldAmount = 0;
  let lean = 0;
  let leanResolve: (() => void) | null = null;
  let unfolded = -1;
  let shadowsDirty = true;
  const clock = new THREE.Timer();
  let frame = 0;
  let disposed = false;
  let lastDrawn = -Infinity;
  // Frame intervals while the room is drawn every frame, for stepping down.
  const intervals: number[] = [];
  let lastFrame = 0;
  let judgedAt = 0;

  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    clock.update(now);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsed();
    let moving = false;

    // Follow the scroll with a little inertia, like a camera on a dolly.
    const toGo = progress - shown;
    shown += toGo * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(toGo) > 1e-4) moving = true;
    const portrait = width < height;
    camera.fov = portrait ? 46 : 34;
    shotAt(shown, goal);
    if (portrait) {
      // A phone stands further back, except at the letter, which is framed to fit.
      const atLetter = smoothstep(0.2, 0.34, shown) * (1 - smoothstep(0.52, 0.66, shown));
      const away = goal.position.clone().sub(goal.look).normalize();
      goal.position.addScaledVector(away, 0.55 * (height / width - 0.6) * (1 - atLetter));
    }
    const sway = pointerIn && !held ? 1 : 0;
    goal.position.x += pointer.x * 0.035 * sway + Math.sin(time * 0.31) * 0.004;
    goal.position.y += pointer.y * 0.02 * sway + Math.sin(time * 0.47) * 0.003;
    const follow = 1 - Math.exp(-dt * 5);
    if (camera.position.distanceToSquared(goal.position) > 1e-7) moving = true;
    camera.position.lerp(goal.position, follow);
    look.lerp(goal.look, follow);
    if (lean > 0 && held) {
      const pivot = volumes.get(held.slug)!.pivot;
      camera.position.lerp(pivot.position, lean * 0.45);
    }
    camera.lookAt(look);
    camera.updateProjectionMatrix();

    // The letter opens as the camera comes over it.
    const unfold = Math.round(smoothstep(0.18, 0.38, shown) * 1000) / 1000;
    if (unfold !== unfolded) {
      unfolded = unfold;
      theLetter.unfold(unfold);
      shadowsDirty = true;
    }

    // Within reach of the shelf, Oriana's volumes answer the pointer.
    hover = pointerIn ? volumeAt(pointer) : null;
    if (hover !== lastHover) {
      lastHover = hover;
      options.onHover(hover);
    }
    for (const [slug, entry] of volumes) {
      if (held?.slug === slug) continue;
      const target = hover === slug || highlighted === slug ? 1 : 0;
      const before = slide.get(slug) ?? 0;
      const s = Math.abs(target - before) < 0.001 ? target : before + (target - before) * (1 - Math.exp(-dt * 8));
      if (s === before) continue;
      slide.set(slug, s);
      entry.pivot.matrix.copy(entry.home);
      entry.pivot.matrix.decompose(entry.pivot.position, entry.pivot.quaternion, entry.pivot.scale);
      entry.pivot.position.z += s * 0.07;
      entry.pivot.position.y += s * 0.012;
      shadowsDirty = moving = true;
    }

    // A book taken down travels from its place to the hand, turning its cover.
    if (held) {
      held.t = Math.min(1, Math.max(0, held.t + (dt / 1.35) * held.dir));
      const entry = volumes.get(held.slug)!;
      placeHeld(entry, ease(held.t));
      shadowsDirty = moving = true;
      if ((held.dir === 1 && held.t >= 1) || (held.dir === -1 && held.t <= 0)) {
        const done = held.resolve;
        if (held.dir === -1) {
          entry.pivot.matrix.copy(entry.home);
          entry.pivot.matrix.decompose(
            entry.pivot.position,
            entry.pivot.quaternion,
            entry.pivot.scale,
          );
          held = null;
        } else {
          held.resolve = () => undefined;
        }
        done();
      }
    }
    const curtainGoal = held && held.dir === 1 ? 0.78 : 0;
    if (Math.abs(curtainGoal - heldAmount) > 0.001) moving = true;
    heldAmount += (curtainGoal - heldAmount) * (1 - Math.exp(-dt * 4));
    (curtain.material as THREE.MeshBasicMaterial).opacity = heldAmount;
    curtain.visible = heldAmount > 0.003;
    handLight.intensity = heldAmount * 3.2;

    if (leanResolve) {
      moving = true;
      lean = Math.min(1, lean + dt / 0.9);
      if (lean >= 1) {
        leanResolve();
        leanResolve = null;
      }
    }

    // The lamp is switched on as the room appears, catches with a flicker,
    // and then only breathes, a little, as old filaments do.
    const on = ignition(time);
    if (on < 1) moving = true;
    const breath = 0.985 + Math.sin(time * 7.1) * 0.006 + Math.sin(time * 2.3) * 0.009;
    lampLight.intensity = 4.2 * breath * on;
    spill.intensity = 0.55 * on;
    lamp.glow(on);
    if (now - pointerAt < 400) moving = true;

    // At rest, the dust and the lamp's breathing are all that change, and
    // they look the same at half the rate.
    if (!moving && now - lastDrawn < 1000 / IDLE_FPS - 1) return;
    lastDrawn = now;
    judge(now, moving);

    dust.update(time);
    if (focus && tiers[tier].focus) {
      // Shallow focus where it tells: the desk at first, a book in the hand.
      const uniforms = focus.uniforms;
      uniforms.focus.value = camera.position.distanceTo(
        held ? volumes.get(held.slug)!.pivot.position : look,
      );
      const depth =
        0.0105 - smoothstep(0, 0.3, shown) * 0.0055 - smoothstep(0.6, 0.9, shown) * 0.002;
      uniforms.aperture.value = depth + heldAmount * 0.01;
    }
    (grainPass.uniforms as Record<string, THREE.IUniform>)['time'].value = time;
    if (shadowsDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowsDirty = false;
    }
    composer.render();
  };

  /** Steps the quality down when the room cannot keep up. */
  function judge(now: number, everyFrame: boolean) {
    if (everyFrame && lastFrame) intervals.push(now - lastFrame);
    lastFrame = everyFrame ? now : 0;
    if (clock.getElapsed() < 3 || now - judgedAt < 2000 || intervals.length < 60) return;
    judgedAt = now;
    const sorted = [...intervals].sort((a, b) => a - b);
    intervals.length = 0;
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 1000 / FLOOR_FPS && tier < tiers.length - 1) setTier(tier + 1);
  }

  function setTier(next: number) {
    tier = next;
    renderer.setPixelRatio(ratioFor(tier));
    composer.setPixelRatio(ratioFor(tier));
    if (focus) focus.enabled = tiers[tier].focus;
    stage.resize(width, height);
  }

  function volumeAt(ndc: THREE.Vector2): string | null {
    if (shown < 0.8 || held) return null;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(
      [...volumes.values()].map((v) => v.pivot),
      true,
    );
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData['slug']) o = o.parent;
      if (o) return o.userData['slug'] as string;
    }
    return null;
  }

  const heldPose = new THREE.Object3D();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  function placeHeld(entry: { pivot: THREE.Group; home: THREE.Matrix4 }, t: number) {
    entry.home.decompose(startPos, startQuat, new THREE.Vector3());
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    const portrait = width < height;
    const end = camera.position
      .clone()
      .addScaledVector(forward, portrait ? 1.15 : 0.8)
      .addScaledVector(right, portrait ? 0 : -0.15)
      .addScaledVector(camera.up, portrait ? 0.2 : 0);
    heldPose.position.copy(end);
    heldPose.lookAt(camera.position);
    heldPose.quaternion.multiply(turn);
    // Out of the shelf first, then up and round to the hand.
    const control = startPos.clone().add(new THREE.Vector3(0, 0.08, 0.32));
    const a = startPos.clone().lerp(control, t);
    const b = control.clone().lerp(end, t);
    entry.pivot.position.copy(a.lerp(b, t));
    entry.pivot.quaternion.copy(startQuat).slerp(heldPose.quaternion, ease(Math.min(1, t * 1.25)));
    curtain.position.copy(camera.position).addScaledVector(forward, 0.95);
    curtain.quaternion.copy(camera.quaternion);
    handLight.position.copy(camera.position).add(new THREE.Vector3(0.25, 0.35, 0.1));
    handLight.target.position.copy(entry.pivot.position);
  }

  /**
   * How far back to stand from the letter for it to fill the screen, with a
   * margin: its length foreshortened by the angle it is seen at, its width
   * as it is.
   */
  function letterDistance(): number {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tall = LETTER_SIZE.length * LETTER_VIEW.y + 0.03;
    const wide = LETTER_SIZE.width + 0.03;
    return Math.max(tall / (2 * tan * 0.74), wide / (2 * tan * camera.aspect * 0.86));
  }

  const shotA = new THREE.Vector3();
  const shotB = new THREE.Vector3();
  function shotPosition(shot: Shot, out: THREE.Vector3) {
    if (shot.position === 'letter') {
      return out.copy(LETTER_AT).addScaledVector(LETTER_VIEW, letterDistance());
    }
    return out.set(...shot.position);
  }

  function shotAt(p: number, out: { position: THREE.Vector3; look: THREE.Vector3 }) {
    let i = 0;
    while (i < SHOTS.length - 2 && p > SHOTS[i + 1].at) i++;
    const a = SHOTS[i];
    const b = SHOTS[i + 1];
    const t = ease(Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at))));
    out.position.copy(shotPosition(a, shotA)).lerp(shotPosition(b, shotB), t);
    out.look.set(...a.look).lerp(shotB.set(...b.look), t);
  }

  const stage: Stage = {
    setProgress(p, immediate = false) {
      progress = Math.min(1, Math.max(0, p));
      if (immediate) {
        shown = progress;
        shotAt(shown, goal);
        camera.position.copy(goal.position);
        look.copy(goal.look);
      }
    },
    setPointer(x, y) {
      pointerIn = x !== null;
      if (x !== null) pointer.set(x, y);
      pointerAt = performance.now();
    },
    hovered: () => hover,
    pick: (x, y) => volumeAt(new THREE.Vector2(x, y)),
    highlight(slug) {
      highlighted = slug;
    },
    takeDown(slug) {
      if (held || !volumes.has(slug)) return Promise.resolve();
      slide.set(slug, 0);
      return new Promise((resolve) => {
        held = { slug, t: 0, dir: 1, resolve };
      });
    },
    putBack() {
      if (!held) return Promise.resolve();
      lean = 0;
      return new Promise((resolve) => {
        held!.dir = -1;
        held!.resolve = resolve;
      });
    },
    leanIn() {
      return new Promise((resolve) => (leanResolve = resolve));
    },
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      lastDrawn = -Infinity;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      composer.dispose();
      pmrem.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const m of materials) {
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };

  stage.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
  shotAt(0, goal);
  camera.position.copy(goal.position);
  look.copy(goal.look);
  camera.lookAt(look);

  // Shaders are compiled before the first frame, in parallel where the
  // browser allows, so the room does not stutter as it appears.
  await renderer.compileAsync(scene, camera);
  report(1);
  frame = requestAnimationFrame(tick);
  (globalThis as any).__PERF = { renderer, composer, tier: () => tier }; // TEMP: measurement
  return stage;
}

/** A tall lancet window: frame, mullions, and the night beyond leaded glass. */
function gothicWindow(at: THREE.Vector3, wood: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const width = 1.1;
  const height = 2.3;
  const sill = 0.55;
  const shape = new THREE.Shape();
  const r = width / 2;
  shape.moveTo(-r, 0);
  shape.lineTo(-r, height - r);
  shape.absarc(0, height - r, r, Math.PI, 0, true);
  shape.lineTo(r, 0);
  shape.lineTo(-r, 0);
  const glassGeometry = new THREE.ShapeGeometry(shape, 32);
  // UVs from position, so the night fills the arch.
  const pos = glassGeometry.attributes['position'];
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + r) / width;
    uv[i * 2 + 1] = pos.getY(i) / height;
  }
  glassGeometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const night = new THREE.Mesh(
    glassGeometry,
    new THREE.MeshBasicMaterial({ map: nightSky(), fog: false }),
  );
  night.position.set(0, sill, 0);
  group.add(night);
  // Stone reveal around the opening, mullions and a transom: one mesh.
  const frame = new THREE.ExtrudeGeometry(outline(shape, 0.08), {
    depth: 0.18,
    bevelEnabled: false,
    curveSegments: 32,
  }).translate(0, sill, -0.02);
  const bars = [
    ...[-r / 3, r / 3].map((x) =>
      new THREE.BoxGeometry(0.035, height - r * 0.6, 0.05).translate(
        x,
        sill + (height - r * 0.6) / 2,
        0.03,
      ),
    ),
    new THREE.BoxGeometry(width, 0.035, 0.05).translate(0, sill + height * 0.42, 0.03),
  ];
  const tracery = new THREE.Mesh(
    mergeGeometries([frame, ...bars].map((g) => (g.index ? g.toNonIndexed() : g)))!,
    wood,
  );
  tracery.castShadow = true;
  group.add(tracery);
  group.position.copy(at);
  return group;
}

function outline(shape: THREE.Shape, margin: number): THREE.Shape {
  const points = shape.getPoints(64);
  const outer = new THREE.Shape();
  const box = new THREE.Box2().setFromPoints(points);
  outer.moveTo(box.min.x - margin, box.min.y - margin);
  outer.lineTo(box.max.x + margin, box.min.y - margin);
  outer.lineTo(box.max.x + margin, box.max.y + margin);
  outer.lineTo(box.min.x - margin, box.max.y + margin);
  outer.holes.push(new THREE.Path(points));
  return outer;
}

function nightSky(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, '#0a1430');
  sky.addColorStop(0.6, '#16264a');
  sky.addColorStop(1, '#1d2d4f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 1024);
  const rand = mulberry(77);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(245, 238, 220, ${0.3 + rand() * 0.7})`;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 700, rand() * 1.6 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const halo = ctx.createRadialGradient(360, 230, 0, 360, 230, 170);
  halo.addColorStop(0, 'rgba(220, 230, 255, 0.55)');
  halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 512, 1024);
  ctx.fillStyle = '#f2ead2';
  ctx.beginPath();
  ctx.arc(360, 230, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#122244';
  ctx.beginPath();
  ctx.arc(378, 218, 42, 0, Math.PI * 2);
  ctx.fill();
  // Diamond quarries of lead.
  ctx.strokeStyle = 'rgba(8, 6, 4, 0.85)';
  ctx.lineWidth = 3;
  for (let i = -20; i < 40; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 46, 0);
    ctx.lineTo(i * 46 + 1024 * 0.66, 1024);
    ctx.moveTo(i * 46, 0);
    ctx.lineTo(i * 46 - 1024 * 0.66, 1024);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dust drifting in the lamp's light; brightest inside its cone. */
function motes(count: number, sprite: THREE.Texture, lamp: THREE.Vector3) {
  const rand = mulberry(5);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rand() - 0.5) * 2.6;
    positions[i * 3 + 1] = 0.7 + rand() * 1.4;
    positions[i * 3 + 2] = -1 + rand() * 2.4;
    seeds[i] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sprite: { value: sprite },
      lamp: { value: lamp },
      pixel: { value: Math.min(devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time;
      uniform vec3 lamp;
      uniform float pixel;
      varying float vLight;
      void main() {
        vec3 p = position;
        float t = time * (0.02 + seed * 0.03);
        p.x += sin(t * 6.0 + seed * 40.0) * 0.06;
        p.z += cos(t * 5.0 + seed * 23.0) * 0.06;
        p.y = 0.7 + mod(p.y - 0.7 + t * 0.6, 1.4);
        vec3 toLamp = p - lamp;
        float below = clamp(-toLamp.y / (length(toLamp) + 1e-4), 0.0, 1.0);
        vLight = 0.08 + smoothstep(0.55, 0.95, below) * (1.0 - smoothstep(0.2, 1.1, length(toLamp))) * 1.4;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = (1.6 + seed * 2.8) * pixel * (2.2 / -view.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D sprite;
      varying float vLight;
      void main() {
        float a = texture2D(sprite, gl_PointCoord).a;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * vLight, a * vLight);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, update: (time: number) => (material.uniforms['time'].value = time) };
}

/** Film grain and a soft vignette, applied after tone mapping. */
const FILM = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      float grain = hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5;
      colour.rgb += grain * 0.045;
      vec2 c = vUv - 0.5;
      float vignette = smoothstep(0.85, 0.25, length(c * vec2(1.0, 1.15)));
      colour.rgb *= mix(0.42, 1.0, vignette);
      gl_FragColor = colour;
    }
  `,
};

/** A lamp being switched on: dark, two stutters, then steady. */
function ignition(time: number): number {
  const t = time - 0.6;
  if (t < 0) return 0;
  if (t < 0.08) return 0.7;
  if (t < 0.18) return 0.05;
  if (t < 0.26) return 0.9;
  if (t < 0.34) return 0.25;
  return Math.min(1, 0.6 + (t - 0.34) * 1.6);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
