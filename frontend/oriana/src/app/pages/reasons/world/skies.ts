import * as THREE from 'three';
import { B, atlas } from '../../../voxel/blocks';
import { lantern, post, wishingStar } from '../../../voxel/models';
import { bush, cherry, grassAt, island, oak } from '../../../voxel/nature';
import { mulberry } from '../../../voxel/noise';
import { burst, drift } from '../../../voxel/particles';
import { approach, disposeScene, touchBox } from '../../../voxel/scene';
import { createLook, modelMaterial } from '../../../voxel/shading';
import { createClouds, createSky } from '../../../voxel/sky';
import { Volume } from '../../../voxel/volume';
import type { Pose, World, WorldBuilder } from './runtime';

const PIXEL = 1 / 10;
const STAR_GOLD = ['#ffc94a', '#fff0a8', '#f0a020'] as const;
const STAR_ROSE = ['#ff86b0', '#ffc0d6', '#d9557f'] as const;

/**
 * Above the clouds at night: floating islands with cherry trees and lanterns,
 * a sea of block clouds below lit by a square moon, every star out. Each
 * reason is a wishing star near enough to touch; those she has read are
 * joined, dot by dot, into a constellation.
 */
export const buildSkies: WorldBuilder = async ({ lite, count }) => {
  const scene = new THREE.Scene();
  const rand = mulberry(77);
  const tiles = atlas();

  const look = createLook({
    sky: '#8391cf',
    glow: '#ffb35c',
    ambient: 0.1,
    fog: '#1c2552',
    fogNear: 60,
    fogFar: 150,
    wind: 0.6,
    daylight: 0.15,
  });

  const volume = new Volume(128, 56, 128, new THREE.Vector3(-64, 10, -100));
  const { origin } = volume;
  const local = (x: number, y: number, z: number) =>
    [x - origin.x, y - origin.y, z - origin.z] as const;

  // The island she stands on, and others drifting near and far.
  const islands: {
    x: number;
    y: number;
    z: number;
    r: number;
    grow: 'cherry' | 'oak' | 'none';
    lamp: boolean;
  }[] = [
    { x: 0, y: 30, z: 9, r: 7.5, grow: 'cherry', lamp: true },
    { x: -21, y: 35, z: -16, r: 6, grow: 'cherry', lamp: true },
    { x: 23, y: 27, z: -24, r: 7, grow: 'oak', lamp: true },
    { x: -6, y: 41, z: -48, r: 5, grow: 'cherry', lamp: false },
    { x: 31, y: 39, z: 3, r: 4, grow: 'none', lamp: true },
    { x: -33, y: 25, z: 6, r: 5, grow: 'oak', lamp: false },
    { x: 8, y: 32, z: -80, r: 11, grow: 'cherry', lamp: true },
    { x: -40, y: 44, z: -62, r: 7, grow: 'oak', lamp: false },
    { x: 44, y: 31, z: -60, r: 8, grow: 'cherry', lamp: false },
  ];
  const lamps: THREE.Vector3[] = [];
  for (const spot of islands) {
    const [vx, vy, vz] = local(spot.x, spot.y, spot.z);
    island(volume, vx, vy, vz, spot.r, rand);
    // A few flowers and tufts on top.
    const reach = Math.ceil(spot.r);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const y = grassAt(volume, vx + dx, vz + dz);
        if (y < 0 || volume.get(vx + dx, y + 1, vz + dz)) continue;
        const roll = rand();
        if (roll < 0.1) volume.set(vx + dx, y + 1, vz + dz, rand() < 0.5 ? B.Rose : B.Cornflower);
        else if (roll < 0.14) volume.set(vx + dx, y + 1, vz + dz, B.Allium);
        else if (roll < (spot === islands[0] ? 0.2 : 0.45))
          volume.set(vx + dx, y + 1, vz + dz, B.Tuft);
      }
    }
    // A tree, a little off the middle.
    const tx = vx + (spot === islands[0] ? -4 : Math.round((rand() - 0.5) * spot.r * 0.6));
    const tz = vz + (spot === islands[0] ? 3 : Math.round((rand() - 0.5) * spot.r * 0.6));
    const ty = grassAt(volume, tx, tz);
    if (ty >= 0) {
      volume.set(tx, ty + 1, tz, B.Air);
      if (spot.grow === 'cherry') cherry(volume, tx, ty + 1, tz, rand);
      else if (spot.grow === 'oak') oak(volume, tx, ty + 1, tz, rand);
      else bush(volume, tx, ty + 1, tz, B.CherryLeaves, rand);
    }
    if (spot.lamp) {
      const lx = vx + (spot === islands[0] ? 3 : Math.round(spot.r * 0.4));
      const lz = vz + (spot === islands[0] ? 1 : Math.round(spot.r * 0.3));
      const ly = grassAt(volume, lx, lz);
      if (ly >= 0) {
        volume.set(lx, ly + 1, lz, B.Air);
        lamps.push(new THREE.Vector3(lx + origin.x + 0.5, ly + 1 + origin.y, lz + origin.z + 0.5));
        volume.lamp(lx, ly + 2, lz, 15);
      }
    }
  }
  // Water spilling off the edge of the near-left island, down into the clouds.
  {
    const [fx, , fz] = local(-21 + 5, 35, -16 + 2);
    const top = volume.top(fx - 1, fz, true);
    if (top >= 0) {
      for (let y = top; y >= 0; y--) volume.set(fx, y, fz, B.Water);
      volume.set(fx - 1, top, fz, B.Water);
    }
  }

  volume.light();
  scene.add(volume.mesh({ look, atlas: tiles }));

  const sky = createSky({
    zenith: '#070b24',
    horizon: '#2b3a73',
    below: '#1c2552',
    moon: { direction: new THREE.Vector3(0.58, 0.27, -1), size: 0.12 },
    glow: { colour: '#5a6fc0', strength: 0.5 },
    stars: { count: lite ? 900 : 1600, brightness: 1.1 },
  });
  scene.add(sky.group);
  const cloudSea = createClouds({
    altitude: 14,
    cell: 8,
    thickness: 4,
    cover: 0.56,
    colour: '#8e9bd0',
    shadow: '#3a4479',
    fade: '#24305f',
    opacity: 0.97,
    speed: 0.35,
    reach: 240,
    seed: 12,
  });
  scene.add(cloudSea.group);
  const high = createClouds({
    altitude: 66,
    cell: 12,
    thickness: 3,
    cover: 0.25,
    colour: '#5c6aa6',
    shadow: '#323c70',
    opacity: 0.45,
    speed: 0.7,
    reach: 260,
    seed: 3,
  });
  scene.add(high.group);

  // Lanterns on posts, glowing (the light they shed is in the blocks round them).
  const lanternGeometry = lantern().geometry(PIXEL * 0.9, { centre: { x: 3, y: 9.5, z: 3 } });
  const postGeometry = post(18).geometry(PIXEL);
  const lampMaterial = modelMaterial(look, { shine: 1.6 });
  for (const at of lamps) {
    const [s, g] = volume.brightnessAt(at.clone().add(new THREE.Vector3(0, 1, 0)));
    const wood = new THREE.Mesh(postGeometry, modelMaterial(look, { light: [s, g] }));
    wood.position.copy(at);
    const hanging = new THREE.Mesh(lanternGeometry, lampMaterial);
    hanging.position.set(at.x - 0.25, at.y + 1.55, at.z + PIXEL);
    scene.add(wood, hanging);
  }

  const fireflies = drift(look, {
    count: lite ? 70 : 140,
    centre: new THREE.Vector3(0, 34, -10),
    extent: new THREE.Vector3(30, 6, 26),
    colours: ['#d8ff7a', '#fff2a0', '#b8f060'],
    size: [0.07, 0.1],
    rise: 0.05,
    wobble: 1.4,
    brightness: 1.8,
    blink: true,
  });
  scene.add(fireflies.points);
  const hearts = burst(look, {
    shape: 'sparkle',
    colours: ['#fff0a8', '#ffc94a', '#ffffff'],
    size: 0.5,
  });
  scene.add(hearts.points);

  // The reasons: wishing stars over the clouds, in an arc before her.
  const rest: Pose = {
    position: new THREE.Vector3(1.5, 31 + 2.5, 10.5),
    look: new THREE.Vector3(1.5, 32.2, -20),
  };
  const golden = wishingStar(...STAR_GOLD).geometry(PIXEL, { centre: { x: 0.5, y: 0.5, z: 0.5 } });
  const rosy = wishingStar(...STAR_ROSE).geometry(PIXEL, { centre: { x: 0.5, y: 0.5, z: 0.5 } });
  const anchors = Array.from({ length: count }, (_, i) => {
    const spread = count > 1 ? i / (count - 1) : 0.5;
    const angle = (spread - 0.5) * 1.15;
    const reach = 11 + (i % 3) * 4 + rand() * 2;
    const group = new THREE.Group();
    group.position.set(
      rest.position.x + Math.sin(angle) * reach,
      rest.position.y + 0.6 + Math.sin(i * 2.1) * 1.4 + (i % 2) * 0.8,
      rest.position.z - Math.cos(angle) * reach,
    );
    group.userData['reason'] = i;
    const material = modelMaterial(look, { shine: 1.1 });
    const star = new THREE.Mesh(golden, material);
    group.add(star);
    group.add(touchBox(2, 2, 1.2, 0));
    scene.add(group);
    return { group, star, material, phase: rand() * Math.PI * 2, scale: 1, base: group.position.y };
  });

  // The constellation: square dots of light between the stars she has read.
  const dotsMaterial = new THREE.PointsMaterial({
    color: new THREE.Color('#ffe9a8').multiplyScalar(1.4),
    size: 3,
    sizeAttenuation: false,
  });
  const constellation = new THREE.Points(new THREE.BufferGeometry(), dotsMaterial);
  constellation.frustumCulled = false;
  scene.add(constellation);
  const joinRead = (read: ReadonlySet<number>) => {
    const dots: number[] = [];
    const lit = anchors.filter((_, i) => read.has(i));
    for (let k = 1; k < lit.length; k++) {
      const a = lit[k - 1].group.position;
      const b = lit[k].group.position;
      const steps = Math.ceil(a.distanceTo(b) / 0.45);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        dots.push(
          a.x + (b.x - a.x) * t,
          lit[k - 1].base + (lit[k].base - lit[k - 1].base) * t,
          a.z + (b.z - a.z) * t,
        );
      }
    }
    constellation.geometry.dispose();
    constellation.geometry = new THREE.BufferGeometry();
    constellation.geometry.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  };

  let selected: number | null = null;
  let hovered: number | null = null;
  let read: ReadonlySet<number> = new Set();
  let wide = true;
  const starAt = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const world: World = {
    scene,
    anchors: anchors.map((a) => a.group),
    arrive: {
      position: new THREE.Vector3(0, 58, 30),
      look: new THREE.Vector3(0, 30, -30),
    },
    rest,
    focus(index) {
      const star = anchors[index].group;
      starAt.set(star.position.x, anchors[index].base, star.position.z);
      const back = new THREE.Vector3().subVectors(rest.position, starAt).setY(0).normalize();
      side.crossVectors(back, up).normalize().negate();
      const position = starAt
        .clone()
        .addScaledVector(back, wide ? 7 : 8)
        .add(new THREE.Vector3(0, 0.3, 0));
      const target = starAt.clone();
      if (wide) target.addScaledVector(side, 1.7);
      else target.y -= 1.1;
      return { position, look: target };
    },
    fov: 52,
    exposure: 1,
    bloom: { strength: 0.6, radius: 0.45, threshold: 0.82 },
    sway: 0.5,
    depthOfField: 0,
    update(dt, time, camera) {
      wide = camera.aspect > 1;
      look.tick(time);
      sky.update(time);
      cloudSea.update(dt, camera);
      high.update(dt, camera);
      anchors.forEach((a, i) => {
        const open = selected === i;
        const lit = hovered === i;
        a.scale = approach(a.scale, open ? 1.25 : lit ? 1.12 : 1, 6, dt);
        a.star.scale.setScalar(a.scale);
        a.group.position.y = a.base + Math.sin(time * 1.1 + a.phase) * 0.18;
        // Turning slowly to show it is solid, but always mostly facing her.
        a.star.rotation.y =
          Math.sin(time * 0.6 + a.phase) * 0.5 +
          Math.atan2(rest.position.x - a.group.position.x, rest.position.z - a.group.position.z);
        a.star.rotation.z = Math.sin(time * 0.8 + a.phase) * 0.12;
        const done = read.has(i);
        const shine = a.material.uniforms['shine'];
        shine.value = approach(shine.value, open ? 1.25 : lit ? 1.3 : 1.05, 5, dt);
        const mesh = a.star;
        const want = done ? rosy : golden;
        if (mesh.geometry !== want) mesh.geometry = want;
      });
      dotsMaterial.color.setRGB(1.4, 1.28, 0.9).multiplyScalar(0.85 + Math.sin(time * 1.4) * 0.15);
    },
    select(index) {
      if (index !== null && index !== selected) {
        hearts.emit(anchors[index].group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 10);
      }
      selected = index;
    },
    hover(index) {
      hovered = index;
    },
    setRead(next) {
      read = next;
      joinRead(next);
    },
    dispose() {
      disposeScene(scene);
      // The star not in use when she left is not in the scene to be found.
      golden.dispose();
      rosy.dispose();
    },
  };
  return world;
};
