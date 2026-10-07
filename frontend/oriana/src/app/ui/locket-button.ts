import { Component, computed, inject, input } from '@angular/core';
import { playLabelsFor } from '../core/i18n-play';
import { Keepsakes } from '../core/keepsakes';
import { Locket } from '../core/locket';
import type { Lang } from '../core/story';
import { SITE } from '../../stories/site';
import { Icon } from './icon';

/** The locket on its chain: opens the keepsakes, and glows when something new is inside. */
@Component({
  selector: 'app-locket-button',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="btn btn--icon locket"
      [class.is-fresh]="keepsakes.unseen().size > 0"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="locket.open()"
    >
      <app-icon name="locket" />
      @if (keepsakes.count() > 0) {
        <span class="locket__count" aria-hidden="true">{{ keepsakes.count() }}</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      view-transition-name: locket-button;
    }

    .locket {
      position: relative;
      overflow: visible;
    }

    .locket__count {
      position: absolute;
      top: -0.3rem;
      right: -0.35rem;
      display: grid;
      place-items: center;
      min-width: 1.35rem;
      height: 1.35rem;
      padding: 0 0.3rem;
      // A stack count, as on an item in a slot.
      border: 0;
      background: none;
      color: #fff;
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1;
      text-shadow: 2px 2px 0 #3f3f3f;
    }

    // Something new inside: the locket glows, softly, until it is opened.
    .is-fresh {
      animation: locket-glow 1.2s steps(2) infinite;
    }

    @keyframes locket-glow {
      50% {
        outline-color: var(--color-brass);
      }
    }
  `,
})
export class LocketButton {
  readonly lang = input<Lang>(SITE.lang);

  protected readonly keepsakes = inject(Keepsakes);
  protected readonly locket = inject(Locket);
  protected readonly label = computed(() => {
    const labels = playLabelsFor(this.lang());
    return `${labels.locket} · ${labels.foundOf(this.keepsakes.count(), this.keepsakes.total)}`;
  });
}
