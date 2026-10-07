import * as THREE from 'three';
import { mulberry } from './noise';
import type { Look } from './shading';

/**
 * Particles as a blocky world draws them: flat little squares of colour, or
 * tiny pixel pictures (a heart, a sparkle), never soft round blurs.
 */

export type Shape = 'square' | 'heart' | 'sparkle' | 'petal';

const SHAPES: Record<Exclude<Shape, 'square'>, readonly string[]> = {
  heart: ['.XX.XX.', 'XWXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  sparkle: ['...X...', '...X...', '..XWX..', 'XXWWWXX', '..XWX..', '...X...', '...X...'],
  petal: ['.XX', 'XWX', 'XX.'],
};

const textures = new Map<Shape, THREE.Texture>();

/** A shape as a texture: white where it is drawn (the colour comes later), a little whiter in its shine. */
function shapeTexture(shape: Shape): THREE.Texture {
  let texture = textures.get(shape);
  if (texture) return texture;
  const rows = shape === 'square' ? ['X'] : SHAPES[shape];
  const size = Math.max(rows.length, ...rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const top = Math.floor((size - rows.length) / 2);
  rows.forEach((row, y) => {
    const left = Math.floor((size - row.length) / 2);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === 'W' ? '#ffffff' : '#d8d8d8';
      ctx.fillRect(left + x, top + y, 1, 1);
    });
  });
  texture = new THREE.CanvasTexture(canvas);
  // Points read their texture top down.
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  textures.set(shape, texture);
  return texture;
}

const POINT_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vColour;
  varying float vAlive;
  varying float vDistance;
  void main() {
    if (vAlive < 0.5) discard;
    vec4 texel = texture2D(map, gl_PointCoord);
    if (texel.a < 0.5) discard;
    vec3 colour = vColour * texel.rgb / 0.85;
    colour = mix(colour, fogColor, smoothstep(fogNear, fogFar, vDistance) * 0.85);
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

/** World size to pixels, kept in step with the renderer. */
function sizing(points: THREE.Points, uniforms: { scale: THREE.IUniform<number> }) {
  const buffer = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(buffer);
    uniforms.scale.value =
      buffer.y * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
  };
}

export interface DriftOptions {
  count: number;
  /** The box they wander in: its middle and its half-sizes. */
  centre: THREE.Vector3;
  extent: THREE.Vector3;
  colours: readonly string[];
  /** How big each is, in blocks: [smallest, largest]. */
  size: readonly [number, number];
  shape?: Shape;
  /** Blocks per second: up if above 0, falling if below. */
  rise?: number;
  /** How far they waver side to side, in blocks. */
  wobble?: number;
  /** Above 1 to shine (for the bloom). */
  brightness?: number;
  /** Fade in and out, as fireflies do. */
  blink?: boolean;
  seed?: number;
}

export interface Drift {
  points: THREE.Points;
  dispose(): void;
}

