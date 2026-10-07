import * as THREE from 'three';

/** Frees every geometry, material and texture under an object. */
export function disposeScene(root: THREE.Object3D): void {
  const done = new Set<object>();
  const free = (thing: { dispose(): void } | null | undefined) => {
    if (!thing || done.has(thing)) return;
    done.add(thing);
    thing.dispose();
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    free(mesh.geometry);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) free(value);
      if (m instanceof THREE.ShaderMaterial) {
        for (const u of Object.values(m.uniforms))
          if (u.value instanceof THREE.Texture) free(u.value);
      }
      free(m);
    }
  });
}

const touchMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** An unseen box round something, so it is easy to touch even where it is thin. */
export function touchBox(
  width: number,
  height: number,
  depth = width,
  lift = height / 2,
): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), touchMaterial);
  box.position.y = lift;
  box.name = 'touch';
  return box;
}

/** Moves `value` toward `goal`, the same fraction of the way each second whatever the frame rate. */
export function approach(value: number, goal: number, rate: number, dt: number): number {
  return value + (goal - value) * (1 - Math.exp(-rate * dt));
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
