import * as THREE from 'three';
import type { StoryEntry } from '../../../core/story';
import { SurfacePixels, SurfaceRequest, bakeSurface } from './surfaces';

/**
 * Every surface in the reading room, painted on canvases: leather, walnut,
 * page edges, the gilt spines and covers of Oriana's volumes, and the note.
 * Pixel work runs in a worker so the page never stalls, and every canvas is
 * kept once painted, so coming back to the library only uploads them again.
 * Gilt is painted twice, once for colour and once into a metal/roughness map,
 * so it catches the lamp as the camera moves.
 */

export interface Surface {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

/** What a surface is painted on: colour, and the maps that go with it. */
interface Canvases {
  map: HTMLCanvasElement;
  rough?: HTMLCanvasElement;
  normal?: HTMLCanvasElement;
  /** Roughness in green, metalness in blue, for gilt on leather. */
  metal?: HTMLCanvasElement;
}

const LEATHERS: Record<string, string> = {
  crimson: '#6e1f2c',
  mahogany: '#55301f',
  oak: '#4a3924',
};

export const GILT = '#c9a45a';

const painted = new Map<string, Promise<Canvases>>();

/** Paints a surface the first time it is asked for, and keeps it. */
function once(key: string, paint: () => Canvases | Promise<Canvases>): Promise<Canvases> {
  let canvases = painted.get(key);
  if (!canvases) {
    canvases = Promise.resolve().then(paint);
    painted.set(key, canvases);
    canvases.catch(() => painted.delete(key));
  }
  return canvases;
}

/** Fresh textures over kept canvases; the textures belong to one stage. */
function surface(canvases: Canvases): Surface {
  const metal = canvases.metal && texture(canvases.metal, false);
  return {
    map: texture(canvases.map, true),
    normalMap: canvases.normal && texture(canvases.normal, false),
    roughnessMap: metal ?? (canvases.rough && texture(canvases.rough, false)),
    metalnessMap: metal,
  };
}

export async function leather(size: number): Promise<Surface> {
  return surface(await baked({ kind: 'leather', size }));
}

export async function walnut(size: number, seed: number, light: number): Promise<Surface> {
  return surface(await baked({ kind: 'walnut', size, seed, light }));
}

export async function pageEdges(size: number): Promise<Surface> {
  return surface(await baked({ kind: 'edges', size }));
}

/** The leather's grey grain on its own, for tooling volumes over. */
export async function leatherGrain(size: number): Promise<HTMLCanvasElement> {
  return (await baked({ kind: 'leather', size })).map;
}

function baked(request: SurfaceRequest): Promise<Canvases> {
  const key = `${request.kind}:${request.size}:${request.seed ?? ''}:${request.light ?? ''}`;
  return once(key, async () => {
    const pixels = await bake(request);
    const canvas = (data?: Uint8ClampedArray<ArrayBuffer>) => {
      if (!data) return undefined;
      const [c, ctx] = paper(pixels.size, pixels.size);
      ctx.putImageData(new ImageData(data, pixels.size, pixels.size), 0, 0);
      return c;
    };
    return { map: canvas(pixels.colour)!, rough: canvas(pixels.rough), normal: canvas(pixels.normal) };
  });
}

// One worker, started on demand and let go when it has nothing left to do.
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<
  number,
  { request: SurfaceRequest; resolve: (pixels: SurfacePixels) => void }
>();

function bake(request: SurfaceRequest): Promise<SurfacePixels> {
  if (worker === undefined) worker = startWorker();
  if (!worker) return onMainThread(request);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { request, resolve });
    worker!.postMessage({ id, request });
  });
}

