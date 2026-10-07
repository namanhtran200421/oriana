import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FocusPass } from '../../library/stage/focus-pass';

/**
 * The stage for the places beyond the window. One renderer for the visit;
 * each place (a `World`) brings its own scene and the things in it that hold
 * a reason, and says where the camera comes in, rests, and leans to read.
 */

export interface Pose {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

export interface WorldEnv {
  renderer: THREE.WebGLRenderer;
  /** Phones and small GPUs: fewer blades of grass, smaller maps. */
  lite: boolean;
  /** How many reasons live here. */
  count: number;
}

export interface World {
  scene: THREE.Scene;
  /** One per reason, in order, to be touched. */
  anchors: THREE.Object3D[];
  /** Where the camera comes in from, and where it settles. */
  arrive: Pose;
  rest: Pose;
  /** Where the camera leans to, to read a reason. */
  focus(index: number): Pose;
  fov: number;
  exposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  /** How far the pointer moves the camera about its rest, in metres. */
  sway: number;
  /**
   * How soft the place beyond an open reason grows (0 keeps it sharp, as a
   * night sky should be: blurred stars turn to dotted discs).
   */
  depthOfField?: number;
  update(dt: number, time: number, camera: THREE.PerspectiveCamera): void;
  /** A reason opened (or none), and one under the pointer (or none). */
  select(index: number | null): void;
  hover(index: number | null): void;
  /** Reasons already read look a little different. */
  setRead(read: ReadonlySet<number>): void;
  dispose(): void;
}

export type WorldBuilder = (env: WorldEnv) => Promise<World>;

export interface RuntimeOptions {
  lite: boolean;
  onHover(index: number | null): void;
  onPick(index: number): void;
}

export interface Runtime {
  readonly renderer: THREE.WebGLRenderer;
  /** Puts a place on the stage (shaders compiled first, so it arrives smoothly). */
  show(world: World): Promise<void>;
  /** The camera rises away; resolves once it has gone. */
  leave(): Promise<void>;
  select(index: number | null): void;
  setRead(read: ReadonlySet<number>): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

/** Fewer pixels first when frames run long. */
const TIERS = { full: [2, 1.5, 1.25, 1], lite: [1.5, 1.25, 1] };
const FLOOR_FPS = 40;
const ARRIVE_S = 4.2;
const LEAVE_S = 1.5;
/** However tall and narrow the screen, at least this much is seen from side to side. */
const MIN_ACROSS = THREE.MathUtils.degToRad(56);
const MAX_FOV = 84;
/** How far a drag can turn the view, side to side and up and down, in radians. */
const LOOK = { yaw: 0.75, pitch: 0.22 };

export function createRuntime(canvas: HTMLCanvasElement, options: RuntimeOptions): Runtime {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Colours as painted: a blocky world wants its greens green, not filmic.
  renderer.toneMapping = THREE.NoToneMapping;
  // Places that want the sun to cast shadows can have them (not on phones).
  renderer.shadowMap.enabled = !options.lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const tiers = options.lite ? TIERS.lite : TIERS.full;
  let tier = 0;
  const ratio = () => Math.min(devicePixelRatio || 1, tiers[tier]);
  renderer.setPixelRatio(ratio());

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2500);
  // Drawn once, multisampled, with its depth kept for the focus.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: options.lite ? 2 : 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  // While a reason is open, the place beyond it softens: not on phones.
  const focus = options.lite ? null : new FocusPass(camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 0.85);
  const film = new ShaderPass(FILM);
  composer.addPass(renderPass);
  if (focus) {
    focus.uniforms.maxBlur.value = 0.009;
    focus.enabled = false;
    composer.addPass(focus);
  }
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(film);

  let world: World | null = null;
  const pose: Pose = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  const goal: Pose = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let arrival = 1;
  let selected: number | null = null;
  let leaving: { t: number; from: Pose; resolve: () => void } | null = null;

