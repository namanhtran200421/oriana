import * as THREE from 'three';
import { B, BlockId, atlas } from '../../../voxel/blocks';
import { Micro } from '../../../voxel/micro';
import { balloon, cow, gull, lantern, post, rowboat, sheep } from '../../../voxel/models';
import { bush, grassAt, oak } from '../../../voxel/nature';
import { Noise, mulberry } from '../../../voxel/noise';
import { burst, drift } from '../../../voxel/particles';
import { approach, disposeScene, smoothstep, touchBox } from '../../../voxel/scene';
import { createSea } from '../../../voxel/sea';
import { createLook, modelMaterial } from '../../../voxel/shading';
import { createClouds, createSky } from '../../../voxel/sky';
import { Volume } from '../../../voxel/volume';
import { flames, logs } from '../../library/stage/room-models';
import type { Pose, World, WorldBuilder } from './runtime';

const PIXEL = 1 / 5;
/** Balloon stripes: burgundy and cream, sky blue and cream, and the rest. */
const ENVELOPES: readonly [string, string][] = [
  ['#7a1730', '#f4ecdc'],
  ['#5d9be0', '#f4ecdc'],
  ['#f3a3c6', '#ffffff'],
  ['#f5c63d', '#e34a3a'],
  ['#2d3a8c', '#f4ecdc'],
  ['#7fb84a', '#f4ecdc'],
  ['#9c5fd0', '#f9d9ff'],
];
/** The hill the farmhouse stands on. */
/** A headland: the hill comes down to the sea, and the house looks out over it. */
const HILL = { x: 17, z: -3, radius: 10, height: 12 };
const HOUSE = { x: 12, z: -9, w: 9, d: 7 };
const DOCK_X = -2;

/**
 * The house by the sea, at sunset: one farmhouse on a green hill, its lamps
 * lit and smoke going up from the chimney, sheep and cows in the pasture,
 * wheat ripe in the field. Below, a beach, the sea rolling in with foam, a
 * little dock with a lantern at its end, a fire on the sand, gulls. Each
 * reason is a balloon of wool, drifting along the shore.
 */
