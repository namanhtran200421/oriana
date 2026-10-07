import * as THREE from 'three';
import { B, BlockId, atlas } from '../../../voxel/blocks';
import { Micro } from '../../../voxel/micro';
import {
  CORNFLOWER_COLOURS,
  ROSE_COLOURS,
  basket,
  bee,
  butterfly,
  flowerHead,
  gull,
  heart,
  sparkle,
  stem,
  swing,
} from '../../../voxel/models';
import { bush, broadOak, cherry, grassAt, oak } from '../../../voxel/nature';
import { Noise, mulberry } from '../../../voxel/noise';
import { burst, drift, stringLights } from '../../../voxel/particles';
import { approach, disposeScene, smoothstep, touchBox } from '../../../voxel/scene';
import { createLook, modelMaterial } from '../../../voxel/shading';
import { createClouds, createSky } from '../../../voxel/sky';
import { Volume } from '../../../voxel/volume';
import type { Pose, World, WorldBuilder } from './runtime';

/** One cell of a model, in blocks. */
const PIXEL = 1 / 8;
/** The reasons' flowers are grander than the rest. */
const GRAND = 1 / 6.5;
/** The heart garden: its middle, and how big (blocks per unit of the heart's curve). */
const HEART = { x: 0, z: -8, scale: 0.58 };
const FAIRY = ['#ffd36b', '#ff8fb0', '#fff2c0', '#9fd3ff', '#ffb35c'];

/** A point on the heart's outline, t from 0 (the dip between its lobes) round to 2π. */
function heartPoint(t: number): [number, number] {
  const x = 16 * Math.sin(t) ** 3;
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  // Its lobes away from her, its point toward her.
  return [HEART.x + x * HEART.scale, HEART.z - (y + 3) * HEART.scale];
}

/**
 * The flower field at sunset: hills in pink and gold light, a heart of
 * burgundy roses in a pink hedge, set in a sea of sky-blue cornflowers, a
 * rose arch at its point. A swing hung with flowers, a picnic, fairy lights
 * coming on; butterflies, bees, petals on the breeze. Each reason is a
 * flower taller than she is, standing round the heart's edge.
 */