function startWorker(): Worker | null {
  try {
    const w = new Worker(new URL('./surfaces.worker', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<{ id: number; pixels: SurfacePixels }>) => {
      pending.get(data.id)?.resolve(data.pixels);
      pending.delete(data.id);
      if (!pending.size) {
        w.terminate();
        worker = undefined;
      }
    };
    // Should the worker fail, the main thread finishes what it was given.
    w.onerror = () => {
      w.terminate();
      worker = null;
      for (const [id, job] of pending) {
        pending.delete(id);
        void onMainThread(job.request).then(job.resolve);
      }
    };
    return w;
  } catch {
    return null;
  }
}

/** The fallback: baked between frames, so at least the page keeps painting. */
function onMainThread(request: SurfaceRequest): Promise<SurfacePixels> {
  return new Promise((resolve) => setTimeout(() => resolve(bakeSurface(request)), 0));
}

function paper(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

function texture(canvas: HTMLCanvasElement, srgb: boolean, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Paints a design twice: in colour, and as a glTF-style metal/roughness map
 * (roughness in green, metalness in blue) so gilt shines and leather does not.
 */
function gilded(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, pass: 'colour' | 'metal') => void,
): Canvases {
  const [map, cctx] = paper(width, height);
  const [metal, mctx] = paper(width, height);
  draw(cctx, 'colour');
  draw(mctx, 'metal');
  return { map, metal };
}

/**
 * Leather ground for gilded designs: the binding's colour, its grain and
 * stains laid over it, and the edges rubbed pale with handling.
 */
function ground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  pass: 'colour' | 'metal',
  grain: HTMLCanvasElement,
  seed: number,
) {
  if (pass === 'metal') {
    ctx.fillStyle = 'rgb(0, 165, 0)';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const pattern = ctx.createPattern(grain, 'repeat')!;
  pattern.setTransform(new DOMMatrix().translate(seed * 97, seed * 61));
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  const reach = Math.min(w, h) / 14;
  const wear = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(90, 70, 50, 0.35)');
    g.addColorStop(1, 'rgba(90, 70, 50, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  wear(0, 0, reach, 0);
  wear(w, 0, w - reach, 0);
  wear(0, 0, 0, reach);
  wear(0, h, 0, h - reach);
  ctx.restore();
}

function gilt(ctx: CanvasRenderingContext2D, pass: 'colour' | 'metal'): string {
  return pass === 'colour' ? GILT : 'rgb(0, 80, 255)';
}

const display = (lang: string) =>
  lang === 'vi' ? '"Cormorant Garamond", Georgia, serif' : 'Cinzel, "Cormorant Garamond", serif';

/** The spine of one of Oriana's volumes: numeral, lettering-piece, title. */
export async function spine(
  story: StoryEntry,
  volume: number,
  roman: string,
  grain: HTMLCanvasElement,
): Promise<Surface> {
  const key = `spine:${story.slug}:${story.title}:${story.binding}:${story.lang}:${roman}:${grain.width}`;
  return surface(await once(key, () => paintSpine(story, volume, roman, grain)));
}

function paintSpine(story: StoryEntry, volume: number, roman: string, grain: HTMLCanvasElement) {
  const w = 256;
  const h = 1360;
  const base = LEATHERS[story.binding ?? 'crimson'];
  return gilded(w, h, (ctx, pass) => {
    ground(ctx, w, h, base, pass, grain, 40 + volume);
    // Lettering-piece: a panel of darker leather, ruled in gilt.
    const top = h * 0.2;
    const bottom = h * 0.78;
    ctx.fillStyle = pass === 'colour' ? '#1a110d' : 'rgb(0, 150, 0)';
    ctx.fillRect(w * 0.13, top, w * 0.74, bottom - top);
    ctx.strokeStyle = gilt(ctx, pass);
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.13, top, w * 0.74, bottom - top);
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.17, top + 10, w * 0.66, bottom - top - 20);

    ctx.fillStyle = gilt(ctx, pass);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 64px ${display(story.lang)}`;
    ctx.fillText(roman, w / 2, h * 0.155);
    ctx.font = `64px "Cormorant Garamond", serif`;
    ctx.fillText('❦', w / 2, h * 0.85);

    // The title, set to read from head to tail.
    ctx.save();
    ctx.translate(w / 2, (top + bottom) / 2);
    ctx.rotate(Math.PI / 2);
    const length = bottom - top - 70;
    const lines = wrap(ctx, story.title.toUpperCase(), length, 52, display(story.lang), 600, 0.12);
    const lineHeight = 60;
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
    });
    ctx.restore();
  });
}

/** The front board of one of Oriana's volumes. */
export async function cover(
  story: StoryEntry,
  volume: number,
  volumeLabel: string,
  grain: HTMLCanvasElement,
): Promise<Surface> {
  const key = `cover:${story.slug}:${story.title}:${story.author}:${story.binding}:${story.lang}:${volumeLabel}:${grain.width}`;
  return surface(await once(key, () => paintCover(story, volume, volumeLabel, grain)));
}

function paintCover(story: StoryEntry, volume: number, volumeLabel: string, grain: HTMLCanvasElement) {
  const w = 720;
  const h = 1024;
  const base = LEATHERS[story.binding ?? 'crimson'];
  return gilded(w, h, (ctx, pass) => {
    ground(ctx, w, h, base, pass, grain, 60 + volume);
    const g = gilt(ctx, pass);
    ctx.strokeStyle = g;
    ctx.lineWidth = 6;
    ctx.strokeRect(w * 0.1, h * 0.07, w * 0.8, h * 0.86);
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.13, h * 0.09, w * 0.74, h * 0.82);
    // Corner brackets.
    ctx.lineWidth = 7;
    for (const [x, y, sx, sy] of [
      [w * 0.1, h * 0.07, 1, 1],
      [w * 0.9, h * 0.93, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x - sx * 8, y + sy * 60);
      ctx.lineTo(x - sx * 8, y - sy * 8);
      ctx.lineTo(x + sx * 60, y - sy * 8);
      ctx.stroke();
    }
    ctx.fillStyle = g;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 24px ${display(story.lang)}`;
    spaced(ctx, volumeLabel.toUpperCase(), w / 2, h * 0.3, 7);
    ctx.font = `64px "Cormorant Garamond", serif`;
    ctx.fillText('❦', w / 2, h * 0.37);
    ctx.font = `600 52px ${display(story.lang)}`;
    const lines = wrap(
      ctx,
      story.title.toUpperCase(),
      w * 0.62,
      52,
      display(story.lang),
      600,
      0.08,
    );
    lines.forEach((line, i) => spaced(ctx, line, w / 2, h * 0.47 + i * 66, 4));
    const after = h * 0.47 + lines.length * 66;
    ctx.fillRect(w * 0.4, after + 4, w * 0.2, 2);
    if (pass === 'colour') ctx.fillStyle = 'rgba(232, 223, 212, 0.75)';
    ctx.font = `italic 34px "Cormorant Garamond", serif`;
    ctx.fillText(story.author, w / 2, after + 52);
  });
}

export interface NoteText {
  label: string;
  heading: string;
  paragraphs: readonly string[];
  signature: string;
}

const notes = new Map<string, Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }>>();

