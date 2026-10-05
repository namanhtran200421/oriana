import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { prefersReducedMotion } from '../core/motion';

/**
 * A brass ring that trails the pointer, beside the system cursor rather than
 * instead of it. It swells over anything that can be pressed, and over an
 * element with `data-cursor` it says what pressing will do. Mouse and
 * trackpad only; touch has no pointer to follow.
 */
@Component({
  selector: 'app-cursor',
  template: `
    <span class="cursor__ring"></span>
    <span class="cursor__label">{{ label() }}</span>
  `,
  styles: `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 900;
      opacity: 0;
      pointer-events: none;
      transition: opacity 400ms var(--ease-out);
      will-change: transform;
    }

    :host(.is-on) {
      opacity: 1;
    }

    .cursor__ring {
      position: absolute;
      top: -46px;
      left: -46px;
      width: 92px;
      height: 92px;
      border: 2px solid rgb(201 169 98 / 0.6);
      border-radius: 50%;
      scale: 0.36;
      transition:
        scale 550ms var(--ease-out),
        background-color 550ms var(--ease-out),
        border-color 550ms var(--ease-out);
    }

    :host(.is-over) .cursor__ring {
      border-color: var(--color-brass-light);
      background: rgb(201 169 98 / 0.12);
      scale: 0.5;
    }

    :host(.is-labelled) .cursor__ring {
      border-color: var(--color-brass);
      background: rgb(18 13 10 / 0.88);
      backdrop-filter: blur(3px);
      scale: 1;
    }

    .cursor__label {
      position: absolute;
      top: 0;
      left: 0;
      font-family: var(--font-display);
      font-size: 0.58rem;
      font-weight: var(--display-weight);
      letter-spacing: var(--tracking-label);
      text-transform: uppercase;
      color: var(--color-brass-light);
      white-space: nowrap;
      opacity: 0;
      translate: -50% -50%;
      transition: opacity 300ms var(--ease-out);
    }

    :host(.is-labelled) .cursor__label {
      opacity: 1;
      transition-delay: 150ms;
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[class.is-on]': 'on()',
    '[class.is-over]': 'over()',
    '[class.is-labelled]': '!!label()',
  },
})
export class Cursor {
  protected readonly on = signal(false);
  protected readonly over = signal(false);
  protected readonly label = signal('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (prefersReducedMotion()) return;
      destroyRef.onDestroy(this.follow());
    });
  }

  private follow(): () => void {
    const target = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };
    let frame = 0;

    const draw = () => {
      at.x += (target.x - at.x) * 0.22;
      at.y += (target.y - at.y) * 0.22;
      this.host.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
      frame = Math.hypot(target.x - at.x, target.y - at.y) > 0.3 ? requestAnimationFrame(draw) : 0;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = event.clientX;
      target.y = event.clientY;
      read(event.target);
      if (!this.on()) {
        at.x = target.x;
        at.y = target.y;
        this.on.set(true);
      }
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const read = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      const named = element?.closest<HTMLElement>('[data-cursor]');
      const label = named?.dataset['cursor'] ?? '';
      if (label !== this.label()) this.label.set(label);
      const over = !named && !!element?.closest('a, button, [role="button"]');
      if (over !== this.over()) this.over.set(over);
    };
    const onOver = (event: PointerEvent) => read(event.target);
    const onLeave = (event: PointerEvent) => {
      if (!event.relatedTarget) this.on.set(false);
    };

    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onLeave);
    };
  }
}