export const buildMeadow: WorldBuilder = async ({ lite, count }) => {
  const scene = new THREE.Scene();
  const noise = new Noise(5);
  const rand = mulberry(31);
  const tiles = atlas();

  const look = createLook({
    sky: '#ffdcc4',
    glow: '#ffb35c',
    ambient: 0.18,
    fog: '#f3c2b8',
    fogNear: lite ? 56 : 72,
    fogFar: lite ? 110 : 150,
    daylight: 0.55,
  });

  const size = lite ? 128 : 176;
  const volume = new Volume(size, 46, size, new THREE.Vector3(-size / 2, -8, 30 - size));
  const { origin } = volume;
  const at = (x: number, z: number) => ({
    vx: Math.round(x) - origin.x,
    vz: Math.round(z) - origin.z,
  });

  // The heart's outline, finely, for telling inside from out.
  const outline = Array.from({ length: 240 }, (_, i) => heartPoint((i / 240) * Math.PI * 2));
  const insideHeart = (x: number, z: number) => {
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, zi] = outline[i];
      const [xj, zj] = outline[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  };
  const nearOutline = (x: number, z: number, d: number) =>
    outline.some(([ox, oz]) => Math.abs(ox - x) <= d && Math.abs(oz - z) <= d);

  // Gentle ground: flat where the garden is, rolling round it, hills far off.
  const ground = (x: number, z: number) => {
    const rolling = (noise.fbm(x * 0.028 + 11, z * 0.028 + 5, 4) - 0.5) * 9;
    const garden = 1 - smoothstep(14, 32, Math.hypot(x - HEART.x, z - HEART.z + 2));
    const rise = smoothstep(4, 26, z) * 3;
    const far = smoothstep(-36, -100, z) * (5 + noise.fbm(x * 0.02 + 3, z * 0.02, 3) * 16);
    const sides = smoothstep(36, 84, Math.abs(x)) * 10;
    return Math.round(rolling * (1 - garden * 0.9) + rise + far + sides);
  };

  for (let vz = 0; vz < volume.sz; vz++) {
    for (let vx = 0; vx < volume.sx; vx++) {
      const top = ground(vx + origin.x, vz + origin.z) - origin.y;
      volume.fill(vx, 0, vz, vx, top - 4, vz, B.Stone);
      volume.fill(vx, top - 3, vz, vx, top - 1, vz, B.Dirt);
      volume.set(vx, top, vz, B.Grass);
    }
  }
  const groundY = (x: number, z: number) => {
    const { vx, vz } = at(x, z);
    return volume.top(vx, vz, true) + 1 + origin.y;
  };
  const surface = (x: number, z: number) => groundY(x, z) - origin.y;

  // Where the reasons stand: round the heart's edge, leaving its point (the way in) clear.
  const spots = Array.from({ length: count }, (_, i) => {
    const t = Math.PI + 1.05 + (i * (Math.PI * 2 - 2.1)) / Math.max(1, count - 1);
    const [x, z] = heartPoint(t);
    // A step in from the hedge.
    const toward = Math.atan2(HEART.z - z, HEART.x - x);
    return { x: Math.round(x + Math.cos(toward) * 1.4), z: Math.round(z + Math.sin(toward) * 1.4) };
  });
  const [pointX, pointZ] = heartPoint(Math.PI);

  // The heart: a pink hedge round roses, a gap at its point; a path to it from where she stands.
  for (let vz = 0; vz < volume.sz; vz++) {
    for (let vx = 0; vx < volume.sx; vx++) {
      const x = vx + origin.x;
      const z = vz + origin.z;
      if (Math.abs(x - HEART.x) > 14 || Math.abs(z - HEART.z) > 16) continue;
      const y = surface(x, z);
      const edge = nearOutline(x + 0.5, z + 0.5, 0.75);
      const entrance = Math.abs(x - pointX) <= 1 && Math.abs(z - pointZ) <= 3;
      if (edge && !entrance) {
        volume.set(vx, y, vz, B.CherryLeaves);
        if (rand() < 0.12) volume.set(vx, y + 1, vz, B.CherryLeaves);
      } else if (insideHeart(x + 0.5, z + 0.5)) {
        const roll = rand();
        if (spots.some((s) => Math.abs(s.x - x) <= 1 && Math.abs(s.z - z) <= 1)) continue;
        volume.set(vx, y, vz, roll < 0.82 ? B.Rose : roll < 0.92 ? B.PinkTulip : B.Poppy);
      }
    }
  }
  for (let z = pointZ - 1; z <= 30; z++) {
    const x = Math.round(pointX + Math.sin(z * 0.18) * 0.8);
    for (const dx of [0, 1]) {
      const { vx, vz } = at(x + dx - 0.5, z);
      const y = surface(x + dx - 0.5, z) - 1;
      if (volume.get(vx, y, vz) === B.Grass) volume.set(vx, y, vz, B.Path);
      volume.set(vx, y + 1, vz, B.Air);
    }
  }

  // The rose arch over the way in: two posts, a bower of pink and green.
  const archZ = Math.round(pointZ + 1.5);
  const archBase = surface(pointX, archZ);
  const arch = (dx: number, dy: number, id: BlockId) => {
    const { vx, vz } = at(pointX + dx, archZ);
    volume.set(vx, archBase + dy, vz, id);
  };
  for (const side of [-2, 2]) for (let dy = 0; dy < 3; dy++) arch(side, dy, B.OakLog);
  for (let dx = -2; dx <= 2; dx++) arch(dx, 3, Math.abs(dx) === 2 ? B.OakLeaves : B.CherryLeaves);
  arch(0, 4, B.CherryLeaves);
  for (const side of [-3, 3])
    for (let dy = 1; dy < 3; dy++) if (rand() < 0.6) arch(side, dy, B.CherryLeaves);

  // The swing, under a beam hung with blossom, off to the left.
  const swingAt = { x: -15, z: -1 };
  const swingBase = surface(swingAt.x, swingAt.z);
  {
    const put = (dx: number, dy: number, dz: number, id: BlockId) => {
      const { vx, vz } = at(swingAt.x + dx, swingAt.z + dz);
      volume.set(vx, swingBase + dy, vz, id);
    };
    for (const dx of [-2, 2]) for (let dy = 0; dy < 6; dy++) put(dx, dy, 0, B.OakLog);
    for (let dx = -2; dx <= 2; dx++) put(dx, 6, 0, B.OakLog);
    for (let dx = -3; dx <= 3; dx++) {
      put(dx, 7, 0, B.CherryLeaves);
      if (rand() < 0.6) put(dx, 7, rand() < 0.5 ? -1 : 1, B.CherryLeaves);
    }
    put(-3, 5, 0, B.CherryLeaves);
    put(3, 6, 0, B.CherryLeaves);
  }

  // A picnic on a checked blanket, off to the right.
  const picnic = { x: 11, z: 3 };
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const { vx, vz } = at(picnic.x + dx, picnic.z + dz);
      const y = surface(picnic.x + dx, picnic.z + dz) - 1;
      volume.set(vx, y, vz, (dx + dz) % 2 === 0 ? B.WoolRed : B.WoolWhite);
      volume.set(vx, y + 1, vz, B.Air);
    }
  }

  // Trees: cherries round the garden, oaks on the far hills.
  const plant = (x: number, z: number, grow: (vx: number, vy: number, vz: number) => void) => {
    const { vx, vz } = at(x, z);
    const y = grassAt(volume, vx, vz);
    if (y >= 0) grow(vx, y + 1, vz);
  };
  for (const [x, z] of [
    [-24, -6],
    [21, -10],
    [-14, -28],
    [17, -30],
    [27, 8],
    [-30, 14],
    [2, -42],
  ]) {
    plant(x, z, (vx, vy, vz) => cherry(volume, vx, vy, vz, rand));
  }
  plant(-40, -44, (vx, vy, vz) => broadOak(volume, vx, vy, vz, rand));
  plant(40, -30, (vx, vy, vz) => broadOak(volume, vx, vy, vz, rand));
  for (let k = 0; k < (lite ? 26 : 48); k++) {
    const x = (rand() * 2 - 1) * (size / 2 - 6);
    const z = origin.z + 6 + rand() * (size - 60);
    if (Math.hypot(x - HEART.x, z - HEART.z) < 34) continue;
    plant(x, z, (vx, vy, vz) =>
      rand() < 0.7 ? oak(volume, vx, vy, vz, rand) : bush(volume, vx, vy, vz, B.OakLeaves, rand),
    );
  }

  // Round the heart, a sea of sky-blue cornflowers; drifts of burgundy further out; grass between.
  const blue: BlockId[] = [B.Cornflower, B.Cornflower, B.Cornflower, B.Cornflower, B.Allium];
  const rosy: BlockId[] = [B.Rose, B.Rose, B.Poppy, B.PinkTulip];
  for (let vz = 0; vz < volume.sz; vz++) {
    for (let vx = 0; vx < volume.sx; vx++) {
      const y = grassAt(volume, vx, vz);
      if (y < 0 || volume.get(vx, y + 1, vz)) continue;
      const x = vx + origin.x;
      const z = vz + origin.z;
      if (Math.abs(x - pointX) <= 1.5 && z > pointZ && z < 30) continue;
      const fromHeart = Math.hypot(x - HEART.x, (z - HEART.z) * 1.1);
      const field = 1 - smoothstep(16, 30, fromHeart);
      const patch = smoothstep(0.4, 0.62, noise.fbm(x * 0.07 + 2, z * 0.07 + 9, 3));
      const density = 0.1 + field * 0.62 + patch * 0.35 * (1 - field);
      const roll = rand();
      if (roll < density) {
        const kinds = field > 0.3 || noise.fbm(x * 0.04 + 40, z * 0.04, 3) > 0.5 ? blue : rosy;
        const accent = rand() < 0.06;
        volume.set(vx, y + 1, vz, accent ? B.Daisy : kinds[Math.floor(rand() * kinds.length)]);
      } else if (roll < density + 0.3) {
        volume.set(vx, y + 1, vz, B.Tuft);
      }
    }
  }

  volume.light();
  scene.add(volume.mesh({ look, atlas: tiles, walls: true }));

  // The sunset.
  const sunDirection = new THREE.Vector3(-0.5, 0.06, -1);
  const sky = createSky({
    zenith: '#5a6cc4',
    middle: '#ec9db6',
    horizon: '#ffc489',
    below: '#f3c2b8',
    sun: { direction: sunDirection, size: 0.17 },
    glow: { colour: '#ff9a6a', strength: 0.8 },
  });
  scene.add(sky.group);
  const clouds = createClouds({
    altitude: 30,
    cell: 12,
    thickness: 4,
    cover: 0.36,
    colour: '#ffdcd2',
    shadow: '#c48aa6',
    fade: '#f6c4b8',
    opacity: 0.9,
    reach: 260,
    seed: 4,
  });
  scene.add(clouds.group);

  // Air full of small things: pollen in the gold light, petals, the first fireflies.
  const middleY = groundY(HEART.x, HEART.z);
  const pollen = drift(look, {
    count: lite ? 140 : 280,
    centre: new THREE.Vector3(0, middleY + 3, -6),
    extent: new THREE.Vector3(26, 4, 22),
    colours: ['#fff2c0', '#ffe39a', '#ffd0b0'],
    size: [0.035, 0.06],
    rise: 0.08,
    wobble: 0.7,
  });
  const petals = drift(look, {
    count: lite ? 140 : 280,
    centre: new THREE.Vector3(0, middleY + 5, -8),
    extent: new THREE.Vector3(30, 5, 24),
    colours: ['#f7b7d2', '#f9c9de', '#f0a2c4', '#fde0ec'],
    size: [0.14, 0.2],
    shape: 'petal',
    rise: -0.35,
    wobble: 0.9,
    seed: 8,
  });
  const fireflies = drift(look, {
    count: lite ? 40 : 80,
    centre: new THREE.Vector3(0, middleY + 1.6, -6),
    extent: new THREE.Vector3(22, 1.6, 18),
    colours: ['#fff2a0', '#d8ff7a'],
    size: [0.06, 0.09],
    rise: 0.04,
    wobble: 1,
    brightness: 1.7,
    blink: true,
    seed: 15,
  });
  const hearts = burst(look, { colours: ['#ff5c8a', '#ff8fb0', '#e8335f'] });
  scene.add(pollen.points, petals.points, fireflies.points, hearts.points);

  // Fairy lights: round the arch, along the swing's beam, from tree to tree.
  const archTop = archBase + origin.y + 3;
  const swingTop = swingBase + origin.y + 6;
  const lights = stringLights(
    look,
    [
      [
        new THREE.Vector3(pointX - 3, archTop - 1.5, archZ + 0.6),
        new THREE.Vector3(pointX + 0.5, archTop + 2.1, archZ + 0.6),
      ],
      [
        new THREE.Vector3(pointX + 0.5, archTop + 2.1, archZ + 0.6),
        new THREE.Vector3(pointX + 4, archTop - 1.5, archZ + 0.6),
      ],
      [
        new THREE.Vector3(swingAt.x - 2.5, swingTop + 0.2, swingAt.z + 0.7),
        new THREE.Vector3(swingAt.x + 3.5, swingTop + 0.2, swingAt.z + 0.7),
      ],
      [
        new THREE.Vector3(swingAt.x + 3.5, swingTop, swingAt.z + 0.7),
        new THREE.Vector3(-23.5, groundY(-24, -6) + 4, -5),
      ],
      [
        new THREE.Vector3(picnic.x + 7.5, groundY(21, -10) + 4, -9.5),
        new THREE.Vector3(27, groundY(27, 8) + 4, 7.5),
      ],
    ],
    { colours: FAIRY, sag: 0.5, size: 0.17, brightness: 2.1 },
  );
  scene.add(lights.points);

  // The swing itself, swaying a little, as if someone just got off.
  const swingModel = new THREE.Mesh(
    swing(36).geometry(PIXEL, { centre: { x: 0.5, y: 0, z: 0.5 } }),
    modelMaterial(look, { light: [0.95, 0] }),
  );
  swingModel.position.set(swingAt.x + 0.5, swingBase + origin.y + 6, swingAt.z + 0.5);
  scene.add(swingModel);

  // The picnic basket, and a bottle and two cups beside it.
  const basketModel = new THREE.Mesh(
    basket().geometry(1 / 12),
    modelMaterial(look, { light: [0.95, 0] }),
  );
  basketModel.position.set(picnic.x + 0.6, groundY(picnic.x, picnic.z), picnic.z + 0.2);
  basketModel.rotation.y = -0.4;
  const cups = new Micro()
    .box(0, 0, 0, 1, 2, 1, '#f4ecdc')
    .put(0, 1, 0, '#d6416b')
    .box(4, 0, 2, 5, 2, 3, '#f4ecdc')
    .put(4, 1, 2, '#d6416b');
  const cupsModel = new THREE.Mesh(
    cups.geometry(1 / 16),
    modelMaterial(look, { light: [0.95, 0] }),
  );
  cupsModel.position.set(picnic.x - 0.9, groundY(picnic.x, picnic.z), picnic.z - 0.2);
  scene.add(basketModel, cupsModel);

  // Butterflies, looping over the flowers.
  const butterflyKinds = [
    butterfly('#ff8fb0', '#7a1730'),
    butterfly('#6aa6f2', '#f4ecdc'),
    butterfly('#ffd36b', '#b05a2b'),
    butterfly('#f4ecdc', '#9c5fd0'),
  ];
  const butterflyMaterial = modelMaterial(look, { light: [1, 0] });
  const butterflies = Array.from({ length: lite ? 5 : 9 }, (_, i) => {
    const kind = butterflyKinds[i % butterflyKinds.length];
    const group = new THREE.Group();
    group.add(new THREE.Mesh(kind.body.geometry(1 / 16), butterflyMaterial));
    const wings = [-1, 1].map((side) => {
      const wing = new THREE.Mesh(
        kind.wing.geometry(1 / 14, { centre: { x: 0, y: 0, z: 0.5 } }),
        butterflyMaterial,
      );
      wing.scale.x = side;
      group.add(wing);
      return wing;
    });
    scene.add(group);
    return {
      group,
      wings,
      centre: new THREE.Vector2(HEART.x + (rand() * 2 - 1) * 14, HEART.z + (rand() * 2 - 1) * 12),
      radius: 2 + rand() * 4,
      phase: rand() * Math.PI * 2,
      pace: 0.35 + rand() * 0.3,
    };
  });

  // Bees, and birds wheeling far off over the hills.
  const beeParts = bee();
  const beeBody = beeParts.body.geometry(1 / 16);
  const beeWing = beeParts.wing.geometry(1 / 16, { centre: { x: 0, y: 0, z: 1.5 } });
  const beeMaterial = modelMaterial(look);
  const bees = Array.from({ length: lite ? 2 : 3 }, (_, i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(beeBody, beeMaterial));
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.06, 0.38, 0);
      const wing = new THREE.Mesh(beeWing, beeMaterial);
      wing.position.x = side * 0.13;
      pivot.add(wing);
      group.add(pivot);
      return { pivot, side };
    });
    scene.add(group);
    return {
      group,
      wings,
      centre: new THREE.Vector2((rand() * 2 - 1) * 9, HEART.z + (rand() * 2 - 1) * 8),
      radius: 2.5 + rand() * 3,
      phase: i * 1.9 + rand(),
    };
  });
  const birdParts = gull('#4a3a52');
  const birdBody = birdParts.body.geometry(1 / 6);
  const birdWing = birdParts.wing.geometry(1 / 6, { centre: { x: 0, y: 0, z: 0 } });
  const birdMaterial = modelMaterial(look, { light: [0.5, 0] });
  const birds = Array.from({ length: 5 }, (_, i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(birdBody, birdMaterial));
    const wings = [-1, 1].map((side) => {
      const wing = new THREE.Mesh(birdWing, birdMaterial);
      wing.scale.x = side;
      group.add(wing);
      return wing;
    });
    scene.add(group);
    return { group, wings, phase: i * 0.7, lane: i };
  });

  // The reasons: giant flowers round the heart, nodding toward her.
  const rest: Pose = {
    position: new THREE.Vector3(0, groundY(0, 22) + 10, 22),
    look: new THREE.Vector3(0, middleY + 0.5, HEART.z - 2.5),
  };
  const middle = { x: 0.5, y: 0.5, z: 0.5 };
  const heads = [
    flowerHead(ROSE_COLOURS, 5).geometry(GRAND, { centre: middle }),
    flowerHead(CORNFLOWER_COLOURS, 8).geometry(GRAND, { centre: middle }),
  ];
  const stems = [stem(22).geometry(GRAND), stem(26).geometry(GRAND)];
  const sparkleGeometry = sparkle().geometry(GRAND * 0.8, { centre: { x: 0.5, y: 3.5, z: 0.5 } });
  const heartGeometry = heart().geometry(GRAND * 0.8, { centre: { x: 0.5, y: 3, z: 1 } });
  const stemMaterial = modelMaterial(look);
  const markerMaterial = modelMaterial(look, { shine: 1.4 });

  const anchors = spots.map(({ x, z }, i) => {
    const kind = i % 2;
    const tall = (kind ? 26 : 22) * GRAND;
    const group = new THREE.Group();
    group.position.set(x + 0.5, groundY(x, z), z + 0.5);
    group.rotation.y = Math.atan2(
      rest.position.x - group.position.x,
      rest.position.z - group.position.z,
    );
    group.userData['reason'] = i;
    group.add(new THREE.Mesh(stems[kind], stemMaterial));
    const head = new THREE.Group();
    head.position.set(0, tall + GRAND * 0.5, 0);
    head.rotation.x = -0.28;
    const material = modelMaterial(look, { shine: 1.5 });
    head.add(new THREE.Mesh(heads[kind], material));
    group.add(head);
    const marker = new THREE.Group();
    const unread = new THREE.Mesh(sparkleGeometry, markerMaterial);
    const done = new THREE.Mesh(heartGeometry, markerMaterial);
    marker.add(unread, done);
    group.add(marker);
    group.add(touchBox(3, tall + 2, 1.6));
    scene.add(group);
    return { group, head, material, marker, unread, done, phase: rand() * Math.PI * 2, scale: 1 };
  });

  let selected: number | null = null;
  let hovered: number | null = null;
  let read: ReadonlySet<number> = new Set();
  let wide = true;
  const headAt = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const next = new THREE.Vector3();

  const world: World = {
    scene,
    anchors: anchors.map((a) => a.group),
    // Coming down out of the sky over the heart, so she sees its shape first.
    arrive: {
      position: new THREE.Vector3(0, middleY + 46, HEART.z + 16),
      look: new THREE.Vector3(HEART.x, middleY, HEART.z - 1),
    },
    rest,
    focus(index) {
      anchors[index].head.getWorldPosition(headAt);
      const back = new THREE.Vector3().subVectors(rest.position, headAt).setY(0).normalize();
      side.crossVectors(back, up).normalize().negate();
      const position = headAt
        .clone()
        .addScaledVector(back, wide ? 7.4 : 8.6)
        .add(new THREE.Vector3(0, 1.2, 0));
      const target = headAt.clone();
      if (wide) target.addScaledVector(side, 1.9);
      else target.y -= 1.1;
      return { position, look: target };
    },
    fov: 50,
    exposure: 1,
    bloom: { strength: 0.55, radius: 0.4, threshold: 0.95 },
    sway: 0.6,
    depthOfField: 0,
    update(dt, time, camera) {
      wide = camera.aspect > 1;
      look.tick(time);
      sky.update(time);
      clouds.update(dt, camera);
      anchors.forEach((a, i) => {
        const open = selected === i;
        const lit = hovered === i;
        a.scale = approach(a.scale, open ? 1.15 : lit ? 1.08 : 1, 6, dt);
        a.head.scale.setScalar(a.scale);
        const wind = look.uniforms.wind.value;
        a.head.rotation.z = Math.sin(time * 0.9 + a.phase) * 0.06 * wind;
        a.head.rotation.x = -0.28 + Math.sin(time * 0.7 + a.phase * 2) * 0.05 * wind;
        const shine = a.material.uniforms['shine'];
        shine.value = approach(shine.value, open ? 2.3 : lit ? 2 : 1.5, 5, dt);
        const isRead = read.has(i);
        a.unread.visible = !isRead;
        a.done.visible = isRead;
        a.marker.visible = !open;
        a.marker.rotation.y = time * 1.2 + a.phase;
        a.marker.position.y = a.head.position.y + 1.6 + Math.sin(time * 2 + a.phase) * 0.12;
      });
      swingModel.rotation.x = Math.sin(time * 1.25) * 0.22 * (0.8 + 0.2 * Math.sin(time * 0.2));
      for (const b of butterflies) {
        const t = time * b.pace + b.phase;
        const where = (s: number, out: THREE.Vector3) => {
          const x = b.centre.x + Math.sin(s) * b.radius;
          const z = b.centre.y + Math.sin(s * 2) * b.radius * 0.5;
          return out.set(x, groundY(x, z) + 1.4 + Math.sin(s * 3.3) * 0.5, z);
        };
        where(t, b.group.position);
        b.group.lookAt(where(t + 0.04, next));
        const flap = Math.sin(time * 14 + b.phase * 5) * 0.9;
        b.wings[0].rotation.z = flap;
        b.wings[1].rotation.z = -flap;
      }
      for (const b of bees) {
        const t = time * 0.55 + b.phase;
        const where = (s: number, out: THREE.Vector3) => {
          const x = b.centre.x + Math.cos(s) * b.radius;
          const z = b.centre.y + Math.sin(s * 1.3) * b.radius * 0.7;
          return out.set(x, groundY(x, z) + 1.5 + Math.sin(s * 3.1) * 0.35, z);
        };
        where(t, b.group.position);
        b.group.lookAt(where(t + 0.05, next));
        for (const w of b.wings)
          w.pivot.rotation.z = w.side * (0.3 + Math.sin(time * 40 + b.phase) * 0.5);
      }
      for (const b of birds) {
        // In a loose flock, wheeling slowly over the far hills.
        const t = time * 0.07 + b.phase * 0.08;
        const where = (s: number, out: THREE.Vector3) =>
          out.set(
            Math.sin(s) * 40 + b.lane * 2.2,
            middleY + 26 + b.lane * 0.8 + Math.sin(s * 3) * 1.5,
            -70 + Math.cos(s) * 18 + b.lane * 1.4,
          );
        where(t, b.group.position);
        b.group.lookAt(where(t + 0.01, next));
        const beat = Math.sin(time * 5 + b.phase * 3);
        const glide = beat > 0.6 ? 0.1 : beat * 0.45;
        b.wings[0].rotation.z = glide;
        b.wings[1].rotation.z = -glide;
      }
    },
    select(index) {
      if (index !== null && index !== selected) {
        anchors[index].head.getWorldPosition(headAt);
        hearts.emit(headAt.add(new THREE.Vector3(0, 0.6, 0)), 9);
      }
      selected = index;
    },
    hover(index) {
      hovered = index;
    },
    setRead(next) {
      read = next;
    },
    dispose() {
      disposeScene(scene);
    },
  };
  return world;
};