/** Many small things drifting in a box for ever: pollen, petals, fireflies, snow. */
export function drift(look: Look, options: DriftOptions): Drift {
  const rand = mulberry(options.seed ?? 3);
  const { count, centre, extent } = options;
  const position = new Float32Array(count * 3);
  const colour = new Float32Array(count * 3);
  const extra = new Float32Array(count * 3);
  const palette = options.colours.map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    position.set(
      [
        centre.x + (rand() * 2 - 1) * extent.x,
        rand() * 2 * extent.y,
        centre.z + (rand() * 2 - 1) * extent.z,
      ],
      i * 3,
    );
    const c = palette[Math.floor(rand() * palette.length)];
    colour.set([c.r, c.g, c.b], i * 3);
    const [lo, hi] = options.size;
    extra.set([lo + rand() * (hi - lo), rand() * Math.PI * 2, 0.6 + rand() * 0.8], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('colour', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('extra', new THREE.BufferAttribute(extra, 3));
  geometry.boundingSphere = new THREE.Sphere(centre.clone(), extent.length() * 2);

  const uniforms = {
    map: { value: shapeTexture(options.shape ?? 'square') },
    scale: { value: 1 },
    bottom: { value: centre.y - extent.y },
    height: { value: extent.y * 2 },
    rise: { value: options.rise ?? 0 },
    wobble: { value: options.wobble ?? 0.5 },
    brightness: { value: options.brightness ?? 1 },
    blink: { value: options.blink ? 1 : 0 },
    time: look.uniforms.time,
    fogColor: look.uniforms.fogColor,
    fogNear: look.uniforms.fogNear,
    fogFar: look.uniforms.fogFar,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute vec3 extra;
      uniform float time;
      uniform float scale;
      uniform float bottom;
      uniform float height;
      uniform float rise;
      uniform float wobble;
      uniform float brightness;
      uniform float blink;
      varying vec3 vColour;
      varying float vAlive;
      varying float vDistance;
      void main() {
        float size = extra.x;
        float phase = extra.y;
        float pace = extra.z;
        vec3 p = position;
        p.y = bottom + mod(position.y + time * rise * pace, height);
        p.x += sin(time * 0.7 * pace + phase) * wobble;
        p.z += cos(time * 0.55 * pace + phase * 1.7) * wobble;
        float shine = brightness;
        if (blink > 0.5) shine *= smoothstep(0.1, 0.7, sin(time * 0.9 * pace + phase * 3.0) * 0.5 + 0.5);
        vColour = colour * shine;
        vAlive = shine > 0.02 ? 1.0 : 0.0;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        vDistance = length(view.xyz);
        // Not right at the lens, where one mote would fill the view.
        if (-view.z < 4.0) vAlive = 0.0;
        gl_PointSize = max(1.0, size * scale / -view.z);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: POINT_FRAGMENT,
    transparent: false,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;
  sizing(points, uniforms);
  return {
    points,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export interface Burst {
  points: THREE.Points;
  /** Sends up `n` hearts (or whatever shape) from a point. */
  emit(at: THREE.Vector3, n?: number): void;
  dispose(): void;
}

const BURST_LIFE = 2.2;

/** Hearts rising, as when two creatures in a blocky world take a liking to each other. */
export function burst(
  look: Look,
  options: {
    shape?: Shape;
    colours: readonly string[];
    size?: number;
    capacity?: number;
    brightness?: number;
  },
): Burst {
  const capacity = options.capacity ?? 64;
  const rand = mulberry(17);
  const position = new Float32Array(capacity * 3);
  const colour = new Float32Array(capacity * 3);
  const extra = new Float32Array(capacity * 3).fill(-100);
  const palette = options.colours.map((c) => new THREE.Color(c));
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(position, 3);
  const colours = new THREE.BufferAttribute(colour, 3);
  const extras = new THREE.BufferAttribute(extra, 3);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('colour', colours);
  geometry.setAttribute('extra', extras);
  const uniforms = {
    map: { value: shapeTexture(options.shape ?? 'heart') },
    scale: { value: 1 },
    size: { value: options.size ?? 0.45 },
    brightness: { value: options.brightness ?? 1.2 },
    time: look.uniforms.time,
    fogColor: look.uniforms.fogColor,
    fogNear: look.uniforms.fogNear,
    fogFar: look.uniforms.fogFar,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute vec3 extra;
      uniform float time;
      uniform float scale;
      uniform float size;
      uniform float brightness;
      varying vec3 vColour;
      varying float vAlive;
      varying float vDistance;
      void main() {
        float age = time - extra.x;
        vAlive = age > 0.0 && age < ${BURST_LIFE.toFixed(1)} ? 1.0 : 0.0;
        vec3 p = position;
        p.y += age * (0.9 + extra.z * 0.5);
        p.x += sin(age * 2.0 + extra.y) * 0.15 + cos(extra.y) * age * 0.35;
        p.z += sin(extra.y) * age * 0.35;
        vColour = colour * brightness;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        vDistance = length(view.xyz);
        // They shrink away at the end, a pixel step at a time.
        float grow = min(1.0, age * 6.0) * (1.0 - smoothstep(${(BURST_LIFE - 0.5).toFixed(1)}, ${BURST_LIFE.toFixed(1)}, age));
        gl_PointSize = max(0.0, size * grow * scale / -view.z);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: POINT_FRAGMENT,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  sizing(points, uniforms);
  let next = 0;
  return {
    points,
    emit(at, n = 7) {
      const now = uniforms.time.value;
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % capacity;
        position.set(
          [at.x + (rand() - 0.5) * 0.8, at.y + (rand() - 0.5) * 0.5, at.z + (rand() - 0.5) * 0.8],
          i * 3,
        );
        const c = palette[Math.floor(rand() * palette.length)];
        colour.set([c.r, c.g, c.b], i * 3);
        extra.set([now + k * 0.12 + rand() * 0.1, rand() * Math.PI * 2, rand()], i * 3);
      }
      positions.needsUpdate = true;
      colours.needsUpdate = true;
      extras.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Strings of little lights, hung between points and sagging a little
 * between them, each bulb twinkling in its own time.
 */
export function stringLights(
  look: Look,
  strings: readonly (readonly [THREE.Vector3, THREE.Vector3])[],
  options: {
    colours: readonly string[];
    spacing?: number;
    sag?: number;
    size?: number;
    brightness?: number;
  },
): Drift {
  const spacing = options.spacing ?? 0.45;
  const sag = options.sag ?? 0.6;
  const palette = options.colours.map((c) => new THREE.Color(c));
  const position: number[] = [];
  const colour: number[] = [];
  const extra: number[] = [];
  const rand = mulberry(41);
  const at = new THREE.Vector3();
  for (const [a, b] of strings) {
    const n = Math.max(2, Math.round(a.distanceTo(b) / spacing));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      at.copy(a).lerp(b, t);
      at.y -= Math.sin(Math.PI * t) * sag;
      position.push(at.x, at.y, at.z);
      const c = palette[k % palette.length];
      colour.push(c.r, c.g, c.b);
      extra.push(options.size ?? 0.09, rand() * Math.PI * 2, 0.6 + rand() * 0.8);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('colour', new THREE.Float32BufferAttribute(colour, 3));
  geometry.setAttribute('extra', new THREE.Float32BufferAttribute(extra, 3));
  geometry.computeBoundingSphere();
  const uniforms = {
    map: { value: shapeTexture('square') },
    scale: { value: 1 },
    brightness: { value: options.brightness ?? 1.7 },
    time: look.uniforms.time,
    fogColor: look.uniforms.fogColor,
    fogNear: look.uniforms.fogNear,
    fogFar: look.uniforms.fogFar,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute vec3 extra;
      uniform float time;
      uniform float scale;
      uniform float brightness;
      varying vec3 vColour;
      varying float vAlive;
      varying float vDistance;
      void main() {
        float twinkle = 0.7 + 0.3 * sin(time * 2.0 * extra.z + extra.y);
        vColour = colour * brightness * twinkle;
        vAlive = 1.0;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vDistance = length(view.xyz);
        gl_PointSize = max(2.0, extra.x * scale / -view.z);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: POINT_FRAGMENT,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;
  sizing(points, uniforms);
  return {
    points,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
