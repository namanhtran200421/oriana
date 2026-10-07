import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { StoryEntry } from '../../../core/story';
import { B, BlockId, atlas } from '../../../voxel/blocks';
import { Micro } from '../../../voxel/micro';
import { lantern } from '../../../voxel/models';
import { bush, cherry, grassAt } from '../../../voxel/nature';
import { mulberry } from '../../../voxel/noise';
import { drift } from '../../../voxel/particles';
import { disposeScene, smoothstep } from '../../../voxel/scene';
import { createLook, modelMaterial } from '../../../voxel/shading';
import { createClouds, createSky } from '../../../voxel/sky';
import { Volume } from '../../../voxel/volume';
import {
  bookPile,
  casementFrame,
  casementGlass,
  desk,
  flames,
  herBook,
  inkwell,
  logs,
  plainBook,
  ribbon,
  sleepingCat,
} from './room-models';

export interface StageVolume {
  story: StoryEntry;
  volume: number;
  roman: string;
  finished: boolean;
  reading: boolean;
}

/** Things in the room that answer a touch: the desk's, and the tall window. */
export type Prop = 'lamp' | 'inkwell' | 'pile' | 'window';

/** The note on the desk. */
export interface NoteText {
  label: string;
  heading: string;
  paragraphs: readonly string[];
  signature: string;
}

export interface StageOptions {
  volumes: StageVolume[];
  volumeLabel: string;
  note: NoteText;
  /** Phones and small GPUs: fewer pixels, fewer motes. */
  lite: boolean;
  onHover: (slug: string | null) => void;
  /** Something on the desk has come under the pointer, or left it. */
  onProp?: (prop: Prop | null) => void;
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
  /** The thing on the desk at a point in normalised device coordinates, if any. */
  pickProp(x: number, y: number): Prop | null;
  /** Puts the desk lantern out, or lights it again; returns whether it is now lit. */
  toggleLamp(): boolean;
  lampOn(): boolean;
  /** Gives something on the desk a little jolt: the inkwell rocks, the top book hops. */
  nudge(prop: 'inkwell' | 'pile'): void;
  /**
   * Turns to the tall window, throws it open, and flies out through it.
   * Resolves as the night outside fills the view.
   */
  throughWindow(): Promise<void>;
  takeDown(slug: string): Promise<void>;
  putBack(): Promise<void>;
  /** Leans in towards the held book, for the moment before reading. */
  leanIn(): Promise<void>;
  /** Stops drawing while something covers the room, and starts again. */
  setPaused(paused: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// The room, in blocks: x across, y up, z toward the camera at the start.
// The floor's top is y = 0; the shelf wall stands at z = -9.
// ---------------------------------------------------------------------------

/** Model cells: eighths of a block for the desk, sixteenths for what is on it. */
const EIGHTH = 1 / 8;
const SIXTEENTH = 1 / 16;
/** The desk's wooden top, and the blotter on it. */
const DESK_WOOD = 10 * EIGHTH;
const DESK_TOP = 11 * EIGHTH;
const DESK = new THREE.Vector3(0.5, 0, 2);
/** Where the note lies on the desk, and how big it is. */
const LETTER_AT = new THREE.Vector3(0.35, DESK_TOP + 0.01, 2.35);
const LETTER_SIZE = { width: 1.05, length: 1.4 };
/** Where the camera looks at the letter from: above it, and back toward her. */
const LETTER_VIEW = new THREE.Vector3(0, 0.82, 0.57).normalize();
const LAMP_AT = new THREE.Vector3(-1.45, DESK_WOOD, 1.55);
const INK_AT = new THREE.Vector3(2.05, DESK_WOOD, 1.45);
const PILE_AT = new THREE.Vector3(2.35, DESK_WOOD, 2.5);
/** The nook in the shelves where her books stand. */
const NOOK = new THREE.Vector3(0.5, 2, -8.35);

interface Shot {
  at: number;
  position: [number, number, number] | 'letter';
  look: [number, number, number];
}

const SHOTS: Shot[] = [
  { at: 0, position: [1.9, 4.5, 10.2], look: [0, 1.5, -1.5] },
  { at: 0.16, position: [1.3, 3.6, 6.6], look: [0.35, 1.3, 1.6] },
  { at: 0.34, position: 'letter', look: [LETTER_AT.x, LETTER_AT.y, LETTER_AT.z] },
  { at: 0.52, position: 'letter', look: [LETTER_AT.x, LETTER_AT.y, LETTER_AT.z] },
  { at: 0.7, position: [0.5, 3.4, 2.6], look: [0.5, 2.9, -9] },
  { at: 0.86, position: [0.5, 3.05, -2.4], look: [0.5, 2.8, -9] },
  { at: 1, position: [0.5, 3.05, -2.8], look: [0.5, 2.8, -9] },
];

/** The tall window in the left wall, and the way out through it. */
const WINDOW = { x: -8, z0: -4, z1: -2, y0: 1, y1: 5 };
const WINDOW_CENTRE = new THREE.Vector3(-8, 3.1, -3);
const WINDOW_FRONT = new THREE.Vector3(-4.4, 3.1, -2.7);
const BEYOND = new THREE.Vector3(-12.5, 3.9, -3.1);
const BEYOND_LOOK = new THREE.Vector3(-32, 7, -4);
/** Seconds: turning to the window, its opening, and the flight out. */
const FLIGHT = { turn: 1.8, open: [1.1, 2.2], out: [2.0, 3.7], done: 3.8 } as const;

const TIERS = { full: [2, 1.5, 1.25, 1], lite: [1.5, 1.25, 1] };
const FLOOR_FPS = 45;
const IDLE_FPS = 30;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export async function createStage(
  canvas: HTMLCanvasElement,
  options: StageOptions,
): Promise<Stage> {
  const report = options.onProgress ?? (() => undefined);
  const lite = options.lite;
  report(0.05);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const tiers = lite ? TIERS.lite : TIERS.full;
  let tier = 0;
  const ratio = () => Math.min(devicePixelRatio || 1, tiers[tier]);
  renderer.setPixelRatio(ratio());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 600);
  const tiles = atlas();
  const look = createLook({
    sky: '#7f8dca',
    glow: '#ffb45e',
    ambient: 0.07,
    daylight: 0.1,
    fog: '#151b36',
    fogNear: 26,
    fogFar: 70,
    wind: 0.5,
  });
  report(0.15);

  // --- The blocks ---------------------------------------------------------
  const volume = new Volume(38, 17, 26, new THREE.Vector3(-22, -3, -13));
  const o = volume.origin;
  const set = (x: number, y: number, z: number, id: BlockId) =>
    volume.set(x - o.x, y - o.y, z - o.z, id);
  const fill = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: BlockId,
  ) => volume.fill(x0 - o.x, y0 - o.y, z0 - o.z, x1 - o.x, y1 - o.y, z1 - o.z, id);
  const lampCell = (p: THREE.Vector3) =>
    [Math.floor(p.x) - o.x, Math.floor(p.y) - o.y, Math.floor(p.z) - o.z] as const;
  const rand = mulberry(5);

