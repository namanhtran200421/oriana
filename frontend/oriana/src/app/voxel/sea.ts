import * as THREE from 'three';
import type { Look } from './shading';
import { SWELL } from './shading';

export interface SeaOptions {
  /** The height of the water's surface. */
  level: number;
  /** The land, as a box of blocks, that the open sea goes round (its own water fills it). */
  hole: { x0: number; z0: number; x1: number; z1: number };
  deep: THREE.ColorRepresentation;
  shallow: THREE.ColorRepresentation;
  /** Where the sun is, for the road of light it lays on the water. */
  sun: THREE.Vector3;
  glint: THREE.ColorRepresentation;
  reach?: number;
}

/**
 * The open sea, out to the horizon: one great sheet round the land, rising
 * and falling with the same swell as the blocks of water near the shore,
 * pixel-flecked, and laid with a road of light toward the setting sun.
 */
export function createSea(look: Look, options: SeaOptions): THREE.Mesh {
  const reach = options.reach ?? 1600;
  const { x0, z0, x1, z1 } = options.hole;
  // Four sheets round the hole, each cut in strips so the swell can bend them near the shore.
  const parts: THREE.BufferGeometry[] = [];
  const sheet = (ax: number, az: number, bx: number, bz: number) => {
    const w = bx - ax;
    const d = bz - az;
    if (w <= 0 || d <= 0) return;
    const g = new THREE.PlaneGeometry(
      w,
      d,
      Math.min(64, Math.ceil(w / 6)),
      Math.min(64, Math.ceil(d / 6)),
    );
    g.rotateX(-Math.PI / 2);
    g.translate(ax + w / 2, 0, az + d / 2);
    parts.push(g);
  };
  sheet(-reach, -reach, reach, z0);
  sheet(-reach, z1, reach, reach);
  sheet(-reach, z0, x0, z1);
  sheet(x1, z0, reach, z1);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const index: number[] = [];
  for (const g of parts) {
    const base = positions.length / 3;
    positions.push(...(g.attributes['position'].array as Float32Array));
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i++) index.push(idx[i] + base);
    g.dispose();
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: look.uniforms.time,
      fogColor: look.uniforms.fogColor,
      fogNear: look.uniforms.fogNear,
      fogFar: look.uniforms.fogFar,
      skyTint: look.uniforms.skyTint,
      deep: { value: new THREE.Color(options.deep) },
      shallow: { value: new THREE.Color(options.shallow) },
      glint: { value: new THREE.Color(options.glint) },
      sun: { value: options.sun.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec3 vWorld;
      varying float vDistance;
      ${SWELL}
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // The swell dies away far out, where it could only shimmer.
        world.y += swellAt(world.xz, time) * (1.0 - smoothstep(60.0, 220.0, length(world.xz - cameraPosition.xz)));
        vWorld = world.xyz;
        vec4 view = viewMatrix * world;
        vDistance = length(view.xyz);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform vec3 skyTint;
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform vec3 glint;
      uniform vec3 sun;
      varying vec3 vWorld;
      varying float vDistance;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        // In blocky pixels: everything is worked out at the middle of an eighth of a block.
        vec2 cell = floor(vWorld.xz * 2.0);
        vec3 toEye = normalize(cameraPosition - vWorld);
        float facing = pow(1.0 - max(toEye.y, 0.0), 3.0);
        vec3 colour = mix(deep, shallow, 0.35 + 0.25 * facing) * skyTint;
        // Ripples: flecks of lighter and darker water drifting with the swell.
        float ripple = hash(cell + floor(time * 1.5 + cell.x * 0.13));
        colour *= 0.92 + 0.12 * ripple;
        // The road of light toward the sun: glittering pixels, thicker near the sun.
        vec3 toSun = normalize(vec3(sun.x, 0.0, sun.z));
        vec3 across = normalize(vec3(vWorld.x - cameraPosition.x, 0.0, vWorld.z - cameraPosition.z));
        float along = max(dot(across, toSun), 0.0);
        float road = pow(along, 90.0) + pow(along, 900.0) * 2.0;
        float sparkle = step(0.82 - road * 0.5, hash(cell + floor(time * 4.0)));
        colour += glint * road * (0.35 + sparkle * 1.4);
        colour = mix(colour, fogColor, smoothstep(fogNear, fogFar, vDistance) * 0.85);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sea = new THREE.Mesh(geometry, material);
  sea.position.y = options.level;
  sea.frustumCulled = false;
  sea.name = 'sea';
  return sea;
}