/**
 * The note, written out on the paper Oriana's book pages are printed on.
 * `scale` sets its resolution: 1 is sharp enough to read close up on a desk.
 */
export async function note(
  paperSrc: string,
  text: NoteText,
  scale: number,
): Promise<{ front: THREE.Texture; back: THREE.Texture }> {
  const key = JSON.stringify([paperSrc, text, scale]);
  let canvases = notes.get(key);
  if (!canvases) {
    canvases = loadImage(paperSrc).then((image) => paintNote(image, text, scale));
    notes.set(key, canvases);
    canvases.catch(() => notes.delete(key));
  }
  const { front, back } = await canvases;
  const frontTex = texture(front, true, 16);
  const backTex = texture(back, true, 8);
  frontTex.wrapS = frontTex.wrapT = THREE.ClampToEdgeWrapping;
  backTex.wrapS = backTex.wrapT = THREE.ClampToEdgeWrapping;
  return { front: frontTex, back: backTex };
}

function paintNote(paperImage: HTMLImageElement, text: NoteText, scale: number) {
  const w = 1600;
  const h = 2263;
  const [front, ctx] = paper(Math.round(w * scale), Math.round(h * scale));
  ctx.scale(scale, scale);
  coverImage(ctx, paperImage, w, h, false);
  // Aged: warmer than new paper, and browner towards the edges.
  ctx.fillStyle = 'rgba(150, 105, 50, 0.16)';
  ctx.fillRect(0, 0, w, h);
  const edge = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, h * 0.75);
  edge.addColorStop(0, 'rgba(120, 80, 35, 0)');
  edge.addColorStop(1, 'rgba(120, 80, 35, 0.38)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  const ink = '#2b2119';
  const faded = '#5d4b3a';
  const gold = '#7f6128';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = gold;
  ctx.font = '500 34px Cinzel, serif';
  spaced(ctx, text.label.toUpperCase(), w / 2, 300, 12);
  ctx.fillRect(w / 2 - 330, 288, 140, 2);
  ctx.fillRect(w / 2 + 190, 288, 140, 2);

  ctx.fillStyle = ink;
  ctx.font = '500 150px "Cormorant Garamond", serif';
  ctx.fillText(text.heading, w / 2, 500);

  ctx.fillStyle = gold;
  ctx.fillRect(w * 0.16, 590, w * 0.3, 2);
  ctx.fillRect(w * 0.54, 590, w * 0.3, 2);
  ctx.font = '52px "Cormorant Garamond", serif';
  ctx.fillText('❦', w / 2, 608);

  ctx.textAlign = 'left';
  ctx.fillStyle = faded;
  ctx.font = '62px "Crimson Pro", Georgia, serif';
  let y = h / 3 + 120;
  for (const paragraph of text.paragraphs) {
    for (const line of wrapWords(ctx, paragraph, w * 0.72)) {
      ctx.fillText(line, w * 0.14, y);
      y += 104;
    }
    y += 40;
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = gold;
  ctx.font = 'italic 76px "Cormorant Garamond", serif';
  ctx.fillText(`— ${text.signature}`, w * 0.86, Math.max(y + 60, (h * 2) / 3 + 150));

  const [back, bctx] = paper(Math.round(1024 * scale), Math.round(1448 * scale));
  bctx.scale(scale, scale);
  coverImage(bctx, paperImage, 1024, 1448, true);
  bctx.fillStyle = 'rgba(80, 52, 24, 0.12)';
  bctx.fillRect(0, 0, 1024, 1448);
  return { front, back };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** A soft round glow for dust in the lamplight. */
export function glow(): THREE.Texture {
  const [canvas, ctx] = paper(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture(canvas, true);
}

/** Draws the image to fill the canvas, optionally turned over. */
function coverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  turned: boolean,
) {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.save();
  if (turned) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
}

function spaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x + spacing / 2, y);
  ctx.letterSpacing = '0px';
}

/** Breaks a title into balanced lines no wider than `max`. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  size: number,
  family: string,
  weight: number,
  tracking: number,
): string[] {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${size * tracking}px`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