  // The garden outside the window: grass, flowers, a cherry tree.
  fill(-22, -3, -13, 15, -3, 12, B.Stone);
  fill(-22, -2, -13, -9, -2, 12, B.Grass);
  for (let z = -12; z <= 11; z++) {
    for (let x = -21; x <= -10; x++) {
      const roll = rand();
      if (roll < 0.12)
        set(x, -1, z, [B.Rose, B.Cornflower, B.Allium, B.Daisy][Math.floor(rand() * 4)]);
      else if (roll < 0.45) set(x, -1, z, B.Tuft);
    }
  }
  {
    // Off to one side, so the way out of the window is clear.
    const vx = -15 - o.x;
    const vz = 5 - o.z;
    const y = grassAt(volume, vx, vz);
    if (y >= 0) {
      volume.set(vx, y + 1, vz, B.Air);
      cherry(volume, vx, y + 1, vz, rand);
    }
    for (const [bx, bz] of [
      [-11, 2],
      [-12, -11],
      [-19, 4],
    ]) {
      const by = grassAt(volume, bx - o.x, bz - o.z);
      if (by >= 0) bush(volume, bx - o.x, by + 1, bz - o.z, B.OakLeaves, rand);
    }
  }

  // The house: a stone footing, plank walls between log posts, a plank ceiling.
  fill(-8, -2, -10, 8, -1, 11, B.Cobble);
  fill(-8, 0, -10, 8, 9, 11, B.SprucePlanks);
  fill(-7, 0, -8, 7, 8, 10, B.Air);
  fill(-8, 0, -10, 8, 0, 11, B.StoneBricks);
  fill(-7, 0, -8, 7, 0, 10, B.Air);
  for (const [x, z] of [
    [-8, -9],
    [8, -9],
    [-8, 11],
    [8, 11],
    [-8, -5],
    [-8, -1],
    [-8, 6],
    [8, -6],
    [8, 0],
    [8, 6],
  ]) {
    fill(x, 0, z, x, 9, z, B.SpruceLog);
  }
  // The floor: spruce boards, a burgundy rug with a cream border.
  fill(-7, -1, -8, 7, -1, 10, B.SprucePlanks);
  fill(-4, -1, -6, 4, -1, 6, B.WoolCream);
  fill(-3, -1, -5, 3, -1, 5, B.WoolBurgundy);
  // Beams across the ceiling.
  for (const z of [-5, 1, 7]) fill(-7, 8, z, 7, 8, z, B.SpruceLog);

  // The shelf wall: bookshelves floor to beam, two log pillars, the nook for her books.
  fill(-7, 0, -9, 7, 6, -9, B.Bookshelf);
  fill(-7, 7, -9, 7, 7, -9, B.SprucePlanks);
  for (const x of [-4, 5]) fill(x, 0, -9, x, 7, -9, B.SpruceLog);
  fill(-1, 2, -9, 1, 3, -9, B.Air);
  fill(-1, 1, -9, 1, 1, -9, B.SprucePlanks);
  fill(-1, 4, -9, 1, 4, -9, B.SprucePlanks);

  // The left wall: low shelves, and the tall window with a sill and a lintel.
  fill(-8, 1, 0, -8, 3, 5, B.Bookshelf);
  fill(-8, 1, 7, -8, 3, 10, B.Bookshelf);
  fill(-8, 1, -8, -8, 3, -6, B.Bookshelf);
  fill(WINDOW.x, WINDOW.y0, WINDOW.z0, WINDOW.x, WINDOW.y1 - 1, WINDOW.z1 - 1, B.Air);
  fill(WINDOW.x, WINDOW.y0 - 1, WINDOW.z0, WINDOW.x, WINDOW.y0 - 1, WINDOW.z1 - 1, B.OakPlanks);
  fill(WINDOW.x, WINDOW.y1, WINDOW.z0 - 1, WINDOW.x, WINDOW.y1, WINDOW.z1, B.SpruceLog);

