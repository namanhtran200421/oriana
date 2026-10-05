import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from './noise';
import type { Surface } from './textures';

/**
 * The furniture of the reading room, in metres. A book is built the way a
 * book is: two boards, a block of pages set back between them, and a rounded
 * spine with raised bands. Its local origin sits at the foot of the spine's
 * centre line, so it stands on whatever it is placed on.
 */

/** Parts of a unit book (1 × 1 × 1), to be scaled to each book's size. */
export interface BookParts {
  leather: THREE.BufferGeometry;
  pages: THREE.BufferGeometry;
  bands: THREE.BufferGeometry;
}

const BOARD = 0.07;
const SET_BACK = 0.06;

/**
 * `facets` is how finely the rounded spine is cut: the books lining the
 * shelves are only ever seen across the room, so they get few, and plain
 * boards; a volume held in the hand gets many.
 */
export function bookParts(facets = 8): BookParts {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  const front = box(BOARD, 1, 0.94, 0.5 - BOARD / 2, 0.5, -0.03);
  const back = box(BOARD, 1, 0.94, -0.5 + BOARD / 2, 0.5, -0.03);
  const spine = new THREE.CylinderGeometry(0.5, 0.5, 1, facets, 1, true, -Math.PI / 2, Math.PI)
    .scale(1, 1, 0.22)
    .translate(0, 0.5, 0.44);
  const leather = mergeGeometries([plain(front), plain(back), plain(spine)])!;

  const pages = box(1 - BOARD * 2, 0.96, 0.92 - SET_BACK, 0, 0.5, -0.02 + SET_BACK / 2);
  return { leather, pages, bands: bands(Math.max(6, facets - 2)) };
}

/** Raised bands across the spine: two at the head, two at the tail. */
function bands(facets: number): THREE.BufferGeometry {
  const band = (y: number) =>
    new THREE.CylinderGeometry(0.515, 0.515, 0.012, facets, 1, true, -Math.PI / 2, Math.PI)
      .scale(1, 1, 0.26)
      .translate(0, y, 0.44);
  return mergeGeometries([band(0.07), band(0.095), band(0.905), band(0.93)])!;
}

/** Unindexed, with only position, normal and uv, so any parts can be merged. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  }
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** Many parts sharing one material, as a single mesh: one draw call. */
function merged(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts.map(plain))!, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface ShelvedBook {
  x: number;
  /** The shelf it stands on. */
  y: number;
  width: number;
  height: number;
  depth: number;
  tilt: number;
  colour: THREE.Color;
  banded: boolean;
}

const LEATHERS = [
  '#5a2228',
  '#6b3a22',
  '#25402f',
  '#233049',
  '#3d2a22',
  '#7a5a2c',
  '#4a3550',
  '#3a4628',
  '#7a2e2a',
  '#2b3d40',
  '#5c4632',
  '#1f1a18',
].map((hex) => new THREE.Color(hex));

/**
 * Fills a shelf from `left` to `right` with books of varied height and
 * leather, leaving gaps where `keep` asks for them (Oriana's volumes).
 */
export function fillShelf(
  seed: number,
  left: number,
  right: number,
  maxHeight: number,
  keep: { x: number; width: number }[] = [],
): ShelvedBook[] {
  const rand = mulberry(seed);
  const books: ShelvedBook[] = [];
  let x = left;
  while (x < right - 0.02) {
    const blocked = keep.find(
      (k) => x + 0.05 > k.x - k.width / 2 - 0.004 && x < k.x + k.width / 2 + 0.004,
    );
    if (blocked) {
      x = blocked.x + blocked.width / 2 + 0.006;
      continue;
    }
    if (rand() < 0.035) {
      x += 0.05 + rand() * 0.12;
      continue;
    }
    const width = Math.min(0.022 + rand() * 0.04, right - x);
    if (width < 0.015) break;
    const height = maxHeight * (0.66 + rand() * 0.3);
    books.push({
      x: x + width / 2,
      y: 0,
      width,
      height,
      depth: 0.16 + rand() * 0.06,
      tilt: 0,
      colour: LEATHERS[Math.floor(rand() * LEATHERS.length)]
        .clone()
        .multiplyScalar(0.85 + rand() * 0.3),
      banded: rand() < 0.38,
    });
    x += width + 0.0015;
  }
  // The last book in a run leans on its neighbour.
  const last = books.at(-1);
  if (last && right - (last.x + last.width / 2) > 0.06) {
    last.tilt = -0.16;
    last.x += Math.sin(0.16) * last.height * 0.5;
  }
  return books;
}

