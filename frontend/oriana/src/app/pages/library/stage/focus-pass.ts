import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/**
 * Depth of field from the depth buffer the scene was already drawn with, so
 * the scene is drawn once rather than twice. A golden-angle disc of taps,
 * scaled by how far each pixel sits from the focal distance; neighbours that
 * are themselves in focus are kept out of the blur, so sharp edges do not
 * bleed into soft backgrounds. Pixels in focus take a single tap.
 */
export class FocusPass extends Pass {
  readonly uniforms = {
    tColour: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    focus: { value: 1 },
    aperture: { value: 0.004 },
    maxBlur: { value: 0.008 },
    aspect: { value: 1 },
    near: { value: 0.1 },
    far: { value: 30 },
  };

  private readonly quad: FullScreenQuad;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super();
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    );
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.uniforms.tColour.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.near.value = this.camera.near;
    this.uniforms.far.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override setSize(width: number, height: number): void {
    this.uniforms.aspect.value = width / Math.max(1, height);
  }

  override dispose(): void {
    (this.quad.material as THREE.Material).dispose();
    this.quad.dispose();
  }
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  #include <packing>
  uniform sampler2D tColour;
  uniform sampler2D tDepth;
  uniform float focus;
  uniform float aperture;
  uniform float maxBlur;
  uniform float aspect;
  uniform float near;
  uniform float far;
  varying vec2 vUv;

  const int TAPS = 24;

  float blurAt(vec2 uv) {
    float distance = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
    return min(abs(distance - focus) * aperture, maxBlur);
  }

  void main() {
    vec4 colour = texture2D(tColour, vUv);
    float centre = blurAt(vUv);
    if (centre < 0.0004) {
      gl_FragColor = colour;
      return;
    }
    vec4 sum = colour;
    float weight = 1.0;
    for (int i = 0; i < TAPS; i++) {
      float r = sqrt((float(i) + 0.5) / float(TAPS));
      float a = float(i) * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a) * aspect) * r * centre;
      float w = clamp(blurAt(uv) / max(r * centre, 1e-5), 0.0, 1.0);
      sum += texture2D(tColour, uv) * w;
      weight += w;
    }
    gl_FragColor = sum / weight;
  }
`;