  // The right wall: the fireplace, and shelves either side of it.
  fill(8, 1, -8, 8, 4, -7, B.Bookshelf);
  fill(8, 1, 1, 8, 4, 5, B.Bookshelf);
  fill(8, 1, 7, 8, 4, 10, B.Bookshelf);
  fill(6, 0, -5, 7, 3, -1, B.Bricks);
  fill(6, 0, -4, 7, 1, -2, B.Air);
  fill(5, -1, -5, 7, -1, -1, B.StoneBricks);
  fill(5, 2, -5, 5, 2, -1, B.SprucePlanks);
  fill(6, 4, -4, 7, 8, -2, B.Bricks);
  fill(8, 0, -4, 8, 9, -2, B.Bricks);

  // The front wall, behind her as she comes in: shelves either side of the door.
  fill(-7, 1, 11, -2, 4, 11, B.Bookshelf);
  fill(3, 1, 11, 7, 4, 11, B.Bookshelf);

  // Light: lanterns from the beams, the fire, and the lamp on the desk.
  const hanging = [
    new THREE.Vector3(-3.5, 6.6, -5),
    new THREE.Vector3(4.5, 6.6, -5),
    new THREE.Vector3(-2.5, 6.6, 1),
    new THREE.Vector3(3.5, 6.6, 7),
  ];
  for (const at of hanging) volume.lamp(...lampCell(at), 13);
  const fireAt = new THREE.Vector3(7, 0, -2.5);
  volume.lamp(...lampCell(fireAt), 14);
  // A warm glow in the nook, on her books.
  volume.lamp(...lampCell(new THREE.Vector3(0.5, 3.5, -8.5)), 12);
  const deskLampCell = lampCell(LAMP_AT.clone().add(new THREE.Vector3(0, 0.4, 0)));
  volume.lamp(...deskLampCell, 14);
  volume.light();
  report(0.4);

  let blocks = volume.mesh({ look, atlas: tiles, walls: true });
  scene.add(blocks);
  report(0.6);

  // --- The sky beyond the window --------------------------------------------
  const sky = createSky({
    zenith: '#070b24',
    horizon: '#25336b',
    below: '#151b36',
    moon: { direction: new THREE.Vector3(-1, 0.34, -0.22), size: 0.12 },
    glow: { colour: '#4c62b8', strength: 0.5 },
    stars: { count: lite ? 700 : 1300 },
  });
  scene.add(sky.group);
  const clouds = createClouds({
    altitude: 34,
    cell: 10,
    thickness: 3,
    cover: 0.3,
    colour: '#5c6aa6',
    shadow: '#323c70',
    opacity: 0.55,
    speed: 0.4,
    reach: 200,
    seed: 21,
  });
  scene.add(clouds.group);

  // --- The things in the room -----------------------------------------------
  const lightAt = (p: THREE.Vector3) => volume.brightnessAt(p) as [number, number];
  const model = (
    micro: Micro,
    scale: number,
    at: THREE.Vector3,
    centre?: THREE.Vector3Like,
    shine?: number,
  ) => {
    const mesh = new THREE.Mesh(
      micro.geometry(scale, centre ? { centre } : {}),
      modelMaterial(look, { light: lightAt(at.clone().add(new THREE.Vector3(0, 0.3, 0))), shine }),
    );
    mesh.position.copy(at);
    return mesh;
  };

  const theDesk = model(desk(), EIGHTH, DESK);
  scene.add(theDesk);

  // The lamp: a lantern on the desk.
  const lamp = model(lantern(), SIXTEENTH, LAMP_AT, undefined, 1.6);
  lamp.userData['prop'] = 'lamp';
  scene.add(lamp);
  const lampShine = (lamp.material as THREE.ShaderMaterial).uniforms['shine'];

  const ink = model(inkwell(), 1 / 24, INK_AT);
  ink.userData['prop'] = 'inkwell';
  ink.rotation.y = -0.4;
  scene.add(ink);

  const pile = new THREE.Group();
  pile.position.copy(PILE_AT);
  pile.rotation.y = 0.35;
  pile.userData['prop'] = 'pile';
  const pileModel = model(bookPile(), 1 / 22, new THREE.Vector3());
  (pileModel.material as THREE.ShaderMaterial).uniforms['light'].value.set(...lightAt(PILE_AT));
  pile.add(pileModel);
  scene.add(pile);

  // Hanging lanterns, the fire, a cat asleep by it.
  for (const at of hanging) {
    const hung = model(lantern(), SIXTEENTH * 1.3, at, undefined, 1.6);
    scene.add(hung);
    const chain = new THREE.Mesh(
      new Micro().box(0, 0, 0, 0, 12, 0, '#3b3a40').geometry(SIXTEENTH),
      modelMaterial(look, { light: lightAt(at) }),
    );
    chain.position.set(at.x, at.y + 10 * SIXTEENTH * 1.3, at.z);
    scene.add(chain);
  }
  const fire = model(
    flames(),
    SIXTEENTH,
    fireAt.clone().add(new THREE.Vector3(0, 0.12, 0)),
    undefined,
    1.5,
  );
  scene.add(fire, model(logs(), SIXTEENTH, fireAt));
  const cat = model(sleepingCat(), 1 / 12, new THREE.Vector3(3.8, 0, -2.6));
  cat.rotation.y = Math.PI;
  scene.add(cat);