/** Every book in a case, three draw calls: tinted leather, plain pages, gilt bands. */
export function shelvedBooks(
  books: ShelvedBook[],
  parts: BookParts,
  materials: { leather: THREE.Material; pages: THREE.Material; gilt: THREE.Material },
): THREE.Group {
  const group = new THREE.Group();
  const leather = new THREE.InstancedMesh(parts.leather, materials.leather, books.length);
  const pages = new THREE.InstancedMesh(parts.pages, materials.pages, books.length);
  const banded = books.filter((b) => b.banded);
  const bands = new THREE.InstancedMesh(parts.bands, materials.gilt, banded.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  let b = 0;
  books.forEach((book, i) => {
    quaternion.setFromAxisAngle(axis, book.tilt);
    position.set(book.x, book.y, 0);
    scale.set(book.width, book.height, book.depth);
    matrix.compose(position, quaternion, scale);
    leather.setMatrixAt(i, matrix);
    leather.setColorAt(i, book.colour);
    pages.setMatrixAt(i, matrix);
    if (book.banded) bands.setMatrixAt(b++, matrix);
  });
  for (const mesh of [leather, pages, bands]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** One of Oriana's volumes: its own spine and cover, and gilt that shines. */
export function volumeMesh(
  parts: BookParts,
  size: { width: number; height: number; depth: number },
  surfaces: { spine: Surface; cover: Surface },
  materials: { leather: THREE.MeshStandardMaterial; pages: THREE.Material; gilt: THREE.Material },
): THREE.Group {
  const group = new THREE.Group();
  const binding = materials.leather;

  // Boards: plain leather, with the cover tooled on the front board's face.
  const board = new RoundedBoxGeometry(BOARD, 1, 0.94, 2, 0.02);
  const plain = binding;
  const coverMaterial = new THREE.MeshStandardMaterial({
    map: surfaces.cover.map,
    roughnessMap: surfaces.cover.roughnessMap,
    metalnessMap: surfaces.cover.metalnessMap,
    metalness: 1,
    roughness: 1,
    normalMap: binding.normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
  });
  const front = new THREE.Mesh(board, [coverMaterial, plain, plain, plain, plain, plain]);
  front.position.set(0.5 - BOARD / 2, 0.5, -0.03);
  const backBoard = new THREE.Mesh(board, plain);
  backBoard.position.set(-0.5 + BOARD / 2, 0.5, -0.03);

  const spineMaterial = new THREE.MeshStandardMaterial({
    map: surfaces.spine.map,
    roughnessMap: surfaces.spine.roughnessMap,
    metalnessMap: surfaces.spine.metalnessMap,
    metalness: 1,
    roughness: 1,
    normalMap: binding.normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true, -Math.PI / 2, Math.PI).scale(1, 1, 0.22),
    spineMaterial,
  );
  spine.position.set(0, 0.5, 0.44);

  const pages = new THREE.Mesh(parts.pages, materials.pages);
  const gilt = new THREE.Mesh(bands(28), materials.gilt);

  const inner = new THREE.Group();
  inner.add(front, backBoard, spine, pages, gilt);
  inner.scale.set(size.width, size.height, size.depth);
  inner.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  group.add(inner);
  return group;
}

/** A tall walnut bookcase: sides, shelves, back, crown and plinth, in three meshes. */
export function bookcase(
  width: number,
  height: number,
  depth: number,
  shelves: number[],
  wood: { upright: THREE.Material; board: THREE.Material; back: THREE.Material },
): THREE.Group {
  const rounded = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0.008) =>
    new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
  const side = 0.045;
  const group = new THREE.Group();
  group.add(
    merged(
      [
        rounded(side, height, depth, -width / 2 + side / 2, height / 2, 0),
        rounded(side, height, depth, width / 2 - side / 2, height / 2, 0),
        // Crown: a deep cornice over a moulding; a plinth below.
        rounded(width + 0.08, 0.09, depth + 0.07, 0, height + 0.045, 0.02, 0.012),
        rounded(width + 0.04, 0.04, depth + 0.04, 0, height - 0.02, 0.02, 0.01),
        rounded(width + 0.04, 0.1, depth + 0.03, 0, 0.05, 0.015, 0.01),
      ],
      wood.upright,
    ),
    merged(
      shelves.map((y) => rounded(width - side * 2, 0.028, depth - 0.02, 0, y - 0.014, 0.01, 0.006)),
      wood.board,
    ),
    merged([new THREE.BoxGeometry(width, height, 0.02).translate(0, height / 2, -depth / 2 + 0.01)], wood.back),
  );
  return group;
}

/** A partner's desk: thick top, deep apron, turned legs lost in shadow. */
export function desk(
  width: number,
  depth: number,
  top: number,
  wood: THREE.Material,
  leatherTop: THREE.Material,
) {
  const legs = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([x, z]) =>
    new THREE.CylinderGeometry(0.03, 0.022, top - 0.18, 12).translate(
      x * (width / 2 - 0.07),
      (top - 0.18) / 2,
      z * (depth / 2 - 0.06),
    ),
  );
  const frame = merged(
    [
      new RoundedBoxGeometry(width, 0.045, depth, 3, 0.012).translate(0, top - 0.0225, 0),
      new THREE.BoxGeometry(width - 0.08, 0.14, depth - 0.08).translate(0, top - 0.115, 0),
      ...legs,
    ],
    wood,
  );
  // An inset leather writing surface, as old desks have.
  const inset = new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.002, depth - 0.14), leatherTop);
  inset.position.set(0, top + 0.0005, 0);
  inset.receiveShadow = true;
  const group = new THREE.Group();
  group.add(frame, inset);
  return group;
}

