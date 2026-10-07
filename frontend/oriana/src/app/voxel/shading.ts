import * as THREE from 'three';

/**
 * How a place is lit, shared by everything in it: the colour of daylight (or
 * moonlight), the colour of lantern light, the fog, the wind. Light is worked
 * out once, when the blocks are built, and kept in the corners of faces; the
 * shaders only mix it with these.
 */
export interface LookOptions {
  sky: THREE.ColorRepresentation;
  glow?: THREE.ColorRepresentation;
  /** The darkest anything gets, so caves are dim rather than black. */
  ambient?: number;
  fog: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
  wind?: number;
  /**
   * How much the sky outshines a lantern, 0 to 1: by day a lantern hardly
   * shows in the open; by night its light pools round it.
   */
  daylight?: number;
}

export interface Look {
  readonly uniforms: {
    skyTint: THREE.IUniform<THREE.Color>;
    glowTint: THREE.IUniform<THREE.Color>;
    glowStrength: THREE.IUniform<number>;
    daylight: THREE.IUniform<number>;
    ambient: THREE.IUniform<number>;
    fogColor: THREE.IUniform<THREE.Color>;
    fogNear: THREE.IUniform<number>;
    fogFar: THREE.IUniform<number>;
    time: THREE.IUniform<number>;
    wind: THREE.IUniform<number>;
  };
  tick(time: number): void;
}

export function createLook(options: LookOptions): Look {
  const uniforms = {
    skyTint: { value: new THREE.Color(options.sky) },
    glowTint: { value: new THREE.Color(options.glow ?? '#ffb866') },
    glowStrength: { value: 1 },
    daylight: { value: options.daylight ?? 1 },
    ambient: { value: options.ambient ?? 0.06 },
    fogColor: { value: new THREE.Color(options.fog) },
    fogNear: { value: options.fogNear },
    fogFar: { value: options.fogFar },
    time: { value: 0 },
    wind: { value: options.wind ?? 1 },
  };
  const breeze = options.wind ?? 1;
  return {
    uniforms,
    tick(time) {
      uniforms.time.value = time;
      // The wind comes in gusts: the flowers lean together, then settle.
      const gust = 0.7 + 0.22 * Math.sin(time * 0.37) + 0.14 * Math.sin(time * 1.13 + 1.7);
      uniforms.wind.value = breeze * gust;
    },
  };
}

/** The sea's swell: long rollers from one way, a chop across them. Shared by blocks of water and the open sea. */
export const SWELL = /* glsl */ `
  float swellAt(vec2 p, float time) {
    return sin(p.y * 0.35 + time * 1.1) * 0.09
      + sin(p.x * 0.22 + p.y * 0.12 - time * 0.7) * 0.05
      + sin((p.x - p.y) * 0.6 + time * 1.9) * 0.025;
  }
`;

