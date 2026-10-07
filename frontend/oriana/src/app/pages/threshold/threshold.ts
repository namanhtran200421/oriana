import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { labelsFor } from '../../core/i18n';
import { playLabelsFor } from '../../core/i18n-play';
import { Keepsakes } from '../../core/keepsakes';
import { prefersReducedMotion } from '../../core/motion';
import { Music } from '../../core/music';
import { RomanPipe } from '../../core/roman';
import { canDrawWebGL2 } from '../../core/webgl';
import { MusicToggle } from '../../ui/music-toggle';
import { WaxSeal } from '../../ui/wax-seal/wax-seal';
import { SITE } from '../../../stories/site';
import type { Panorama } from './panorama';

/**
 * The front door, as a blocky game's title screen: her name in big carved
 * letters over a little world turning slowly behind, a yellow line bouncing
 * beside it, and a wax seal to break to come in.
 */
@Component({
  selector: 'app-threshold',
  imports: [MusicToggle, RomanPipe, WaxSeal],
  templateUrl: './threshold.html',
  styleUrl: './threshold.scss',
})
export class Threshold {
  protected readonly site = SITE;
  protected readonly labels = labelsFor(SITE.lang);
  protected readonly play = playLabelsFor(SITE.lang);
  protected readonly opening = signal(false);
  /** The first on the server; one at random once she is here. */
  protected readonly splash = signal(this.play.splashes[0]);
  /** The world behind is drawn (not where WebGL is missing, or motion is unwelcome). */
  protected readonly drawn = signal(false);
  /** Shrinks on short screens so everything fits. */
  protected readonly sealSize = 'clamp(72px, 11vh, 104px)';

  private readonly router = inject(Router);
  private readonly music = inject(Music);
  private readonly keepsakes = inject(Keepsakes);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('panorama');
  private panorama: Panorama | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const lines = this.play.splashes;
      this.splash.set(lines[Math.floor(Math.random() * lines.length)]);
      this.drawn.set(!prefersReducedMotion() && canDrawWebGL2());
    });
    // Once the canvas is there, the world is built behind it.
    effect(() => {
      const canvas = this.canvas()?.nativeElement;
      if (canvas) untracked(() => void this.build(canvas));
    });
    const onResize = () => this.panorama?.resize();
    const onVisible = () => this.panorama?.setPaused(document.hidden);
    afterNextRender(() => {
      addEventListener('resize', onResize, { passive: true });
      document.addEventListener('visibilitychange', onVisible);
    });
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timer);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      this.panorama?.dispose();
    });
  }

  protected breakSeal(): void {
    if (this.opening()) return;
    this.opening.set(true);
    // Inside the click, so the browser lets the music start with sound.
    this.music.begin();
    // The first keepsake: the hunt begins at the front door.
    this.keepsakes.unlock('seal');
    // Let the seal crack and the words lift before the library fades in.
    const delay = prefersReducedMotion() ? 0 : 1150;
    this.timer = setTimeout(() => void this.router.navigateByUrl('/library'), delay);
  }

  private async build(canvas: HTMLCanvasElement): Promise<void> {
    if (this.panorama) return;
    try {
      const { createPanorama } = await import('./panorama');
      if (this.destroyed) return;
      this.panorama = createPanorama(canvas);
      canvas.classList.add('is-ready');
    } catch {
      this.drawn.set(false);
    }
  }
}
