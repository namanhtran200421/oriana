import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { labelsFor } from '../../core/i18n';
import { prefersReducedMotion } from '../../core/motion';
import { Music } from '../../core/music';
import { RomanPipe } from '../../core/roman';
import { MusicToggle } from '../../ui/music-toggle';
import { WaxSeal } from '../../ui/wax-seal/wax-seal';
import { SITE } from '../../../stories/site';

/** The front door: her name, one line, and a wax seal to break. */
@Component({
  selector: 'app-threshold',
  imports: [MusicToggle, RomanPipe, WaxSeal],
  templateUrl: './threshold.html',
  styleUrl: './threshold.scss',
})
export class Threshold {
  protected readonly site = SITE;
  protected readonly labels = labelsFor(SITE.lang);
  protected readonly opening = signal(false);
  /** Shrinks on short screens so the whole certificate fits. */
  protected readonly sealSize = 'clamp(80px, 12vh, 116px)';

  private readonly router = inject(Router);
  private readonly music = inject(Music);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected breakSeal(): void {
    if (this.opening()) return;
    this.opening.set(true);
    // Inside the click, so the browser lets the music start with sound.
    this.music.begin();
    // Let the seal crack and the words lift before the library fades in.
    const delay = prefersReducedMotion() ? 0 : 1150;
    this.timer = setTimeout(() => void this.router.navigateByUrl('/library'), delay);
  }
}
