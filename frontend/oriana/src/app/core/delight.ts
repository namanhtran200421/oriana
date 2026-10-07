import { DOCUMENT, Injectable, inject } from '@angular/core';
import { prefersReducedMotion } from './motion';
import { Settings } from './settings';

const GLYPHS = ['♥︎', '✦', '✧', '♡', '✶', '❀'];
const COLOURS = ['#e8a3b0', '#c9a962', '#d4b872', '#c0566b', '#f1e6d2'];
const RAIN_COLOURS = ['#8b2635', '#c0566b', '#e8a3b0', '#c9a962', '#f1e6d2', '#a33a4c'];
/** No more sparks than this alive at once, however eager the tapping. */
const MAX_SPARKS = 48;
const MAX_FALLING = 160;

interface Falling {
  x: number;
  y: number;
  vx: number;
  vy: number;
  turn: number;
  spin: number;
  size: number;
  sway: number;
  colour: string;
  shape: 0 | 1 | 2;
}

/**
 * The little joys: sparks where the page is touched, a burst for a find, and
 * a fall of hearts and petals for the big moments. All drawn outside Angular,
 * straight onto the page, and all skipped for those who prefer things still.
 */
@Injectable({ providedIn: 'root' })
export class Delight {
  private readonly document = inject(DOCUMENT);
  private readonly settings = inject(Settings);
  private layer: HTMLElement | null = null;
  private sparks = 0;
  private rainUntil = 0;
  private raining = false;

  /** Sparkles wherever the page is touched. Returns a function that stops them. */
  start(): () => void {
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || !this.settings.sparkles()) return;
      const target = event.target as Element | null;
      // Never while reading, inside a game played by touch, or under a dialog's
      // backdrop, where they would only glimmer dimly behind it.
      if (target?.closest?.('app-book, [data-no-sparkle], .contents-dialog')) return;
      this.burst(event.clientX, event.clientY, 5);
    };
    this.document.addEventListener('pointerdown', onDown, { passive: true });
    return () => this.document.removeEventListener('pointerdown', onDown);
  }

  /** A handful of hearts and stars flung out from a point. */
  burst(x: number, y: number, count = 10): void {
    if (typeof window === 'undefined' || prefersReducedMotion()) return;
    const layer = this.ensureLayer();
    for (let i = 0; i < count && this.sparks < MAX_SPARKS; i++) {
      const spark = this.document.createElement('span');
      spark.className = 'delight-spark';
      spark.textContent = pick(GLYPHS);
      spark.style.color = pick(COLOURS);
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.fontSize = `${10 + Math.random() * 11}px`;
      layer.append(spark);
      this.sparks++;

      const angle = Math.random() * Math.PI * 2;
      const reach = 24 + Math.random() * 48;
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach - 16;
      const spin = (Math.random() - 0.5) * 120;
      const animation = spark.animate(
        [
          { transform: 'translate(0, 0) scale(0.3)', opacity: 0 },
          {
            transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1) rotate(${spin / 2}deg)`,
            opacity: 1,
            offset: 0.3,
          },
          {
            transform: `translate(${dx}px, ${dy + 26}px) scale(0.5) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
        { duration: 750 + Math.random() * 550, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
      );
      const done = () => {
        spark.remove();
        this.sparks--;
      };
      animation.onfinish = done;
      animation.oncancel = done;
    }
  }

  /** Hearts and petals drifting down over everything, for `duration` ms. */
  rain(duration = 3600): void {
    if (typeof window === 'undefined' || prefersReducedMotion()) return;
    this.rainUntil = Math.max(this.rainUntil, performance.now() + duration);
    if (this.raining) return;

    const canvas = this.document.createElement('canvas');
    canvas.className = 'delight-rain';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.document.body.append(canvas);
    this.raining = true;

    const ratio = Math.min(devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const size = () => {
      width = innerWidth;
      height = innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    size();
    addEventListener('resize', size, { passive: true });

    const heart = new Path2D(
      'M0 -3C-2 -6.5 -7.5 -5.5 -7.5 -1.2C-7.5 3 -2 5.6 0 8C2 5.6 7.5 3 7.5 -1.2C7.5 -5.5 2 -6.5 0 -3Z',
    );
    const petal = new Path2D('M0 -7C4 -4 4 4 0 7C-4 4 -4 -4 0 -7Z');
    const star = new Path2D(
      'M0 -7L1.8 -2.2L7 -2.2L2.8 1L4.4 6.2L0 3L-4.4 6.2L-2.8 1L-7 -2.2L-1.8 -2.2Z',
    );
    const shapes = [heart, petal, star];
    const pieces: Falling[] = [];
    let last = performance.now();
    let owed = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now < this.rainUntil) {
        // About fifty a second, fewer on a narrow screen.
        owed += dt * Math.min(55, width / 18);
        while (owed >= 1 && pieces.length < MAX_FALLING) {
          owed--;
          pieces.push({
            x: Math.random() * width,
            y: -20,
            vx: (Math.random() - 0.5) * 30,
            vy: 70 + Math.random() * 90,
            turn: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 3,
            size: 0.7 + Math.random() * 0.9,
            sway: Math.random() * Math.PI * 2,
            colour: pick(RAIN_COLOURS),
            shape: (Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : 2) as Falling['shape'],
          });
        }
      }

      ctx.clearRect(0, 0, width, height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.sway += dt * 2;
        p.x += (p.vx + Math.sin(p.sway) * 24) * dt;
        p.y += p.vy * dt;
        p.turn += p.spin * dt;
        if (p.y > height + 24) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.turn);
        // Turning in the air: squeezed as it spins edge-on.
        ctx.scale(p.size * Math.cos(p.sway * 0.7), p.size);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.colour;
        ctx.fill(shapes[p.shape]);
        ctx.restore();
      }

      if (pieces.length || now < this.rainUntil) {
        requestAnimationFrame(frame);
      } else {
        removeEventListener('resize', size);
        canvas.remove();
        this.raining = false;
      }
    };
    requestAnimationFrame(frame);
  }

  private ensureLayer(): HTMLElement {
    if (this.layer?.isConnected) return this.layer;
    const layer = this.document.createElement('div');
    layer.className = 'delight-layer';
    layer.setAttribute('aria-hidden', 'true');
    this.document.body.append(layer);
    return (this.layer = layer);
  }
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