  // The window's two casements, hinged at their outer edges, swinging out.
  const glassMaterial = modelMaterial(look, { light: [0.9, 0.2], opacity: 0.28 });
  glassMaterial.depthWrite = false;
  const frameGeometry = casementFrame().geometry(SIXTEENTH, { centre: { x: 0, y: 0, z: 1 } });
  const glassGeometry = casementGlass().geometry(SIXTEENTH, { centre: { x: 0, y: 0, z: 0.5 } });
  const windowGroup = new THREE.Group();
  windowGroup.userData['prop'] = 'window';
  const frameMaterial = modelMaterial(look, { light: [0.55, 0.2] });
  const casements = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    // Hinged on the wall's inner face, at either end of the opening.
    hinge.position.set(WINDOW.x + 0.85, WINDOW.y0, side < 0 ? WINDOW.z1 : WINDOW.z0);
    const leaf = new THREE.Group();
    leaf.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    const pane = new THREE.Mesh(glassGeometry, glassMaterial);
    pane.renderOrder = 3;
    leaf.add(frame, pane);
    hinge.add(leaf);
    windowGroup.add(hinge);
    return { hinge, side };
  });
  scene.add(windowGroup);
  // A touch area for the window as a whole.
  const windowTouch = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, WINDOW.y1 - WINDOW.y0, WINDOW.z1 - WINDOW.z0),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  windowTouch.position.set(
    WINDOW.x + 0.8,
    (WINDOW.y0 + WINDOW.y1) / 2,
    (WINDOW.z0 + WINDOW.z1) / 2,
  );
  windowGroup.add(windowTouch);

  // --- The letter -------------------------------------------------------------
  const theLetter = await letter(options.note, lightAt(LETTER_AT));
  theLetter.group.position.copy(LETTER_AT);
  scene.add(theLetter.group);
  report(0.8);

  // --- Her books, in the nook ---------------------------------------------------
  interface Shelved {
    slug: string;
    pivot: THREE.Group;
    home: THREE.Matrix4;
    light: THREE.Vector2;
  }
  const shelved = new Map<string, Shelved>();
  const leathers = ['#8b1e2e', '#2d4a8c', '#3d6b3a', '#6b3d7a'];
  const nookLight = lightAt(NOOK.clone().add(new THREE.Vector3(0, 0.6, 0.6)));
  const count = options.volumes.length;
  options.volumes.forEach((v, i) => {
    const pivot = new THREE.Group();
    const offset = (i - (count - 1) / 2) * 0.85;
    pivot.position.set(NOOK.x + offset, NOOK.y, NOOK.z);
    pivot.userData['slug'] = v.story.slug;
    const bookMaterial = modelMaterial(look, { light: nookLight, shine: 1.4 });
    const book = new THREE.Mesh(
      herBook(leathers[i % leathers.length]).geometry(1 / 12, { centre: { x: 0.5, y: 0, z: 0.5 } }),
      bookMaterial,
    );
    pivot.add(book);
    pivot.add(spineLabel(v, nookLight));
    if (v.reading) {
      const mark = model(ribbon(), 1 / 12, new THREE.Vector3(0.1, 20 / 12, 0.2));
      pivot.add(mark);
    }
    scene.add(pivot);
    pivot.updateMatrix();
    shelved.set(v.story.slug, {
      slug: v.story.slug,
      pivot,
      home: pivot.matrix.clone(),
      light: bookMaterial.uniforms['light'].value,
    });
  });
  // Old books either side, for company, one leaning.
  for (const [x, lean, colour, tall] of [
    [-0.75, 0, '#3d5a8c', 15],
    [-0.45, 0, '#6b5a2a', 13],
    [1.42, 0, '#3d6b3a', 14],
    [1.78, -0.32, '#5a3d6b', 15],
  ] as const) {
    if (Math.abs(x - NOOK.x) < (count * 0.85) / 2 + 0.05) continue;
    const old = model(
      plainBook(colour, tall),
      SIXTEENTH,
      new THREE.Vector3(x, NOOK.y, NOOK.z - 0.05),
    );
    old.rotation.z = lean;
    scene.add(old);
  }

  // A held book is lit against a darkened room.
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({
      color: '#0b0812',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  curtain.renderOrder = 5;
  curtain.visible = false;
  scene.add(curtain);

  // --- Motes, embers, a shimmer round her book, fireflies outside -----------
  const dust = drift(look, {
    count: lite ? 40 : 80,
    centre: new THREE.Vector3(0, 3.5, 1),
    extent: new THREE.Vector3(6.5, 3.5, 8.5),
    colours: ['#d9b47a', '#e8c99a', '#c9a06a'],
    size: [0.02, 0.035],
    rise: 0.03,
    wobble: 0.5,
    brightness: 0.75,
  });
  const embers = drift(look, {
    count: lite ? 16 : 30,
    centre: new THREE.Vector3(6.8, 1.6, -3),
    extent: new THREE.Vector3(0.6, 1.6, 1.2),
    colours: ['#ffb347', '#ff7a2a', '#ffe08a'],
    size: [0.04, 0.07],
    rise: 0.7,
    wobble: 0.25,
    brightness: 1.6,
    seed: 4,
  });
  const shimmer = drift(look, {
    count: 26,
    centre: new THREE.Vector3(NOOK.x, NOOK.y + 1, NOOK.z + 0.4),
    extent: new THREE.Vector3(1.1, 1, 0.5),
    colours: ['#d9a6ff', '#ffb3e6', '#fff0ff'],
    size: [0.06, 0.1],
    shape: 'sparkle',
    rise: 0.15,
    wobble: 0.2,
    brightness: 1.4,
    blink: true,
    seed: 6,
  });
  const fireflies = drift(look, {
    count: lite ? 30 : 60,
    centre: new THREE.Vector3(-15, 1.5, -3),
    extent: new THREE.Vector3(6, 1.6, 8),
    colours: ['#d8ff7a', '#fff2a0'],
    size: [0.07, 0.1],
    rise: 0.05,
    wobble: 1,
    brightness: 1.8,
    blink: true,
    seed: 2,
  });
  scene.add(dust.points, embers.points, shimmer.points, fireflies.points);
  report(0.9);

  // --- Drawing ------------------------------------------------------------------
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: lite ? 2 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(VIGNETTE));
  await renderer.compileAsync(scene, camera);
  report(1);

  // --- The walk, and everything that answers a touch ------------------------------
  let width = 1;
  let height = 1;
  let progress = 0;
  let shown = 0;
  const pointer = new THREE.Vector2();
  let pointerIn = false;
  let pointerAt = -Infinity;
  const aim = new THREE.Vector3();
  const goal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  const raycaster = new THREE.Raycaster();
  let hover: string | null = null;
  let lastHover: string | null = null;
  let lastProp: Prop | null = null;
  let aimDirty = false;
  let highlighted: string | null = null;
  const pivots = [...shelved.values()].map((s) => s.pivot);
  const propTargets: THREE.Object3D[] = [lamp, ink, pile, windowGroup];
  let flight: {
    t: number;
    from: THREE.Vector3;
    look: THREE.Vector3;
    resolve: (() => void) | null;
  } | null = null;
  let windowOpen = 0;
  let lampOn = true;
  let lampLevel = 1;
  let inkAt = -Infinity;
  let pileAt = -Infinity;
  const slide = new Map<string, number>();
  let held: { slug: string; t: number; dir: 1 | -1; resolve: () => void } | null = null;
  let heldAmount = 0;
  let lean = 0;
  let leanResolve: (() => void) | null = null;
  const clock = new THREE.Timer();
  let frame = 0;
  let disposed = false;
  let paused = false;
  let lastDrawn = -Infinity;
  const intervals: number[] = [];
  let lastFrame = 0;
  let judgedAt = 0;
  const away = new THREE.Vector3();

  /** Lights the room again with the desk lantern lit or out: re-meshed, as blocks are lit once. */
  function relight() {
    volume.lamp(...deskLampCell, lampOn ? 14 : 0);
    volume.light();
    const next = volume.mesh({
      look,
      atlas: tiles,
      walls: true,
      materials: blocks.userData['materials'],
    });
    scene.remove(blocks);
    blocks.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    blocks = next;
    scene.add(blocks);
    // The things on the desk, too.
    for (const thing of [theDesk, ink, pileModel, cat]) {
      const at = new THREE.Vector3();
      thing.getWorldPosition(at);
      (thing.material as THREE.ShaderMaterial).uniforms['light'].value.set(
        ...lightAt(at.add(new THREE.Vector3(0, 0.3, 0))),
      );
    }
    theLetter.light(lightAt(LETTER_AT));
  }

  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    clock.update(now);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsed();
    let moving = false;

    const toGo = progress - shown;
    shown += toGo * (1 - Math.exp(-dt * 3.2));
    const travelling = Math.abs(toGo) > 1e-4;
    if (travelling) moving = true;
    const portrait = width < height;
    const fov = portrait ? 58 : 46;
    if (!flight && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    shotAt(shown, goal);
    if (portrait) {
      // A phone stands further back, except over the letter, which is framed to fit.
      const atLetter = smoothstep(0.2, 0.34, shown) * (1 - smoothstep(0.52, 0.66, shown));
      away.copy(goal.position).sub(goal.look).normalize();
      goal.position.addScaledVector(away, 0.9 * (height / width - 0.6) * (1 - atLetter));
    }
    const sway = pointerIn && !held ? 1 : 0;
    goal.position.x += pointer.x * 0.12 * sway + Math.sin(time * 0.31) * 0.012;
    goal.position.y += pointer.y * 0.07 * sway + Math.sin(time * 0.47) * 0.01;

    if (flight) {
      flight.t += dt;
      const t = flight.t;
      const toFront = ease(Math.min(1, t / FLIGHT.turn));
      const out = ease(smoothstep(FLIGHT.out[0], FLIGHT.out[1], t));
      camera.position.copy(flight.from).lerp(WINDOW_FRONT, toFront).lerp(BEYOND, out);
      aim.copy(flight.look).lerp(WINDOW_CENTRE, toFront).lerp(BEYOND_LOOK, out);
      camera.fov = fov + out * 12;
      camera.updateProjectionMatrix();
      windowOpen = smoothstep(FLIGHT.open[0], FLIGHT.open[1], t);
      moving = true;
      if (t >= FLIGHT.done && flight.resolve) {
        const done = flight.resolve;
        flight.resolve = null;
        done();
      }
    } else {
      const follow = 1 - Math.exp(-dt * 5);
      if (camera.position.distanceToSquared(goal.position) > 1e-7) moving = true;
      camera.position.lerp(goal.position, follow);
      aim.lerp(goal.look, follow);
      if (lean > 0 && held)
        camera.position.lerp(shelved.get(held.slug)!.pivot.position, lean * 0.5);
    }
    camera.lookAt(aim);
    for (const c of casements) c.hinge.rotation.y = c.side * -windowOpen * 1.75;

    theLetter.unfold(smoothstep(0.16, 0.36, shown));

    if (aimDirty || travelling) {
      aimDirty = false;
      hover = pointerIn ? volumeAt(pointer) : null;
      const prop = pointerIn && !hover ? propAt(pointer) : null;
      if (hover !== lastHover) {
        lastHover = hover;
        options.onHover(hover);
      }
      if (prop !== lastProp) {
        lastProp = prop;
        options.onProp?.(prop);
      }
    }
    for (const [slug, entry] of shelved) {
      if (held?.slug === slug) continue;
      const want = hover === slug || highlighted === slug ? 1 : 0;
      const before = slide.get(slug) ?? 0;
      const s =
        Math.abs(want - before) < 0.001 ? want : before + (want - before) * (1 - Math.exp(-dt * 8));
      if (s === before) continue;
      slide.set(slug, s);
      entry.home.decompose(entry.pivot.position, entry.pivot.quaternion, entry.pivot.scale);
      entry.pivot.position.z += s * 0.35;
      entry.pivot.position.y += s * 0.06;
      moving = true;
    }

    if (held) {
      held.t = Math.min(1, Math.max(0, held.t + (dt / 1.3) * held.dir));
      const entry = shelved.get(held.slug)!;
      placeHeld(entry, ease(held.t));
      moving = true;
      if ((held.dir === 1 && held.t >= 1) || (held.dir === -1 && held.t <= 0)) {
        const done = held.resolve;
        if (held.dir === -1) {
          entry.home.decompose(entry.pivot.position, entry.pivot.quaternion, entry.pivot.scale);
          held = null;
          aimDirty = true;
        } else {
          held.resolve = () => undefined;
        }
        done();
      }
    }
    const curtainGoal = held && held.dir === 1 ? 0.72 : 0;
    if (Math.abs(curtainGoal - heldAmount) > 0.001) moving = true;
    heldAmount += (curtainGoal - heldAmount) * (1 - Math.exp(-dt * 4));
    (curtain.material as THREE.MeshBasicMaterial).opacity = heldAmount;
    curtain.visible = heldAmount > 0.003;

    if (leanResolve) {
      moving = true;
      lean = Math.min(1, lean + dt / 0.9);
      if (lean >= 1) {
        leanResolve();
        leanResolve = null;
      }
    }

    // The lantern: lit, it breathes; put out, its glow dies away.
    const lampGoal = lampOn ? 1 : 0;
    if (Math.abs(lampGoal - lampLevel) > 0.002) moving = true;
    lampLevel += (lampGoal - lampLevel) * (1 - Math.exp(-dt * 10));
    lampShine.value = 0.25 + lampLevel * (1.35 + Math.sin(time * 6.3) * 0.05);

    // The inkwell rocks; the top book of the pile hops and spins.
    const sinceInk = time - inkAt;
    if (sinceInk < 1.2) {
      const fade = 1 - sinceInk / 1.2;
      ink.rotation.set(
        Math.cos(sinceInk * 17) * 0.08 * fade,
        -0.4,
        Math.sin(sinceInk * 22) * 0.18 * fade,
      );
      moving = true;
    } else if (ink.rotation.z !== 0) ink.rotation.set(0, -0.4, 0);
    const sincePile = time - pileAt;
    if (sincePile < 1) {
      pile.position.y = PILE_AT.y + Math.sin(Math.PI * sincePile) * 0.3;
      pile.rotation.y = 0.35 + ease(sincePile) * Math.PI * 2;
      moving = true;
    } else if (pile.position.y !== PILE_AT.y) {
      pile.position.y = PILE_AT.y;
      pile.rotation.y = 0.35;
    }

    // The fire flickers; the cat breathes.
    fire.scale.set(1 + Math.sin(time * 9) * 0.05, 1 + Math.sin(time * 13 + 1) * 0.1, 1);
    cat.scale.y = 1 + Math.sin(time * 1.6) * 0.025;
    if (now - pointerAt < 400) moving = true;

    if (!moving && now - lastDrawn < 1000 / IDLE_FPS - 1) return;
    lastDrawn = now;
    judge(now, moving);
    look.tick(time);
    sky.update(time);
    clouds.update(dt, camera);
    composer.render();
  };

  function judge(now: number, everyFrame: boolean) {
    if (everyFrame && lastFrame) intervals.push(now - lastFrame);
    lastFrame = everyFrame ? now : 0;
    if (clock.getElapsed() < 3 || now - judgedAt < 2000 || intervals.length < 60) return;
    judgedAt = now;
    const sorted = [...intervals].sort((a, b) => a - b);
    intervals.length = 0;
    if (sorted[Math.floor(sorted.length / 2)] > 1000 / FLOOR_FPS && tier < tiers.length - 1) {
      tier++;
      renderer.setPixelRatio(ratio());
      composer.setPixelRatio(ratio());
      stage.resize(width, height);
    }
  }

  function volumeAt(ndc: THREE.Vector2): string | null {
    if (shown < 0.8 || held) return null;
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(pivots, true)) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData['slug']) obj = obj.parent;
      if (obj) return obj.userData['slug'] as string;
    }
    return null;
  }

  function propAt(ndc: THREE.Vector2): Prop | null {
    if (shown > 0.72 || held) return null;
    raycaster.setFromCamera(ndc, camera);
    let obj: THREE.Object3D | null =
      raycaster.intersectObjects(propTargets, true)[0]?.object ?? null;
    while (obj && !obj.userData['prop']) obj = obj.parent;
    return (obj?.userData['prop'] as Prop | undefined) ?? null;
  }

  const heldPose = new THREE.Object3D();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  const startScale = new THREE.Vector3();
  const end = new THREE.Vector3();
  const control = new THREE.Vector3();
  const pathA = new THREE.Vector3();
  const pathB = new THREE.Vector3();
  // Turned so its front cover, with the heart, faces her.
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const outOfShelf = new THREE.Vector3(0, 0.3, 1.2);

  function placeHeld(entry: Shelved, t: number) {
    entry.home.decompose(startPos, startQuat, startScale);
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    const portrait = width < height;
    end
      .copy(camera.position)
      .addScaledVector(forward, portrait ? 4 : 3.4)
      .addScaledVector(right, portrait ? -0.38 : -1.05)
      .addScaledVector(camera.up, portrait ? 0.2 : -0.85);
    heldPose.position.copy(end);
    heldPose.lookAt(camera.position);
    heldPose.quaternion.multiply(turn);
    control.copy(startPos).add(outOfShelf);
    pathA.copy(startPos).lerp(control, t);
    pathB.copy(control).lerp(end, t);
    entry.pivot.position.copy(pathA.lerp(pathB, t));
    entry.pivot.quaternion.copy(startQuat).slerp(heldPose.quaternion, ease(Math.min(1, t * 1.25)));
    curtain.position.copy(camera.position).addScaledVector(forward, 2.2);
    curtain.quaternion.copy(camera.quaternion);
    // In the hand, it is in the lantern light.
    entry.light.set(
      nookLight[0] + (0.55 - nookLight[0]) * t,
      nookLight[1] + (1 - nookLight[1]) * t,
    );
  }

  function letterDistance(): number {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tall = LETTER_SIZE.length * LETTER_VIEW.y + 0.1;
    const wide = LETTER_SIZE.width + 0.1;
    return Math.max(tall / (2 * tan * 0.74), wide / (2 * tan * camera.aspect * 0.86));
  }

  const shotA = new THREE.Vector3();
  const shotB = new THREE.Vector3();
  function shotPosition(shot: Shot, out: THREE.Vector3) {
    if (shot.position === 'letter')
      return out.copy(LETTER_AT).addScaledVector(LETTER_VIEW, letterDistance());
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
        aim.copy(goal.look);
      }
    },
    setPointer(x, y) {
      pointerIn = x !== null;
      if (x !== null) pointer.set(x, y);
      pointerAt = performance.now();
      aimDirty = true;
    },
    hovered: () => hover,
    pick: (x, y) => volumeAt(new THREE.Vector2(x, y)),
    highlight(slug) {
      highlighted = slug;
    },
    pickProp: (x, y) => propAt(new THREE.Vector2(x, y)),
    toggleLamp() {
      lampOn = !lampOn;
      relight();
      aimDirty = true;
      return lampOn;
    },
    lampOn: () => lampOn,
    nudge(prop) {
      if (prop === 'inkwell') inkAt = clock.getElapsed();
      else pileAt = clock.getElapsed();
    },
    throughWindow() {
      if (flight) return Promise.resolve();
      if (held) {
        const entry = shelved.get(held.slug)!;
        entry.home.decompose(entry.pivot.position, entry.pivot.quaternion, entry.pivot.scale);
        const done = held.resolve;
        held = null;
        lean = 0;
        done();
      }
      return new Promise((resolve) => {
        flight = { t: 0, from: camera.position.clone(), look: aim.clone(), resolve };
      });
    },
    takeDown(slug) {
      if (held || !shelved.has(slug)) return Promise.resolve();
      slide.set(slug, 0);
      aimDirty = true;
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
    setPaused(on) {
      if (on === paused || disposed) return;
      paused = on;
      if (paused) {
        cancelAnimationFrame(frame);
        return;
      }
      lastFrame = 0;
      lastDrawn = -Infinity;
      frame = requestAnimationFrame(tick);
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
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      disposeScene(scene);
      renderer.dispose();
    },
  };

  frame = requestAnimationFrame(tick);
  return stage;
}

