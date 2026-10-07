import * as THREE from 'three';
import { B, BlockId, atlas } from '../../voxel/blocks';
import { bush, cherry, grassAt, oak } from '../../voxel/nature';
import { Noise, mulberry } from '../../voxel/noise';
import { drift } from '../../voxel/particles';
import { disposeScene, smoothstep } from '../../voxel/scene';
import { createLook } from '../../voxel/shading';
import { createClouds, createSky } from '../../voxel/sky';
import { Volume } from '../../voxel/volume';

export interface Panorama {
  resize(): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

/**
 * Behind the title, as a blocky game's title screen has: a little world at
 * sunset (cherry trees, a pond, flowers to the hills) turning slowly round
 * the camera, for ever.
 */
export function createPanorama(canvas: HTMLCanvasElement): Panorama {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
  const noise = new Noise(77);
  const rand = mulberry(12);
  const look = createLook({
    sky: '#ffdcc4',
    ambient: 0.2,
    fog: '#f3c2b8',
    fogNear: 40,
    fogFar: 92,
    daylight: 0.5,
  });

  const size = 88;
  const volume = new Volume(size, 34, size, new THREE.Vector3(-size / 2, -8, -size / 2));
  const { origin } = volume;
  const pond = (x: number, z: number) => 1 - Math.hypot((x - 9) / 6, (z + 3) / 4.5);
  const ground = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const hills = (noise.fbm(x * 0.05 + 3, z * 0.05 + 8, 3) - 0.5) * 6 * smoothstep(8, 22, r);
    const rim = smoothstep(20, 44, r) * 8;
    return Math.round(hills + rim - Math.max(0, pond(x, z)) * 3);
  };
  for (let vz = 0; vz < size; vz++) {
    for (let vx = 0; vx < size; vx++) {
      const x = vx + origin.x;
      const z = vz + origin.z;
      const top = ground(x, z) - origin.y;
      const wet = pond(x, z) > -0.15;
      volume.fill(vx, 0, vz, vx, top - 3, vz, B.Stone);
      volume.fill(vx, top - 2, vz, vx, top - 1, vz, B.Dirt);
      volume.set(vx, top, vz, wet ? B.Sand : B.Grass);
      if (wet) volume.fill(vx, top + 1, vz, vx, -origin.y, vz, B.Water);
    }
  }
  const plant = (x: number, z: number, grow: (vx: number, vy: number, vz: number) => void) => {
    const vx = x - origin.x;
    const vz = z - origin.z;
    const y = grassAt(volume, vx, vz);
    if (y >= 0) grow(vx, y + 1, vz);
  };
  for (const [x, z] of [
    [-9, -8],
    [7, 9],
    [-12, 10],
    [16, -14],
    [-2, -20],
    [-22, -2],
  ]) {
    plant(x, z, (vx, vy, vz) => cherry(volume, vx, vy, vz, rand));
  }
  for (const [x, z] of [
    [20, 6],
    [-18, -18],
    [4, 24],
    [-26, 16],
  ]) {
    plant(x, z, (vx, vy, vz) => oak(volume, vx, vy, vz, rand));
  }
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2;
    const r = 12 + rand() * 24;
    plant(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), (vx, vy, vz) =>
      bush(volume, vx, vy, vz, rand() < 0.5 ? B.CherryLeaves : B.OakLeaves, rand),
    );
  }
  const flowers: BlockId[] = [
    B.Rose,
    B.Cornflower,
    B.Cornflower,
    B.Rose,
    B.PinkTulip,
    B.Allium,
    B.Daisy,
  ];
  for (let vz = 0; vz < size; vz++) {
    for (let vx = 0; vx < size; vx++) {
      const y = grassAt(volume, vx, vz);
      if (y < 0 || volume.get(vx, y + 1, vz)) continue;
      const roll = rand();
      if (roll < 0.22) volume.set(vx, y + 1, vz, flowers[Math.floor(rand() * flowers.length)]);
      else if (roll < 0.5) volume.set(vx, y + 1, vz, B.Tuft);
    }
  }
  volume.light();
  scene.add(volume.mesh({ look, atlas: atlas(), walls: true }));

  const sky = createSky({
    zenith: '#5a6cc4',
    middle: '#ec9db6',
    horizon: '#ffc489',
    below: '#f3c2b8',
    sun: { direction: new THREE.Vector3(-0.6, 0.12, -1), size: 0.14 },
    glow: { colour: '#ff9a6a', strength: 0.7 },
  });
  const clouds = createClouds({
    altitude: 26,
    cell: 10,
    thickness: 3,
    cover: 0.4,
    colour: '#ffdcd2',
    shadow: '#c48aa6',
    fade: '#f6c4b8',
    opacity: 0.9,
    reach: 200,
    seed: 2,
  });
  const petals = drift(look, {
    count: 160,
    centre: new THREE.Vector3(0, 6, 0),
    extent: new THREE.Vector3(24, 5, 24),
    colours: ['#f7b7d2', '#f9c9de', '#f0a2c4', '#fde0ec'],
    size: [0.14, 0.2],
    shape: 'petal',
    rise: -0.3,
    wobble: 0.9,
    seed: 3,
  });
  scene.add(sky.group, clouds.group, petals.points);

  const eye = ground(0, 0) + 4.5;
  const clock = new THREE.Timer();
  let frame = 0;
  let paused = false;
  let disposed = false;

  const tick = (now: number) => {
    if (disposed || paused) return;
    frame = requestAnimationFrame(tick);
    clock.update(now);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsed();
    // Turning, slowly, looking out a little below the horizon.
    const yaw = time * 0.045 + 0.6;
    camera.position.set(0, eye, 0);
    camera.lookAt(Math.cos(yaw) * 10, eye - 1.6, Math.sin(yaw) * 10);
    look.tick(time);
    sky.update(time);
    clouds.update(dt, camera);
    renderer.render(scene, camera);
  };

  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 82 : 70;
    camera.updateProjectionMatrix();
  };
  resize();
  frame = requestAnimationFrame(tick);

  return {
    resize,
    setPaused(on) {
      if (on === paused || disposed) return;
      paused = on;
      if (paused) cancelAnimationFrame(frame);
      else frame = requestAnimationFrame(tick);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      disposeScene(scene);
      renderer.dispose();
    },
  };
}
