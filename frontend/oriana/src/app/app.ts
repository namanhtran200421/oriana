import { Component, DOCUMENT, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Music } from './core/music';
import { SITE } from '../stories/site';

@Component({
  imports: [RouterOutlet],
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
    afterNextRender(() => music.attach(this.player().nativeElement));
  }
}