  const pointer = new THREE.Vector2();
  let pointerIn = false;
  // Looking about by dragging: how far the view is turned from its rest.
  const look = { yaw: 0, pitch: 0 };
  let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  let dragged = false;
  const toward = new THREE.Vector3();
  let aimDirty = false;
  let hovered: number | null = null;
  const raycaster = new THREE.Raycaster();

  const clock = new THREE.Timer();
  let frame = 0;
  let paused = false;
  let disposed = false;
  let width = 1;
  let height = 1;
  const intervals: number[] = [];
  let lastFrame = 0;
  let judgedAt = 0;
  let shownFor = 0;
  let aperture = 0;
  /** Only the latest place asked for is shown, however their compiling overlaps. */
  let showing = 0;

  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  function anchorAt(ndc: THREE.Vector2): number | null {
    if (!world || arrival < 1 || leaving) return null;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(world.anchors, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData['reason'] === undefined) o = o.parent;
    return o ? (o.userData['reason'] as number) : null;
  }

  const tick = (now: number) => {
    if (disposed || paused) return;
    frame = requestAnimationFrame(tick);
    clock.update(now);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsed();
    if (!world) return;
    shownFor += dt;

    // Where the camera wants to be: coming in, resting, leaning to read, or leaving.
    if (arrival < 1) {
      arrival = Math.min(1, arrival + dt / ARRIVE_S);
      const t = easeInOut(arrival);
      pose.position.copy(world.arrive.position).lerp(world.rest.position, t);
      pose.look.copy(world.arrive.look).lerp(world.rest.look, t);
    } else if (leaving) {
      leaving.t = Math.min(1, leaving.t + dt / LEAVE_S);
      const t = easeInOut(leaving.t);
      pose.position.copy(leaving.from.position).addScaledVector(up, t * 14);
      pose.look.copy(leaving.from.look).addScaledVector(up, t * 40);
      if (leaving.t >= 1) {
        const done = leaving.resolve;
        leaving.resolve = () => undefined;
        done();
      }
    } else {
      const base = selected === null ? world.rest : world.focus(selected);
      goal.position.copy(base.position);
      goal.look.copy(base.look);
      // The camera drifts with the hand, and breathes.
      const sway = pointerIn ? world.sway * (selected === null ? 1 : 0.25) : 0;
      right.subVectors(goal.look, goal.position).cross(up).normalize();
      goal.position.addScaledVector(right, pointer.x * sway);
      goal.position.y += pointer.y * sway * 0.4 + Math.sin(time * 0.4) * 0.05;
      // Turned by a drag; a reason opened brings the view back round to it.
      if (selected !== null && !drag) {
        look.yaw *= Math.exp(-dt * 3);
        look.pitch *= Math.exp(-dt * 3);
      }
      if (look.yaw || look.pitch) {
        toward.subVectors(goal.look, goal.position).applyAxisAngle(up, look.yaw);
        toward.y += look.pitch * toward.length();
        goal.look.copy(goal.position).add(toward);
      }
      const follow = 1 - Math.exp(-dt * (selected === null ? 1.6 : 2.2));
      pose.position.lerp(goal.position, follow);
      pose.look.lerp(goal.look, follow);
    }
    camera.position.copy(pose.position);
    camera.lookAt(pose.look);

    if (aimDirty) {
      aimDirty = false;
      const next = pointerIn ? anchorAt(pointer) : null;
      if (next !== hovered) {
        hovered = next;
        world.hover(next);
        options.onHover(next);
        canvas.style.cursor = next === null ? '' : 'pointer';
      }
    }

    if (focus) {
      const wanted = selected === null ? 0 : 0.012 * (world.depthOfField ?? 1);
      aperture += (wanted - aperture) * (1 - Math.exp(-dt * 3));
      focus.enabled = aperture > 0.0002;
      focus.uniforms.aperture.value = aperture;
      focus.uniforms.focus.value = camera.position.distanceTo(pose.look);
    }

    world.update(dt, time, camera);
    (film.uniforms as Record<string, THREE.IUniform>)['time'].value = time;
    composer.render();
    judge(now);
  };

