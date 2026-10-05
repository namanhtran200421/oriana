import { Component, computed, input } from '@angular/core';

/**
 * Text that inks itself in, letter by letter, as if the nib were still on the
 * page. Screen readers get the whole word; the letters are for the eye.
 * Starts with the page's opening reveal, or, inside an `[appReveal]`, when
 * that scrolls into view.
 */
@Component({
  selector: 'app-ink-text',
  template: `
    <span class="sr-only">{{ text() }}</span>
    @for (letter of letters(); track $index) {
      <span class="ink" aria-hidden="true" [style.--i]="$index">{{ letter }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .ink {
      display: inline-block;
      white-space: pre;
    }

    :host-context(.js) .ink {
      opacity: 0;
    }

    :host-context(.fonts-ready .reveal) .ink,
    :host-context(.is-revealed) .ink {
      animation: ink 1.6s var(--ease-ink) both;
      animation-delay: calc(var(--d, 0) * 140ms + 120ms + var(--i) * 75ms);
    }

    @keyframes ink {
      from {
        opacity: 0;
        filter: blur(0.12em);
        transform: translate3d(0, 0.12em, 0) scale(1.06);
      }
      60% {
        filter: blur(0);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class InkText {
  readonly text = input.required<string>();

  protected readonly letters = computed(() => [...this.text()]);
}
