import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';

/** Lets an element settle in like ink the first time it scrolls into view. */
@Directive({
  selector: '[appReveal]',
  host: {
    class: 'reveal-on-scroll',
    '[class.is-revealed]': 'revealed()',
  },
})
export class Reveal {
  /** How much of the element must be in view first, 0 to 1 (default: any). */
  readonly appReveal = input(0, { transform: (value: unknown) => Number(value) || 0 });

  protected readonly revealed = signal(false);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'function') {
        this.revealed.set(true);
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          this.revealed.set(true);
          observer.disconnect();
        },
        { rootMargin: '0px 0px -8% 0px', threshold: this.appReveal() },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