  /** Steps the pixel ratio down when the place cannot keep up. */
  function judge(now: number) {
    if (lastFrame) intervals.push(now - lastFrame);
    lastFrame = now;
    if (shownFor < 2.5 || now - judgedAt < 2000 || intervals.length < 60) return;
    judgedAt = now;
    const sorted = [...intervals].sort((a, b) => a - b);
    intervals.length = 0;
    if (sorted[Math.floor(sorted.length / 2)] > 1000 / FLOOR_FPS && tier < tiers.length - 1) {
      tier++;
      renderer.setPixelRatio(ratio());
      composer.setPixelRatio(ratio());
      resize();
    }
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    fitFov();
  }

  /** The place's own field of view, widened on a narrow screen so enough is seen across. */
  function fitFov() {
    const wanted = world?.fov ?? camera.fov;
    const across = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(MIN_ACROSS / 2) / camera.aspect),
    );
    camera.fov = Math.min(MAX_FOV, Math.max(wanted, across));
    camera.updateProjectionMatrix();
  }

  const ndc = (event: { clientX: number; clientY: number }, out: THREE.Vector2) =>
    out.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  const onMove = (event: PointerEvent) => {
    ndc(event, pointer);
    pointerIn = event.pointerType === 'mouse';
    aimDirty = true;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    look.yaw = THREE.MathUtils.clamp(drag.yaw + dx * 0.004, -LOOK.yaw, LOOK.yaw);
    look.pitch = THREE.MathUtils.clamp(drag.pitch - dy * 0.0025, -LOOK.pitch, LOOK.pitch);
  };
  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    drag = { x: event.clientX, y: event.clientY, yaw: look.yaw, pitch: look.pitch, moved: false };
  };
  const onUp = () => {
    dragged = !!drag?.moved;
    drag = null;
  };
  const onLeave = () => {
    pointerIn = false;
    aimDirty = true;
  };
  const onClick = (event: MouseEvent) => {
    // The end of a drag to look about is not a touch.
    if (dragged) {
      dragged = false;
      return;
    }
    const index = anchorAt(ndc(event, new THREE.Vector2()));
    if (index !== null) options.onPick(index);
  };
  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  resize();
  frame = requestAnimationFrame(tick);

  return {
    renderer,
    async show(next) {
      const token = ++showing;
      camera.fov = next.fov;
      camera.updateProjectionMatrix();
      look.yaw = look.pitch = 0;
      camera.position.copy(next.arrive.position);
      camera.lookAt(next.arrive.look);
      // Compiled before it is shown, so its first frames do not stutter.
      await renderer.compileAsync(next.scene, camera);
      if (disposed || token !== showing) {
        next.dispose();
        return;
      }
      world?.dispose();
      world = next;
      renderPass.scene = next.scene;
      fitFov();
      renderer.toneMappingExposure = next.exposure;
      bloom.strength = next.bloom.strength;
      bloom.radius = next.bloom.radius;
      bloom.threshold = next.bloom.threshold;
      selected = null;
      hovered = null;
      leaving = null;
      arrival = 0;
      shownFor = 0;
      intervals.length = 0;
      pose.position.copy(next.arrive.position);
      pose.look.copy(next.arrive.look);
    },
    leave() {
      return new Promise((resolve) => {
        if (!world) return resolve();
        arrival = 1;
        selected = null;
        world.select(null);
        leaving = {
          t: 0,
          from: { position: pose.position.clone(), look: pose.look.clone() },
          resolve,
        };
      });
    },
    select(index) {
      selected = index;
      world?.select(index);
    },
    setRead(read) {
      world?.setRead(read);
    },
    setPaused(on) {
      if (on === paused || disposed) return;
      paused = on;
      if (paused) {
        cancelAnimationFrame(frame);
        return;
      }
      lastFrame = 0;
      frame = requestAnimationFrame(tick);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      world?.dispose();
      world = null;
      // The composer frees its own targets but not its passes'.
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

/** A soft vignette, applied last. */
const FILM = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
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
      colour.rgb *= mix(0.8, 1.0, smoothstep(0.95, 0.4, length(c * vec2(1.0, 1.1))));
      gl_FragColor = colour;
    }
  `,
};