export const buildValley: WorldBuilder = async ({ lite, count }) => {
  const scene = new THREE.Scene();
  const noise = new Noise(23);
  const rand = mulberry(101);
  const tiles = atlas();

  const look = createLook({
    sky: '#ffd8bc',
    glow: '#ffb35c',
    ambient: 0.16,
    fog: '#f0b9a6',
    fogNear: lite ? 70 : 90,
    fogFar: lite ? 150 : 210,
    daylight: 0.5,
  });

  const sx = lite ? 136 : 168;
  const sz = 116;
  const volume = new Volume(sx, 40, sz, new THREE.Vector3(-sx / 2, -12, 44 - sz));
  const { origin } = volume;
  const at = (x: number, z: number) => ({
    vx: Math.round(x) - origin.x,
    vz: Math.round(z) - origin.z,
  });

  // The coast: where the sand meets the sea, wandering a little.
  const shore = (x: number) => -4 + Math.sin(x * 0.07) * 3 + Math.sin(x * 0.023 + 1) * 4;
  const ground = (x: number, z: number) => {
    const d = z - shore(x);
    let h = d > 0 ? Math.min(2.4, d * 0.22) + Math.max(0, d - 12) * 0.16 : -0.6 + d * 0.3;
    h = Math.max(h, -10);
    if (d > 6) h += (noise.fbm(x * 0.05, z * 0.05, 3) - 0.5) * 2.5 * smoothstep(6, 16, d);
    const r2 = (x - HILL.x) ** 2 + (z - HILL.z) ** 2;
    h += HILL.height * Math.exp(-r2 / (2 * HILL.radius ** 2));
    // Toward the ends of the land, it sinks into the sea, as a headland does.
    const ends = smoothstep(sx / 2 - 6, sx / 2 - 30, Math.abs(x));
    h = h * ends - (1 - ends) * 5;
    return Math.round(h);
  };
  const sea = 0 - origin.y;

  for (let vz = 0; vz < volume.sz; vz++) {
    for (let vx = 0; vx < volume.sx; vx++) {
      const x = vx + origin.x;
      const z = vz + origin.z;
      const top = ground(x, z) - origin.y;
      const d = z - shore(x);
      const beach = top <= sea + 2 && d < 9;
      volume.fill(vx, 0, vz, vx, top - 4, vz, B.Stone);
      volume.fill(vx, top - 3, vz, vx, top - 1, vz, beach || top < sea ? B.Sand : B.Dirt);
      volume.set(
        vx,
        top,
        vz,
        top < sea - 3
          ? noise.value(x * 0.3, z * 0.3) > 0.6
            ? B.Gravel
            : B.Sand
          : beach || top < sea
            ? B.Sand
            : B.Grass,
      );
      if (top < sea) volume.fill(vx, top + 1, vz, vx, sea, vz, B.Water);
    }
  }
  const surface = (x: number, z: number) => {
    const { vx, vz } = at(x, z);
    return volume.top(vx, vz, true) + 1;
  };
  const groundY = (x: number, z: number) => surface(x, z) + origin.y;

  // --- The farmhouse ------------------------------------------------------------
  const H = (dx: number, dy: number, dz: number, id: BlockId) => {
    const { vx, vz } = at(HOUSE.x + dx, HOUSE.z + dz);
    volume.set(vx, houseBase + dy, vz, id);
  };
  let houseBase = 0;
  for (let dz = -1; dz <= HOUSE.d + 2; dz++) {
    for (let dx = -1; dx <= HOUSE.w; dx++)
      houseBase = Math.max(houseBase, surface(HOUSE.x + dx, HOUSE.z + dz));
  }
  {
    const { w, d } = HOUSE;
    // A footing of stone down to the hillside, and a porch floor.
    for (let dz = -1; dz <= d + 2; dz++) {
      for (let dx = -1; dx <= w; dx++) {
        const { vx, vz } = at(HOUSE.x + dx, HOUSE.z + dz);
        const floor = dz >= d ? B.OakPlanks : B.Cobble;
        volume.fill(
          vx,
          surface(HOUSE.x + dx, HOUSE.z + dz) - 1,
          vz,
          vx,
          houseBase - 1,
          vz,
          B.Cobble,
        );
        volume.set(vx, houseBase - 1, vz, dx >= 0 && dx < w && dz >= -1 ? floor : B.Cobble);
        volume.fill(vx, houseBase, vz, vx, houseBase + 12, vz, B.Air);
      }
    }
    // Cream walls between dark timber, as old farmhouses have.
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < d; dz++) {
          const wall = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1;
          if (!wall) continue;
          const corner = (dx === 0 || dx === w - 1) && (dz === 0 || dz === d - 1);
          H(dx, dy, dz, corner || dy === 3 ? B.SpruceLog : dy === 0 ? B.Cobble : B.WoolCream);
        }
      }
    }
    // Windows (lit from within), a door, a porch with its roof.
    for (const dx of [2, 6]) {
      H(dx, 1, d - 1, B.Glass);
      H(dx, 2, d - 1, B.Glass);
      H(dx, 1, 0, B.Glass);
      H(dx, 2, 0, B.Glass);
    }
    for (const dz of [2, 4]) {
      H(0, 1, dz, B.Glass);
      H(0, 2, dz, B.Glass);
      H(w - 1, 1, dz, B.Glass);
      H(w - 1, 2, dz, B.Glass);
    }
    H(4, 0, d - 1, B.Air);
    H(4, 1, d - 1, B.Air);
    H(1, 2, 1, B.Glowstone);
    H(w - 2, 2, d - 2, B.Glowstone);
    for (const dx of [0, w - 1]) for (let dy = 0; dy < 3; dy++) H(dx, dy, d + 1, B.OakLog);
    for (let dx = -1; dx <= w; dx++) {
      H(dx, 3, d, B.SprucePlanks);
      H(dx, 3, d + 1, B.SprucePlanks);
    }
    // A red roof, its ridge running along the house; gables of timber.
    const half = Math.ceil((d + 2) / 2);
    for (let k = 0; k < half; k++) {
      const y = 4 + k;
      for (let dx = -1; dx <= w; dx++) {
        H(dx, y, -1 + k, B.Bricks);
        H(dx, y, d - k, B.Bricks);
        if (k > 0 && (dx === 0 || dx === w - 1))
          for (let z = k; z < d - k; z++) H(dx, y, z, B.SprucePlanks);
      }
    }
    // The chimney, and flowers in front.
    for (let dy = 0; dy < 4 + half + 2; dy++) H(w - 2, dy, 1, B.StoneBricks);
    for (let dx = 0; dx < w; dx++)
      if (dx !== 4 && dx !== 0 && dx !== w - 1)
        H(dx, 0, d + 2, rand() < 0.5 ? B.Poppy : B.Dandelion);
  }
  const chimneyTop = new THREE.Vector3(
    HOUSE.x + HOUSE.w - 2 + 0.5,
    houseBase + origin.y + 4 + Math.ceil((HOUSE.d + 2) / 2) + 2,
    HOUSE.z + 1.5,
  );

  // A path from the porch, along the front of the hill, then down to the beach and the dock.
  const legs: [number, number][] = [
    [HOUSE.x + 4, HOUSE.z + HOUSE.d + 2],
    [3, 3],
    [DOCK_X, shore(DOCK_X) + 3],
  ];
  for (let leg = 0; leg < legs.length - 1; leg++) {
    const from = new THREE.Vector2(...legs[leg]);
    const to = new THREE.Vector2(...legs[leg + 1]);
    const steps = Math.ceil(from.distanceTo(to) * 2);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = from.x + (to.x - from.x) * t + Math.sin(t * Math.PI) * 1.2;
      const z = from.y + (to.y - from.y) * t;
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
      ]) {
        const { vx, vz } = at(x + dx, z + dz);
        const y = surface(x + dx, z + dz) - 1;
        if (volume.get(vx, y, vz) === B.Grass) volume.set(vx, y, vz, B.Path);
      }
    }
  }

  // A field of ripe wheat beside the house, toward the sea, watered down its middle.
  for (let dz = 0; dz <= 6; dz++) {
    for (let dx = -9; dx < -1; dx++) {
      const x = HOUSE.x + dx;
      const z = HOUSE.z + dz;
      const { vx, vz } = at(x, z);
      const y = surface(x, z) - 1;
      if (volume.get(vx, y, vz) !== B.Grass) continue;
      if (dx === -5) {
        volume.set(vx, y, vz, B.Water);
        continue;
      }
      volume.set(vx, y, vz, B.Farmland);
      volume.set(vx, y + 1, vz, B.Wheat);
    }
  }

  // The dock: planks out over the water on log posts.
  const dockStart = Math.round(shore(DOCK_X) + 2);
  const dockEnd = dockStart - 15;
  for (let z = dockStart; z >= dockEnd; z--) {
    for (const dx of [0, 1]) {
      const { vx, vz } = at(DOCK_X + dx, z);
      volume.set(vx, sea + 1, vz, B.OakPlanks);
      volume.set(vx, sea + 2, vz, B.Air);
      if ((dockStart - z) % 4 === 0) {
        const bed = volume.top(vx, vz, true);
        volume.fill(vx, bed, vz, vx, sea, vz, B.OakLog);
      }
    }
  }
  const dockLamp = new THREE.Vector3(DOCK_X + 0.5, sea + 2 + origin.y, dockEnd + 0.5);
  volume.lamp(DOCK_X - origin.x, sea + 3, dockEnd - origin.z, 14);

  // A fire on the beach, with logs to sit on.
  const fire = { x: -10, z: Math.round(shore(-10) + 5) };
  {
    const y = surface(fire.x, fire.z);
    for (const [dx, dz] of [
      [-2, 0],
      [2, 0],
      [0, 2],
    ]) {
      const { vx, vz } = at(fire.x + dx, fire.z + dz);
      volume.set(vx, y, vz, B.OakLog);
    }
    const { vx, vz } = at(fire.x, fire.z);
    volume.lamp(vx, y, vz, 15);
  }

  // Trees on the hill, a few bushes, flowers in the grass.
  const plant = (x: number, z: number, grow: (vx: number, vy: number, vz: number) => void) => {
    const { vx, vz } = at(x, z);
    const y = grassAt(volume, vx, vz);
    if (y >= 0 && !volume.get(vx, y + 1, vz)) grow(vx, y + 1, vz);
  };
  for (const [x, z] of [
    [26, 6],
    [24, 16],
    [-18, 22],
    [-30, 14],
    [8, 22],
    [36, 12],
    [-40, 24],
  ]) {
    plant(x, z, (vx, vy, vz) => oak(volume, vx, vy, vz, rand));
  }
  for (let k = 0; k < 18; k++) {
    const x = (rand() * 2 - 1) * (sx / 2 - 30);
    const z = 8 + rand() * 30;
    if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 12) continue;
    plant(x, z, (vx, vy, vz) => bush(volume, vx, vy, vz, B.OakLeaves, rand));
  }
  const meadowFlowers: BlockId[] = [B.Dandelion, B.Daisy, B.Poppy, B.Cornflower, B.Allium];
  for (let vz = 0; vz < volume.sz; vz++) {
    for (let vx = 0; vx < volume.sx; vx++) {
      const y = grassAt(volume, vx, vz);
      if (y < 0 || volume.get(vx, y + 1, vz) || volume.get(vx, y, vz) !== B.Grass) continue;
      const x = vx + origin.x;
      const z = vz + origin.z;
      const roll = rand();
      const patch = smoothstep(0.45, 0.7, noise.fbm(x * 0.08 + 31, z * 0.08, 2));
      if (roll < 0.04 + patch * 0.14) {
        volume.set(vx, y + 1, vz, meadowFlowers[Math.floor(rand() * meadowFlowers.length)]);
      } else if (roll < 0.45) volume.set(vx, y + 1, vz, B.Tuft);
    }
  }

  volume.light();
  scene.add(volume.mesh({ look, atlas: tiles, walls: true }));

  // --- Sky and sea -------------------------------------------------------------
  const sunDirection = new THREE.Vector3(-0.3, 0.065, -1);
  const sky = createSky({
    zenith: '#4f61b6',
    middle: '#e98aa6',
    horizon: '#ffb46e',
    below: '#e9a48c',
    sun: { direction: sunDirection, size: 0.16 },
    glow: { colour: '#ff8a52', strength: 0.7 },
  });
  scene.add(sky.group);
  const clouds = createClouds({
    altitude: 34,
    cell: 12,
    thickness: 4,
    cover: 0.32,
    colour: '#ffd4c4',
    shadow: '#b9809e',
    fade: '#f0b9a6',
    opacity: 0.9,
    speed: 0.5,
    reach: 300,
    seed: 6,
  });
  scene.add(clouds.group);
  scene.add(
    createSea(look, {
      level: 0.88,
      hole: { x0: origin.x, z0: origin.z, x1: origin.x + volume.sx, z1: origin.z + volume.sz },
      deep: '#2b4f8c',
      shallow: '#5a86c0',
      sun: sunDirection,
      glint: '#ffc27a',
    }),
  );

  // --- Life ----------------------------------------------------------------------
  const lightAt = (p: THREE.Vector3) =>
    volume.brightnessAt(p.clone().add(new THREE.Vector3(0, 0.5, 0))) as [number, number];

  // The pasture, below the house: sheep and cows inside a fence that follows the
  // hill (a post to each block, each finding the ground).
  const pasture = { x0: 7, z0: 6, x1: 16, z1: 15 };
  const fenceMaterial = modelMaterial(look, { light: [0.95, 0] });
  const posts = new THREE.Group();
  {
    const side = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        const piece = new Micro();
        const dirX = Math.sign(bx - ax);
        const dirZ = Math.sign(bz - az);
        piece.box(0, 0, 0, 1, 9, 1, '#8a6a3f');
        for (let s = 0; s < 8; s++)
          piece.put(s * dirX, 3, s * dirZ, '#9b7a4a').put(s * dirX, 6, s * dirZ, '#9b7a4a');
        const mesh = new THREE.Mesh(
          piece.geometry(1 / 8, { centre: { x: 0, y: 0, z: 0 } }),
          fenceMaterial,
        );
        mesh.position.set(x, groundY(x, z), z);
        posts.add(mesh);
      }
    };
    side(pasture.x0, pasture.z0, pasture.x1, pasture.z0);
    side(pasture.x1, pasture.z0, pasture.x1, pasture.z1);
    side(pasture.x1, pasture.z1, pasture.x0, pasture.z1);
    side(pasture.x0, pasture.z1, pasture.x0, pasture.z0);
  }
  scene.add(posts);

  const sheepGeometry = sheep().geometry(1 / 11);
  const brownSheep = sheep('#c9b49a').geometry(1 / 11);
  const cowGeometry = cow().geometry(1 / 10);
  const animals = [
    { geometry: sheepGeometry, x: 2, z: 2, turn: 0.6 },
    { geometry: sheepGeometry, x: 6, z: 4, turn: 2.6 },
    { geometry: brownSheep, x: 4, z: 7, turn: -1.2 },
    { geometry: sheepGeometry, x: 7, z: 8, turn: 1.9 },
    { geometry: cowGeometry, x: 2, z: 6, turn: -0.4 },
    { geometry: cowGeometry, x: 6, z: 1, turn: 3.6 },
  ].map(({ geometry, x, z, turn }, i) => {
    const px = pasture.x0 + x;
    const pz = pasture.z0 + z;
    const where = new THREE.Vector3(px, groundY(px, pz), pz);
    const mesh = new THREE.Mesh(geometry, modelMaterial(look, { light: lightAt(where) }));
    mesh.position.copy(where);
    mesh.rotation.y = turn;
    scene.add(mesh);
    return { mesh, home: where.clone(), turn, phase: i * 1.3 };
  });

  // The dock's lantern, a boat tied up beside it, another drawn up on the sand.
  const lanternMaterial = modelMaterial(look, { shine: 1.6 });
  const dockPost = new THREE.Mesh(
    post(18).geometry(1 / 10),
    modelMaterial(look, { light: lightAt(dockLamp) }),
  );
  dockPost.position.copy(dockLamp);
  const dockLantern = new THREE.Mesh(
    lantern().geometry(1 / 10, { centre: { x: 3, y: 9.5, z: 3 } }),
    lanternMaterial,
  );
  dockLantern.position.set(dockLamp.x - 0.25, dockLamp.y + 1.55, dockLamp.z + 0.1);
  scene.add(dockPost, dockLantern);
  const boatGeometry = rowboat().geometry(1 / 9);
  const boatMaterial = modelMaterial(look, { light: [0.95, 0] });
  const tiedBoat = new THREE.Mesh(boatGeometry, boatMaterial);
  tiedBoat.position.set(DOCK_X + 3.2, 0.7, dockEnd + 4);
  tiedBoat.rotation.y = 0.15;
  const beachedBoat = new THREE.Mesh(boatGeometry, boatMaterial);
  beachedBoat.position.set(fire.x + 6, groundY(fire.x + 6, fire.z - 1), fire.z - 1);
  beachedBoat.rotation.set(0, 1.2, 0.08);
  scene.add(tiedBoat, beachedBoat);

  // The beach fire.
  const fireY = groundY(fire.x, fire.z);
  const fireFlames = new THREE.Mesh(flames().geometry(1 / 12), modelMaterial(look, { shine: 1.5 }));
  fireFlames.position.set(fire.x + 0.5, fireY + 0.15, fire.z + 0.5);
  const fireLogs = new THREE.Mesh(
    logs().geometry(1 / 12),
    modelMaterial(look, { light: [0.8, 1] }),
  );
  fireLogs.position.set(fire.x + 0.5, fireY, fire.z + 0.5);
  scene.add(fireFlames, fireLogs);

  // Gulls over the water.
  const gullParts = gull();
  const gullBody = gullParts.body.geometry(1 / 9);
  const gullWing = gullParts.wing.geometry(1 / 9, { centre: { x: 0, y: 0, z: 0 } });
  const gullMaterial = modelMaterial(look, { light: [1, 0] });
  const gulls = Array.from({ length: lite ? 3 : 5 }, (_, i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(gullBody, gullMaterial));
    const wings = [-1, 1].map((side) => {
      const wing = new THREE.Mesh(gullWing, gullMaterial);
      wing.scale.x = side;
      group.add(wing);
      return wing;
    });
    scene.add(group);
    return {
      group,
      wings,
      centre: new THREE.Vector2(-10 + rand() * 40, -24 - rand() * 20),
      radius: 6 + rand() * 8,
      height: 9 + rand() * 7,
      phase: rand() * Math.PI * 2,
      pace: 0.18 + rand() * 0.1,
    };
  });

  // Smoke from the chimney, sparks from the fire, motes in the gold, fireflies by the house.
  const smoke = drift(look, {
    count: 46,
    centre: chimneyTop.clone().add(new THREE.Vector3(0.6, 3.5, 0)),
    extent: new THREE.Vector3(0.9, 3.5, 0.9),
    colours: ['#d9d2cc', '#c6bcb6', '#e8e2dc', '#b8aea8'],
    size: [0.22, 0.36],
    rise: 0.55,
    wobble: 0.5,
    brightness: 0.95,
    seed: 9,
  });
  const sparks = drift(look, {
    count: 24,
    centre: new THREE.Vector3(fire.x + 0.5, fireY + 1.6, fire.z + 0.5),
    extent: new THREE.Vector3(0.4, 1.6, 0.4),
    colours: ['#ffb347', '#ff7a2a', '#ffe08a'],
    size: [0.05, 0.08],
    rise: 0.8,
    wobble: 0.25,
    brightness: 1.7,
    seed: 4,
  });
  const motes = drift(look, {
    count: lite ? 100 : 200,
    centre: new THREE.Vector3(-4, 6, 4),
    extent: new THREE.Vector3(30, 5, 22),
    colours: ['#fff2c0', '#ffe39a', '#ffd0e0'],
    size: [0.035, 0.06],
    rise: 0.06,
    wobble: 0.8,
  });
  const fireflies = drift(look, {
    count: lite ? 30 : 60,
    centre: new THREE.Vector3(HOUSE.x + 6, houseBase + origin.y, HOUSE.z + 4),
    extent: new THREE.Vector3(14, 2, 10),
    colours: ['#fff2a0', '#d8ff7a'],
    size: [0.06, 0.09],
    rise: 0.04,
    wobble: 1,
    brightness: 1.7,
    blink: true,
    seed: 15,
  });
  const hearts = burst(look, { colours: ['#ff5c8a', '#ff8fb0', '#ffd36b'] });
  scene.add(smoke.points, sparks.points, motes.points, fireflies.points, hearts.points);

  // --- The reasons: balloons of wool, drifting along the shore -----------------------
  const rest: Pose = {
    position: new THREE.Vector3(-9, groundY(-9, 36) + 5.5, 36),
    look: new THREE.Vector3(3, 5.5, -12),
  };
  const envelopes = ENVELOPES.map(([a, b]) =>
    balloon(a, b).geometry(PIXEL, { centre: { x: 0.5, y: 13, z: 0.5 } }),
  );
  const anchors = Array.from({ length: count }, (_, i) => {
    const spread = count > 1 ? i / (count - 1) : 0.5;
    // Out over the water and the beach, between the sun and the house.
    const angle = (spread - 0.5) * 0.72 + 0.02;
    const reach = 26 + (i % 3) * 7 + rand() * 3;
    const group = new THREE.Group();
    const x = rest.position.x + Math.sin(angle) * reach;
    const z = rest.position.z - Math.cos(angle) * reach;
    const base = rest.position.y - 1 + ((i * 3) % 4) * 1.4 + rand() * 0.8;
    group.position.set(x, base, z);
    group.userData['reason'] = i;
    const material = modelMaterial(look, { light: [1, 0], shine: 1.3 });
    const body = new THREE.Mesh(envelopes[i % envelopes.length], material);
    group.add(body);
    group.add(touchBox(3, 5.4, 3, -0.4));
    scene.add(group);
    return {
      group,
      body,
      material,
      base,
      x,
      phase: rand() * Math.PI * 2,
      scale: 1,
      drift: rand() * 0.4 + 0.2,
    };
  });

  let selected: number | null = null;
  let hovered: number | null = null;
  let read: ReadonlySet<number> = new Set();
  let wide = true;
  const target = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const next = new THREE.Vector3();

  const world: World = {
    scene,
    anchors: anchors.map((a) => a.group),
    // In from over the sea, low, toward the house on the hill.
    arrive: {
      position: new THREE.Vector3(-22, 22, -50),
      look: new THREE.Vector3(12, 6, 0),
    },
    rest,
    focus(index) {
      const a = anchors[index];
      target.set(a.group.position.x, a.base + 1.1, a.group.position.z);
      const back = new THREE.Vector3().subVectors(rest.position, target).setY(0).normalize();
      side.crossVectors(back, up).normalize().negate();
      const position = target
        .clone()
        .addScaledVector(back, wide ? 9 : 10.5)
        .add(new THREE.Vector3(0, 0.6, 0));
      const aim = target.clone();
      if (wide) aim.addScaledVector(side, 2.6);
      else aim.y -= 1.8;
      return { position, look: aim };
    },
    fov: 52,
    exposure: 1,
    bloom: { strength: 0.5, radius: 0.4, threshold: 0.95 },
    sway: 0.7,
    depthOfField: 0,
    update(dt, time, camera) {
      wide = camera.aspect > 1;
      look.tick(time);
      sky.update(time);
      clouds.update(dt, camera);
      anchors.forEach((a, i) => {
        const open = selected === i;
        const lit = hovered === i;
        a.scale = approach(a.scale, open ? 1.08 : lit ? 1.06 : 1, 6, dt);
        a.body.scale.setScalar(a.scale);
        a.group.position.y = a.base + Math.sin(time * 0.5 + a.phase) * 0.35;
        // Drifting with the sea breeze, a little way and back.
        a.group.position.x = a.x + Math.sin(time * 0.06 * a.drift + a.phase) * 1.4;
        a.body.rotation.y = time * 0.08 * a.drift + a.phase;
        a.body.rotation.z = Math.sin(time * 0.6 + a.phase) * 0.04;
        const shine = a.material.uniforms['shine'];
        const flare = open
          ? 2
          : lit
            ? 1.8
            : read.has(i)
              ? 1.1
              : 1.3 + Math.max(0, Math.sin(time * 1.3 + a.phase * 3)) * 0.5;
        shine.value = approach(shine.value, flare, 6, dt);
      });
      // The animals graze: heads down and up, a slow turn now and then.
      for (const animal of animals) {
        animal.mesh.rotation.x = Math.max(0, Math.sin(time * 0.4 + animal.phase)) * 0.09;
        animal.mesh.rotation.y = animal.turn + Math.sin(time * 0.05 + animal.phase) * 0.6;
      }
      // The boat by the dock rides the swell.
      const swell = (x: number, z: number) =>
        Math.sin(z * 0.35 + time * 1.1) * 0.09 + Math.sin(x * 0.22 + z * 0.12 - time * 0.7) * 0.05;
      tiedBoat.position.y = 0.7 + swell(tiedBoat.position.x, tiedBoat.position.z);
      tiedBoat.rotation.z = Math.sin(time * 1.1) * 0.05;
      tiedBoat.rotation.x = Math.cos(time * 0.9) * 0.04;
      fireFlames.scale.set(1 + Math.sin(time * 9) * 0.06, 1 + Math.sin(time * 13 + 1) * 0.12, 1);
      for (const g of gulls) {
        const t = time * g.pace + g.phase;
        const where = (s: number, out: THREE.Vector3) =>
          out.set(
            g.centre.x + Math.cos(s) * g.radius,
            g.height + Math.sin(s * 2) * 0.8,
            g.centre.y + Math.sin(s) * g.radius * 0.6,
          );
        where(t, g.group.position);
        g.group.lookAt(where(t + 0.02, next));
        g.group.rotateZ(-0.3);
        const beat = Math.sin(time * 4 + g.phase * 3);
        const glide = beat > 0.4 ? 0.08 : beat * 0.5;
        g.wings[0].rotation.z = glide;
        g.wings[1].rotation.z = -glide;
      }
    },
    select(index) {
      if (index !== null && index !== selected) {
        const a = anchors[index];
        hearts.emit(new THREE.Vector3(a.group.position.x, a.base + 3, a.group.position.z), 10);
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
      for (const g of envelopes) g.dispose();
    },
  };
  return world;
};
