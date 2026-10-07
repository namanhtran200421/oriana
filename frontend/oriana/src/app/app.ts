import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Delight } from './core/delight';
import { Journal } from './core/journal';
import { Music } from './core/music';
import { Secrets } from './core/secrets';
import { KeepsakeBox } from './ui/keepsake-box/keepsake-box';
import { Toaster } from './ui/toaster/toaster';
import { SITE } from '../stories/site';

@Component({
  imports: [KeepsakeBox, RouterOutlet, Toaster],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  private readonly player = viewChild.required<ElementRef<HTMLElement>>('player');

  constructor() {
    inject(DOCUMENT).documentElement.lang = SITE.lang;

    // The player lives outside the router outlet, so the music carries on
    // across every page. Loaded early so it is ready when the seal breaks.
    const music = inject(Music);
    const delight = inject(Delight);
    const secrets = inject(Secrets);
    const journal = inject(Journal);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      music.attach(this.player().nativeElement);
      journal.visit();
      // Sparkles wherever she touches, and an ear out for typed secrets.
      destroyRef.onDestroy(delight.start());
      destroyRef.onDestroy(secrets.start());
    });
  }
}