/**
 * A banker's lamp: brass foot and stem, a green glass shade, a warm bulb.
 * Returns the group and the point under the shade where its light should sit.
 */
export function bankersLamp(brass: THREE.Material) {
  const group = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.022, 40), brass);
  foot.position.y = 0.011;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 32), brass);
  collar.position.y = 0.035;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 16), brass);
  stem.position.y = 0.19;
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 32, Math.PI), brass);
  yoke.position.y = 0.34;
  yoke.rotation.z = Math.PI;

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#1f5a36',
    roughness: 0.18,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.4,
    sheenColor: new THREE.Color('#3fae6a'),
    side: THREE.DoubleSide,
  });
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.34, 48, 1, true, -Math.PI / 2, Math.PI),
    glass,
  );
  shade.rotation.z = Math.PI / 2;
  shade.position.y = 0.36;
  // The inside of the shade is white glass, lit by the bulb.
  const lining = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.335, 48, 1, true, -Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({
      color: '#fff3d8',
      emissive: '#ffcf8a',
      emissiveIntensity: 2.2,
      side: THREE.BackSide,
    }),
  );
  lining.rotation.z = Math.PI / 2;
  lining.position.y = 0.36;
  const ends = [-1, 1].map((s) => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32, 0, Math.PI), brass);
    cap.position.set(s * 0.17, 0.36, 0);
    cap.rotation.y = (s * Math.PI) / 2;
    return cap;
  });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: '#fff',
    emissive: '#ffd59a',
    emissiveIntensity: 9,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), bulbMaterial);
  bulb.position.set(0, 0.335, 0);
  group.add(foot, collar, stem, yoke, shade, lining, ...ends, bulb);
  group.traverse((o) => {
    if (o !== bulb && o !== lining) o.castShadow = true;
    o.receiveShadow = true;
  });
  const liningMaterial = lining.material as THREE.MeshStandardMaterial;
  /** How lit the lamp is, 0 to 1: the bulb and the shade's lining follow. */
  const glow = (on: number) => {
    bulbMaterial.emissiveIntensity = 9 * on;
    liningMaterial.emissiveIntensity = 2.2 * on;
  };
  return { group, light: new THREE.Vector3(0, 0.315, 0), glow };
}