/** A soft vignette, last of all. */
const VIGNETTE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      vec2 c = vUv - 0.5;
      colour.rgb *= mix(0.7, 1.0, smoothstep(0.9, 0.3, length(c * vec2(1.0, 1.15))));
      gl_FragColor = colour;
    }
  `,
};

// ---------------------------------------------------------------------------
// Painted things: the letter, and the label on a book's spine. Written in the
// pixel font, on paper drawn with a stepped, pixel border.
// ---------------------------------------------------------------------------

const FONT = '"Pixelify Sans", ui-monospace, monospace';

async function fontReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`400 32px ${FONT}`),
      document.fonts.load(`700 32px ${FONT}`),
    ]);
  } catch {
    // The fallback will do.
  }
}

function canvasTexture(canvas: HTMLCanvasElement, crisp = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (crisp) {
    texture.magFilter = THREE.NearestFilter;
  }
  return texture;
}

/** Parchment in big pixels: a warm ground, speckled, a stepped darker border. */
function paintPaper(ctx: CanvasRenderingContext2D, w: number, h: number, px: number) {
  const rand = mulberry(12);
  ctx.fillStyle = '#f3e6c8';
  ctx.fillRect(0, 0, w, h);
  const tones = ['#efe0bf', '#f7ecd3', '#ead9b4'];
  for (let y = 0; y < h; y += px) {
    for (let x = 0; x < w; x += px) {
      if (rand() < 0.35) {
        ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
        ctx.fillRect(x, y, px, px);
      }
    }
  }
  ctx.fillStyle = '#c9ad7c';
  ctx.fillRect(0, 0, w, px);
  ctx.fillRect(0, h - px, w, px);
  ctx.fillRect(0, 0, px, h);
  ctx.fillRect(w - px, 0, px, h);
  ctx.fillStyle = '#e0c99a';
  ctx.fillRect(px, px, w - 2 * px, px);
  ctx.fillRect(px, px, px, h - 2 * px);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The note: a sheet folded in half, lying on the desk. It opens (its top
 * half swinging back on the fold) as the camera comes over it.
 */
async function letter(
  text: NoteText,
  light: [number, number],
): Promise<{ group: THREE.Group; unfold(t: number): void; light(at: [number, number]): void }> {
  await fontReady();
  const w = 840;
  const h = Math.round((w * LETTER_SIZE.length) / LETTER_SIZE.width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const px = 8;
  paintPaper(ctx, w, h, px);
  const margin = 70;
  ctx.fillStyle = '#9b6a3a';
  ctx.font = `400 26px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text.label.toUpperCase(), margin, margin);
  ctx.fillStyle = '#4a2a1a';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(text.heading, margin, margin + 46);
  ctx.font = `400 40px ${FONT}`;
  ctx.fillStyle = '#3a2418';
  let y = margin + 160;
  for (const paragraph of text.paragraphs) {
    for (const line of wrap(ctx, paragraph, w - margin * 2)) {
      ctx.fillText(line, margin, y);
      y += 58;
    }
    y += 26;
  }
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = '#7a1730';
  ctx.textAlign = 'right';
  ctx.fillText(`- ${text.signature}`, w - margin, Math.min(h - margin - 50, y + 20));
  // A little pixel heart by the signature.
  const heart = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  heart.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === 'X') ctx.fillRect(margin + c * 7, h - margin - 50 + r * 7, 7, 7);
    }),
  );
  const face = canvasTexture(canvas);

  // The outside of the fold: plain paper, a red seal.
  const back = document.createElement('canvas');
  back.width = 256;
  back.height = Math.round(256 * (LETTER_SIZE.length / 2 / LETTER_SIZE.width));
  const bctx = back.getContext('2d')!;
  paintPaper(bctx, back.width, back.height, 8);
  bctx.fillStyle = '#9b1b30';
  const cx = back.width / 2;
  const cy = back.height / 2;
  for (const [dx, dy, s] of [
    [-24, -24, 48],
    [-32, -16, 64],
    [-16, -32, 32],
  ]) {
    bctx.fillRect(cx + dx, cy + dy, s, s);
  }
  bctx.fillStyle = '#c2344c';
  bctx.fillRect(cx - 8, cy - 8, 16, 16);
  const backTexture = canvasTexture(back, true);

  const material = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({
      map,
      side: THREE.FrontSide,
      color: new THREE.Color().setScalar(1),
    });
  const lower = new THREE.PlaneGeometry(LETTER_SIZE.width, LETTER_SIZE.length / 2);
  const upper = new THREE.PlaneGeometry(LETTER_SIZE.width, LETTER_SIZE.length / 2);
  // Each half shows its half of the page.
  const halfUv = (g: THREE.PlaneGeometry, from: number) => {
    const uv = g.attributes['uv'];
    for (let i = 0; i < uv.count; i++) uv.setY(i, from + uv.getY(i) * 0.5);
  };
  halfUv(lower, 0);
  halfUv(upper, 0.5);
  const lowerFace = new THREE.Mesh(lower, material(face));
  lowerFace.rotation.x = -Math.PI / 2;
  lowerFace.position.z = LETTER_SIZE.length / 4;
  const hinge = new THREE.Group();
  const upperFace = new THREE.Mesh(upper, material(face));
  upperFace.rotation.x = -Math.PI / 2;
  // Just under the fold's height, so that folded over (turned upside down) it lies on top.
  upperFace.position.set(0, -0.003, -LETTER_SIZE.length / 4);
  const upperBack = new THREE.Mesh(upper.clone(), material(backTexture));
  upperBack.rotation.x = Math.PI / 2;
  upperBack.position.set(0, -0.004, -LETTER_SIZE.length / 4);
  hinge.add(upperFace, upperBack);
  const group = new THREE.Group();
  group.add(lowerFace, hinge);
  group.rotation.y = -0.06;

  const tint = (at: [number, number]) => {
    // Lit like the blocks round it: warm from the lantern, a little moonlight.
    const warm = new THREE.Color('#ffb45e').multiplyScalar(at[1] * (1 - 0.1 * at[0]));
    const moon = new THREE.Color('#7f8dca').multiplyScalar(at[0]);
    const lit = warm.add(moon);
    lit.r = Math.min(1, Math.max(0.35, lit.r * 1.15));
    lit.g = Math.min(1, Math.max(0.3, lit.g * 1.15));
    lit.b = Math.min(1, Math.max(0.28, lit.b * 1.15));
    for (const mesh of [lowerFace, upperFace, upperBack])
      (mesh.material as THREE.MeshBasicMaterial).color.copy(lit);
  };
  tint(light);
  return {
    group,
    unfold(t) {
      // Folded over (the top half lying face down on the bottom), then flat.
      hinge.rotation.x = Math.PI * (1 - ease(t)) * 0.999;
    },
    light: tint,
  };
}

/** The title down a book's spine, gold on its leather, with its volume number. */
function spineLabel(v: StageVolume, light: readonly [number, number]): THREE.Mesh {
  const w = 112;
  const h = 176;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f0c45a';
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, h / 2 - 8);
  // Read from head to foot, as English spines are.
  ctx.rotate(Math.PI / 2);
  const lines = wrap(ctx, v.story.title.toUpperCase(), h - 34).slice(0, 2);
  lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * 24));
  ctx.restore();
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(v.finished ? `${v.roman} *` : v.roman, w / 2, h - 10);
  const brightness = Math.min(1.2, 0.4 + light[1] * 0.9 + light[0] * 0.3);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(7 / 12, 11 / 12),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      color: new THREE.Color().setScalar(brightness),
    }),
  );
  // Flat on the spine (+z), between its gold bands.
  label.position.set(0, 9.75 / 12, 7.5 / 12 + 0.004);
  return label;
}
