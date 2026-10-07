import * as THREE from 'three';
import { Noise, mulberry } from './noise';

/**
 * The sky of a blocky world: a gradient overhead, a square sun or a square
 * moon, square stars, and a flat layer of block clouds drifting one way.
 * Everything but the clouds is drawn at infinite distance, behind it all.
 */

export interface SkyOptions {
  zenith: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  /** A band between the horizon and the zenith, as at sunset (pink between gold and blue). */
  middle?: THREE.ColorRepresentation;
  /** Below the horizon (seen past the edge of things), the colour of the fog. */
  below?: THREE.ColorRepresentation;
  /** A wash of warm light round the sun (or the moon). */
  glow?: { colour: THREE.ColorRepresentation; strength: number };
  sun?: { direction: THREE.Vector3; size?: number };
  moon?: { direction: THREE.Vector3; size?: number };
  stars?: { count: number; brightness?: number };
}

export interface Sky {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

/** Drawn on the far plane, wherever the camera goes: only the turn of the view counts. */
const AT_INFINITY = /* glsl */ `
  vec4 atInfinity(vec3 direction) {
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * direction, 1.0);
    return p.xyww;
  }
`;

export function createSky(options: SkyOptions): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const disposables: { dispose(): void }[] = [];
  const glowDirection =
    (options.sun ?? options.moon)?.direction.clone().normalize() ?? new THREE.Vector3(0, 1, 0);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(options.zenith) },
        horizon: { value: new THREE.Color(options.horizon) },
        middle: { value: new THREE.Color(options.middle ?? options.horizon) },
        banded: { value: options.middle === undefined ? 0 : 1 },
        below: { value: new THREE.Color(options.below ?? options.horizon) },
        glowColour: { value: new THREE.Color(options.glow?.colour ?? '#ffffff') },
        glowStrength: { value: options.glow?.strength ?? 0 },
        glowDirection: { value: glowDirection },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        ${AT_INFINITY}
        void main() {
          vDirection = position;
          gl_Position = atInfinity(position);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 middle;
        uniform float banded;
        uniform vec3 below;
        uniform vec3 glowColour;
        uniform float glowStrength;
        uniform vec3 glowDirection;
        varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          vec3 colour = mix(horizon, zenith, pow(smoothstep(0.0, 0.75, d.y), 0.7));
          if (banded > 0.5) {
            vec3 low = mix(horizon, middle, smoothstep(0.0, 0.16, d.y));
            colour = mix(low, zenith, smoothstep(0.12, 0.7, d.y));
          }
          colour = mix(colour, below, smoothstep(0.0, -0.08, d.y));
          float toward = max(dot(d, glowDirection), 0.0);
          float band = 1.0 - smoothstep(0.0, 0.45, abs(d.y - 0.04));
          colour += glowColour * glowStrength * (pow(toward, 6.0) * 0.8 + pow(toward, 2.0) * band * 0.5);
          gl_FragColor = vec4(colour, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);
  disposables.push(dome.geometry, dome.material);

  const starsUniforms = { time: { value: 0 }, scale: { value: 1 } };
  if (options.stars) {
    const rand = mulberry(77);
    const { count } = options.stars;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const tints = new Float32Array(count * 3);
    const warm = new THREE.Color('#ffe6b8');
    const cool = new THREE.Color('#cfe0ff');
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      // Uniform over the upper sky, thinning towards the horizon.
      const y = Math.pow(rand(), 0.7) * 0.98 + 0.02;
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions.set([Math.cos(angle) * r, y, Math.sin(angle) * r], i * 3);
      const big = rand();
      sizes[i] = big > 0.985 ? 3 : big > 0.85 ? 2 : 1;
      phases[i] = rand() * Math.PI * 2;
      const tint = rand() < 0.2 ? warm : rand() < 0.3 ? cool : white;
      tints.set([tint.r, tint.g, tint.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { ...starsUniforms, brightness: { value: options.stars.brightness ?? 1 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float phase;
        attribute vec3 tint;
        uniform float time;
        uniform float scale;
        varying vec3 vTint;
        varying float vTwinkle;
        ${AT_INFINITY}
        void main() {
          vTint = tint;
          vTwinkle = 0.65 + 0.35 * sin(time * (0.8 + fract(phase) * 1.6) + phase * 7.0);
          vTwinkle *= smoothstep(0.02, 0.25, position.y);
          // Whole pixels only, so every star stays a crisp little square.
          gl_PointSize = floor(size * scale + 0.5);
          gl_Position = atInfinity(position);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float brightness;
        varying vec3 vTint;
        varying float vTwinkle;
        void main() {
          gl_FragColor = vec4(vTint * vTwinkle * brightness, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    const stars = new THREE.Points(geometry, material);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    stars.onBeforeRender = (renderer) => {
      starsUniforms.scale.value = Math.max(1, Math.round(renderer.getPixelRatio()));
    };
    group.add(stars);
    disposables.push(geometry, material);
  }

  for (const body of ['sun', 'moon'] as const) {
    const spec = options[body];
    if (!spec) continue;
    const texture = body === 'sun' ? sunTexture() : moonTexture();
    const size = spec.size ?? (body === 'sun' ? 0.16 : 0.12);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: texture } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          ${AT_INFINITY}
          void main() {
            vUv = uv;
            gl_Position = atInfinity((modelMatrix * vec4(position, 1.0)).xyz);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          varying vec2 vUv;
          void main() {
            vec4 texel = texture2D(map, vUv);
            if (texel.a < 0.02) discard;
            // A touch past white, for the bloom.
            gl_FragColor = vec4(texel.rgb * texel.a * 1.6, 1.0);
            #include <colorspace_fragment>
          }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    quad.position.copy(spec.direction).normalize();
    quad.lookAt(0, 0, 0);
    quad.frustumCulled = false;
    quad.renderOrder = -8;
    group.add(quad);
    disposables.push(quad.geometry, quad.material, texture);
  }

  return {
    group,
    update(time) {
      starsUniforms.time.value = time;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

function pixelTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** A square sun: a white-gold core in rings of fainter gold, stepped, never round. */
function sunTexture(): THREE.Texture {
  return pixelTexture(32, (ctx) => {
    const rings: [number, string][] = [
      [16, 'rgba(255, 196, 92, 0.10)'],
      [13, 'rgba(255, 206, 110, 0.18)'],
      [11, 'rgba(255, 222, 140, 0.35)'],
      [9, '#fff3b0'],
      [7, '#fffbe6'],
    ];
    for (const [half, colour] of rings) {
      ctx.fillStyle = colour;
      ctx.fillRect(16 - half, 16 - half, half * 2, half * 2);
    }
  });
}

/** A square moon, pale and a little blue, with darker craters. */
function moonTexture(): THREE.Texture {
  return pixelTexture(32, (ctx) => {
    ctx.fillStyle = 'rgba(190, 210, 255, 0.10)';
    ctx.fillRect(2, 2, 28, 28);
    ctx.fillStyle = 'rgba(200, 218, 255, 0.18)';
    ctx.fillRect(5, 5, 22, 22);
    ctx.fillStyle = '#eef2fb';
    ctx.fillRect(8, 8, 16, 16);
    ctx.fillStyle = '#c9d2e6';
    for (const [x, y, w, h] of [
      [11, 10, 3, 3],
      [18, 13, 4, 3],
      [12, 18, 2, 2],
      [17, 19, 3, 2],
      [20, 9, 2, 2],
    ]) {
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 9, 2, 1);
  });
}

export interface CloudOptions {
  altitude: number;
  /** The width of one cloud cell, in blocks. */
  cell?: number;
  thickness?: number;
  /** How much of the sky they cover, 0 to 1. */
  cover?: number;
  colour?: THREE.ColorRepresentation;
  /** The colour their undersides and far edges fade towards. */
  shadow?: THREE.ColorRepresentation;
  /** The colour they fade into toward their far edge (the fog), if not simply thinning away. */
  fade?: THREE.ColorRepresentation;
  opacity?: number;
  /** Blocks per second. */
  speed?: number;
  /** How far they reach before fading, in blocks. */
  reach?: number;
  seed?: number;
}

export interface Clouds {
  group: THREE.Group;
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

const CLOUD_GRID = 48;

/** Flat-topped block clouds in a layer that repeats, drifting slowly the same way. */
export function createClouds(options: CloudOptions): Clouds {
  const cell = options.cell ?? 10;
  const thickness = options.thickness ?? 4;
  const cover = options.cover ?? 0.4;
  const noise = new Noise(options.seed ?? 9);
  const filled = new Uint8Array(CLOUD_GRID * CLOUD_GRID);
  for (let z = 0; z < CLOUD_GRID; z++) {
    for (let x = 0; x < CLOUD_GRID; x++) {
      // A quarter of a lattice step per cell, so clouds come in clumps, wrapping round.
      const n = noise.fbm(x / 4, z / 4, 3, CLOUD_GRID / 4);
      filled[z * CLOUD_GRID + x] = n > 1 - cover - 0.1 ? 1 : 0;
    }
  }
  const at = (x: number, z: number) =>
    filled[((z + CLOUD_GRID) % CLOUD_GRID) * CLOUD_GRID + ((x + CLOUD_GRID) % CLOUD_GRID)];

  const position: number[] = [];
  const shade: number[] = [];
  const index: number[] = [];
  const quad = (corners: number[][], s: number) => {
    const base = position.length / 3;
    for (const c of corners) {
      position.push(...c);
      shade.push(s);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const h = thickness;
  for (let z = 0; z < CLOUD_GRID; z++) {
    for (let x = 0; x < CLOUD_GRID; x++) {
      if (!at(x, z)) continue;
      const x0 = x * cell;
      const x1 = x0 + cell;
      const z0 = z * cell;
      const z1 = z0 + cell;
      // Each cell's top a shade apart from its neighbours', so the layer reads as blocks.
      const tone = 0.93 + ((x * 7 + z * 13) % 5) * 0.018;
      quad(
        [
          [x0, h, z1],
          [x1, h, z1],
          [x1, h, z0],
          [x0, h, z0],
        ],
        tone,
      );
      quad(
        [
          [x0, 0, z0],
          [x1, 0, z0],
          [x1, 0, z1],
          [x0, 0, z1],
        ],
        0.72,
      );
      if (!at(x + 1, z))
        quad(
          [
            [x1, 0, z1],
            [x1, 0, z0],
            [x1, h, z0],
            [x1, h, z1],
          ],
          0.86,
        );
      if (!at(x - 1, z))
        quad(
          [
            [x0, 0, z0],
            [x0, 0, z1],
            [x0, h, z1],
            [x0, h, z0],
          ],
          0.86,
        );
      if (!at(x, z + 1))
        quad(
          [
            [x0, 0, z1],
            [x1, 0, z1],
            [x1, h, z1],
            [x0, h, z1],
          ],
          0.8,
        );
      if (!at(x, z - 1))
        quad(
          [
            [x1, 0, z0],
            [x0, 0, z0],
            [x0, h, z0],
            [x1, h, z0],
          ],
          0.8,
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  const reach = options.reach ?? cell * CLOUD_GRID * 0.5;
  const uniforms = {
    colour: { value: new THREE.Color(options.colour ?? '#ffffff') },
    shadow: { value: new THREE.Color(options.shadow ?? '#c8d4e6') },
    fade: { value: new THREE.Color(options.fade ?? options.colour ?? '#ffffff') },
    fades: { value: options.fade === undefined ? 0 : 1 },
    opacity: { value: options.opacity ?? 0.85 },
    centre: { value: new THREE.Vector2() },
    reach: { value: reach },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float shade;
      varying float vShade;
      varying vec2 vWhere;
      void main() {
        vShade = shade;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWhere = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform vec3 shadow;
      uniform vec3 fade;
      uniform float fades;
      uniform float opacity;
      uniform vec2 centre;
      uniform float reach;
      varying float vShade;
      varying vec2 vWhere;
      void main() {
        float far = distance(vWhere, centre) / reach;
        vec3 c = mix(shadow, colour, vShade);
        c = mix(c, fade, fades * smoothstep(0.15, 0.75, far));
        gl_FragColor = vec4(c, opacity * (1.0 - smoothstep(0.55, 1.0, far)));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  group.name = 'clouds';
  group.position.y = options.altitude;
  const span = cell * CLOUD_GRID;
  const tiles: THREE.Mesh[] = [];
  for (let k = 0; k < 9; k++) {
    const tile = new THREE.Mesh(geometry, material);
    tile.renderOrder = 1;
    tiles.push(tile);
    group.add(tile);
  }
  let drift = 0;
  const speed = options.speed ?? 0.6;

  return {
    group,
    update(dt, camera) {
      drift = (drift + dt * speed) % span;
      const cx = camera.position.x;
      const cz = camera.position.z;
      uniforms.centre.value.set(cx, cz);
      const baseX = Math.floor((cx - drift) / span) * span + drift;
      const baseZ = Math.floor(cz / span) * span;
      let k = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          tiles[k++].position.set(baseX + dx * span, 0, baseZ + dz * span);
        }
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
