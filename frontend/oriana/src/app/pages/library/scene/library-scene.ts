import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { prefersReducedMotion } from '../../../core/motion';
import { BEAMS, WINDOW, buildHall } from './hall';
import { Motes } from './motes';

const HALL = buildHall();

/**
 * The hall the library stands in, behind everything else: towering shelves
 * either side of a moonlit window, and dust that follows Oriana's hand like a
 * lantern. The hall drifts with the pointer and the scroll.
 */
@Component({
  selector: 'app-library-scene',
  templateUrl: './library-scene.html',
  styleUrl: './library-scene.scss',
  host: { 'aria-hidden': 'true' },
})
export class LibraryScene {
  protected readonly hall = HALL;
  protected readonly window = WINDOW;
  protected readonly beams = BEAMS;
  /** Six foils round a small eye, inside the rose. */
  protected readonly rosette = [
    { x: WINDOW.rose.cx, y: WINDOW.rose.cy, r: 11 },
    ...Array.from({ length: 6 }, (_, i) => ({
      x: WINDOW.rose.cx + Math.cos((i * Math.PI) / 3) * 31,
      y: WINDOW.rose.cy + Math.sin((i * Math.PI) / 3) * 31,
      r: 19,
    })),
  ];

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('motes');
  private readonly lantern = viewChild.required<ElementRef<HTMLElement>>('lantern');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => destroyRef.onDestroy(this.run()));
  }

  private run(): () => void {
    const reduced = prefersReducedMotion();
    const canHover = matchMedia('(hover: hover)').matches;
    const motes = new Motes(this.canvas().nativeElement);
    const lantern = this.lantern().nativeElement;
    const style = this.host.style;

    let width = 0;
    let height = 0;
    const resize = () => {
      width = innerWidth;
      height = innerHeight;
      motes.resize(width, height, Math.min(2, devicePixelRatio || 1));
    };
    resize();

    const target = { x: width * 0.5, y: height * 0.3, active: false };
    const eased = { ...target };
    let touchedAt = -Infinity;
    let scroll = scrollY;
    let shownScroll = Number.NaN;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      target.active = true;
      touchedAt = performance.now();
    };
    const onRelease = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') target.active = false;
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) target.active = false;
    };
    const onDown = (event: PointerEvent) => {
      onMove(event);
      if (!isInteractive(event.target)) motes.burst(event.clientX, event.clientY);
    };
    const onScroll = () => (scroll = scrollY);

    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('pointerup', onRelease, { passive: true });
    addEventListener('pointercancel', onRelease, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', resize, { passive: true });
    const unlisten = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onRelease);
      removeEventListener('pointercancel', onRelease);
      document.removeEventListener('pointerout', onOut);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', resize);
    };

    const place = () => {
      lantern.style.transform = `translate3d(${eased.x}px, ${eased.y}px, 0)`;
      style.setProperty('--mx', ((eased.x / width) * 2 - 1).toFixed(4));
      style.setProperty('--my', ((eased.y / height) * 2 - 1).toFixed(4));
      if (scroll !== shownScroll) {
        shownScroll = scroll;
        style.setProperty('--scroll', `${scroll}px`);
        style.setProperty('--fade', Math.min(1, scroll / (height * 0.9)).toFixed(3));
      }
    };

    if (reduced) {
      place();
      motes.step(0, 0);
      return unlisten;
    }

    let frame = 0;
    let then = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - then) / 1000);
      then = now;
      const time = now / 1000;

      // Without a hovering pointer the lantern wanders the hall on its own.
      if (!canHover && now - touchedAt > 2500) {
        target.x = width * (0.5 + 0.32 * Math.sin(time * 0.13));
        target.y = height * (0.36 + 0.18 * Math.sin(time * 0.21 + 1));
      }
      const follow = 1 - Math.exp(-dt * 5);
      eased.x += (target.x - eased.x) * follow;
      eased.y += (target.y - eased.y) * follow;

      place();
      motes.point(target.x, target.y, target.active);
      motes.step(dt, time);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        then = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      unlisten();
    };
  }
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('a, button, input, textarea, select, label, dialog')
  );
}
