import { Component, computed, inject, input } from '@angular/core';
import { labelsFor } from '../core/i18n';
import { Music } from '../core/music';
import type { Lang } from '../core/story';
import { SITE } from '../../stories/site';

/** A slot whose bars (in whole pixels) murmur while the music plays. */
@Component({
  selector: 'app-music-toggle',
  template: `
    @if (music.available) {
      <button
        type="button"
        class="btn btn--icon music"
        data-music-toggle
        [class.is-on]="music.on()"
        [class.is-sounding]="music.sounding()"
        [attr.aria-pressed]="music.on()"
        [attr.aria-label]="music.on() ? labels().musicPause : labels().musicPlay"
        [attr.title]="music.on() ? labels().musicPause : labels().musicPlay"
        (click)="music.toggle()"
      >
        <span class="music__bars" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </span>
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      view-transition-name: music-toggle;
    }

    .music__bars {
      display: flex;
      align-items: center;
      gap: 3px;
      height: 16px;
    }

    // At rest the bars hold the shape of a quiet equalizer, so the button
    // reads as music even when silent; while sounding they murmur gently.
    .music__bars span {
      width: 3px;
      height: 100%;
      background: currentColor;
      opacity: 0.5;
      transform: scaleY(var(--rest));
      transition:
        transform 300ms steps(3),
        opacity 300ms var(--ease-out);
    }

    .music__bars span:nth-child(1) {
      --rest: 0.4;
    }

    .music__bars span:nth-child(2) {
      --rest: 0.75;
    }

    .music__bars span:nth-child(3) {
      --rest: 0.55;
    }

    .music__bars span:nth-child(4) {
      --rest: 0.3;
    }

    .is-on .music__bars span {
      opacity: 1;
    }

    .is-sounding .music__bars span {
      animation: murmur 1400ms var(--ease-out) infinite alternate;
    }

    .is-sounding .music__bars span:nth-child(2) {
      animation-duration: 1900ms;
      animation-delay: -400ms;
    }

    .is-sounding .music__bars span:nth-child(3) {
      animation-duration: 1100ms;
      animation-delay: -800ms;
    }

    .is-sounding .music__bars span:nth-child(4) {
      animation-duration: 1650ms;
      animation-delay: -200ms;
    }

    @keyframes murmur {
      from {
        transform: scaleY(0.25);
      }
      to {
        transform: scaleY(1);
      }
    }
  `,
})
export class MusicToggle {
  /** Language for its label; the chrome's language by default. */
  readonly lang = input<Lang>(SITE.lang);

  protected readonly music = inject(Music);
  protected readonly labels = computed(() => labelsFor(this.lang()));
}