const VERTEX = /* glsl */ `
  attribute float tone;
  attribute vec2 light;
  attribute float sway;
  attribute float foam;
  uniform float time;
  uniform float wind;
  varying vec2 vUv;
  varying float vTone;
  varying vec2 vLight;
  varying float vDistance;
  varying float vFoam;
  varying vec2 vWhere;
  ${SWELL}
  void main() {
    vUv = uv;
    vTone = tone;
    vLight = light;
    vFoam = foam;
    vec4 world = modelMatrix * vec4(position, 1.0);
    #ifdef LIQUID
      world.y += swellAt(world.xz, time) * sway;
    #else
      float s = sway * wind;
      world.x += sin(time * 1.6 + world.x * 0.45 + world.z * 0.3) * s;
      world.z += cos(time * 1.25 + world.x * 0.35 + world.z * 0.5) * s * 0.7;
    #endif
    vWhere = world.xz;
    vec4 view = viewMatrix * world;
    vDistance = length(view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const LIGHTING = /* glsl */ `
  uniform vec3 skyTint;
  uniform vec3 glowTint;
  uniform float glowStrength;
  uniform float ambient;
  uniform float daylight;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  vec3 lit(vec2 light) {
    // Lantern light counts for less where the sky already shines.
    vec3 l = skyTint * light.x + glowTint * light.y * glowStrength * (1.0 - 0.6 * daylight * light.x);
    return max(l, vec3(ambient));
  }
  vec3 fogged(vec3 colour, float distance) {
    return mix(colour, fogColor, smoothstep(fogNear, fogFar, distance));
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 atlasSize;
  uniform float opacity;
  uniform float time;
  varying vec2 vUv;
  varying float vTone;
  varying vec2 vLight;
  varying float vDistance;
  varying float vFoam;
  varying vec2 vWhere;
  ${LIGHTING}
  // Blurred no further than two pixels a tile, or far tiles would bleed into their neighbours.
  vec4 sampleAtlas(vec2 uv) {
    vec2 px = uv * atlasSize;
    float lod = log2(max(length(dFdx(px)), length(dFdy(px))));
    return textureLod(map, uv, clamp(lod, 0.0, 4.0));
  }
  void main() {
    vec4 texel = sampleAtlas(vUv);
    #ifdef CUTOUT
      float cut = 0.5;
      #ifdef LEAVES
        // Far off, leaves close over: holes there only twinkle with the sky behind.
        cut = mix(0.5, -1.0, smoothstep(16.0, 40.0, vDistance));
      #endif
      if (texel.a < cut) discard;
    #endif
    vec3 colour = texel.rgb * vTone * lit(vLight);
    #ifdef LIQUID
      // A slow glint moving over the water.
      colour *= 1.0 + 0.08 * sin(time * 1.3 + vUv.x * 900.0 + vUv.y * 600.0);
      // Foam where the water meets the shore, in pixels, as each roller comes in.
      vec2 cell = floor(vWhere * 8.0);
      float speck = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float surge = smoothstep(0.15, 0.95, 0.5 + 0.5 * sin(vWhere.y * 0.35 + time * 1.1 - 0.6));
      float froth = step(1.0 - vFoam * surge * 0.95, speck);
      colour = mix(colour, vec3(0.96, 0.97, 1.0) * lit(vLight), froth);
      float alpha = mix(texel.a * opacity, 0.95, froth);
    #endif
    #ifdef LIQUID
      gl_FragColor = vec4(fogged(colour, vDistance), alpha);
    #else
      // Whatever is drawn is whole: a hole in a far leaf, closed over, must not
      // leave a see-through pixel behind for later passes to trip on.
      gl_FragColor = vec4(fogged(colour, vDistance), 1.0);
    #endif
    #include <colorspace_fragment>
  }
`;

export type BlockMaterialKind = 'solid' | 'leaves' | 'cutout' | 'liquid';

const DEFINES: Record<BlockMaterialKind, Record<string, string>> = {
  solid: {},
  leaves: { CUTOUT: '', LEAVES: '' },
  cutout: { CUTOUT: '' },
  liquid: { LIQUID: '' },
};

/** The material for a world's blocks, of one kind. */
export function blockMaterial(
  look: Look,
  map: THREE.Texture,
  kind: BlockMaterialKind,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...look.uniforms,
      map: { value: map },
      atlasSize: { value: new THREE.Vector2(map.width, map.height) },
      opacity: { value: kind === 'liquid' ? 0.78 : 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: DEFINES[kind],
    side: kind === 'cutout' || kind === 'leaves' ? THREE.DoubleSide : THREE.FrontSide,
    transparent: kind === 'liquid',
    depthWrite: kind !== 'liquid',
  });
  return material;
}

const MODEL_VERTEX = /* glsl */ `
  attribute vec3 tint;
  attribute float glow;
  uniform float time;
  varying vec3 vTint;
  varying float vGlow;
  varying float vDistance;
  void main() {
    vTint = tint;
    vGlow = glow;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 view = viewMatrix * world;
    vDistance = length(view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const MODEL_FRAGMENT = /* glsl */ `
  uniform vec2 light;
  uniform float shine;
  uniform float opacity;
  varying vec3 vTint;
  varying float vGlow;
  varying float vDistance;
  ${LIGHTING}
  void main() {
    // Glowing voxels shine past white, for the bloom to catch.
    vec3 colour = vTint * mix(lit(light), vec3(shine), vGlow);
    gl_FragColor = vec4(fogged(colour, vDistance), opacity);
    #include <colorspace_fragment>
  }
`;

export interface ModelMaterialOptions {
  /** The light the model stands in: sky and lantern brightness, 0 to 1 each. */
  light?: readonly [number, number];
  /** How bright its glowing voxels are (1 plain, more to bloom). */
  shine?: number;
  opacity?: number;
}

/** The material for small models built of coloured voxels, lit like the blocks round them. */
export function modelMaterial(
  look: Look,
  options: ModelMaterialOptions = {},
): THREE.ShaderMaterial {
  const [sky, glow] = options.light ?? [1, 0];
  const opacity = options.opacity ?? 1;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...look.uniforms,
      light: { value: new THREE.Vector2(sky, glow) },
      shine: { value: options.shine ?? 1.6 },
      opacity: { value: opacity },
    },
    vertexShader: MODEL_VERTEX,
    fragmentShader: MODEL_FRAGMENT,
    transparent: opacity < 1,
  });
}