/**
 * The note, folded in three. Each third is a thin leaf hinged to the next;
 * `unfold(t)` opens the top third first, then the bottom.
 */
export function letter(front: THREE.Texture, back: THREE.Texture, seal: THREE.Material) {
  const width = 0.21;
  const third = 0.297 / 3;
  const thickness = 0.0006;
  const group = new THREE.Group();

  const leaf = (index: number) => {
    const map = front.clone();
    map.needsUpdate = true;
    map.repeat.set(1, 1 / 3);
    map.offset.set(0, (2 - index) / 3);
    const backMap = back.clone();
    backMap.needsUpdate = true;
    backMap.repeat.set(1, 1 / 3);
    backMap.offset.set(0, index / 3);
    const face = new THREE.MeshStandardMaterial({ map, color: '#e6dcc8', roughness: 0.92 });
    const reverse = new THREE.MeshStandardMaterial({ map: backMap, roughness: 0.95 });
    const edge = new THREE.MeshStandardMaterial({ color: '#d8cdb4', roughness: 1 });
    const geometry = new THREE.BoxGeometry(width, thickness, third);
    // Box faces: +x, -x, +y (writing), -y (outside), +z, -z.
    const mesh = new THREE.Mesh(geometry, [edge, edge, face, reverse, edge, edge]);
    // A sheet this thin only speckles itself with its own shadow.
    mesh.receiveShadow = true;
    return mesh;
  };

  const middle = leaf(1);
  middle.position.y = thickness / 2;
  group.add(middle);

  // Top third hinges on the middle's far edge and folds over towards us.
  const topHinge = new THREE.Group();
  topHinge.position.set(0, 0, -third / 2);
  const top = leaf(0);
  top.position.set(0, thickness / 2, -third / 2);
  topHinge.add(top);
  group.add(topHinge);

  // Bottom third hinges on the near edge and folds under the top one.
  const bottomHinge = new THREE.Group();
  bottomHinge.position.set(0, 0, third / 2);
  const bottom = leaf(2);
  bottom.position.set(0, thickness / 2, third / 2);
  bottomHinge.add(bottom);
  group.add(bottomHinge);

  // A wax seal holding the folds, on the outside of the top third.
  const sealMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.004, 28), seal);
  sealMesh.position.set(0, -thickness - 0.002, -third / 2 + 0.003);
  sealMesh.castShadow = true;
  top.add(sealMesh);

  const unfold = (t: number) => {
    const first = ease(clamp(t * 2));
    const second = ease(clamp(t * 2 - 1));
    // Folded, the bottom leaf lies on the middle and the top leaf on that;
    // open, all three lie level, so the folds show as creases, not steps.
    bottomHinge.rotation.x = Math.PI * (1 - second) * 0.995;
    bottomHinge.position.y = (1 - second) * thickness * 2.2;
    topHinge.rotation.x = -Math.PI * (1 - first) * 0.99;
    topHinge.position.y = (1 - first) * thickness * 3.4;
  };
  unfold(0);
  return { group, unfold, size: { width, height: third * 3 } };
}

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
