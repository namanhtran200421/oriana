import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { prefersReducedMotion } from '../../../core/motion';
import { BookCover } from '../../../ui/book-cover/book-cover';
import { Face, PAPER, PageSide, SpreadFaces } from '../book-model';
import { BookPage } from '../book-page/book-page';
import { ReaderContext } from '../reader-context';
import { turnTracks } from './turn';

type Intent = { step: 1 | -1 } | { to: number };

interface Turn {
  dir: 1 | -1;
  from: number;
  to: number;
  /** The two pages lying still beneath the turning leaf. */
  under: SpreadFaces;
}

interface Leaf {
  dir: 1 | -1;
  front: Face;
  back: Face;
  frontSide: PageSide;
  backSide: PageSide;
}

interface Drag {
  pointer: number;
  x0: number;
  y0: number;
  x: number;
  t: number;
  /** Smoothed horizontal speed, px/ms. */
  velocity: number;
  progress: number;
  dir: 1 | -1 | 0;
}

// Ease-out only: a page lifts promptly and settles slowly, never bounces.
const EASE_TURN = 'cubic-bezier(0.3, 0.62, 0.22, 1)';
const EASE_RELEASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
const SCRUB_MS = 1000;
const DRAG_SLOP = 10;
const WHEEL_THRESHOLD = 40;

/**
 * A book on the desk. Two still pages lie open; a single "leaf" is brought in
 * for each turn, its front showing the page being lifted and its back the
 * page it reveals, and rotated about the spine with the Web Animations API so
 * the motion runs on the compositor. Turns can be clicked, keyed, swiped, or
 * dragged by hand and let go.
 */
@Component({
  selector: 'app-book',
  imports: [NgTemplateOutlet, BookCover, BookPage],
  templateUrl: './book.html',
  styleUrl: './book.scss',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerCancel()',
    '(click)': 'onClick($event)',
    '(wheel)': 'onWheel($event)',
  },
})
export class Book {
  readonly closeRequested = output<void>();

  protected readonly ctx = inject(ReaderContext);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly bookEl = viewChild.required<ElementRef<HTMLElement>>('bookEl');
  private readonly leafEl = viewChild.required<ElementRef<HTMLElement>>('leafEl');
  private readonly frontEl = viewChild.required<ElementRef<HTMLElement>>('frontEl');
  private readonly backEl = viewChild.required<ElementRef<HTMLElement>>('backEl');
  private readonly frontShadeEl = viewChild.required<ElementRef<HTMLElement>>('frontShade');
  private readonly backShadeEl = viewChild.required<ElementRef<HTMLElement>>('backShade');
  private readonly castLeftEl = viewChild.required<ElementRef<HTMLElement>>('castLeft');
  private readonly castRightEl = viewChild.required<ElementRef<HTMLElement>>('castRight');

  protected readonly spreadMode = computed(() => this.ctx.mode() === 'spread');
  protected readonly closed = computed(() => this.ctx.spread() === 0);
  protected readonly turn = signal<Turn | null>(null);
  /** Kept after a turn ends so the next one can reuse pages already laid out. */
  protected readonly leaf = signal<Leaf>({
    dir: 1,
    front: PAPER,
    back: PAPER,
    frontSide: 'recto',
    backSide: 'verso',
  });
  protected readonly view = computed(
    () => this.turn()?.under ?? this.ctx.facesAt(this.ctx.spread()),
  );

  private animations: Animation[] = [];
  private queue: Intent[] = [];
  private drag: Drag | null = null;
  private suppressClick = false;
  private pendingOpen = false;
  private idle: Array<() => void> = [];
  private wheelTotal = 0;
  private wheelSpent = false;
  private wheelTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // A cover clicked before the pages were set opens as soon as they are.
    effect(() => {
      if (!this.ctx.ready()) return;
      untracked(() => {
        if (!this.pendingOpen) return;
        this.pendingOpen = false;
        this.request({ step: 1 });
      });
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.wheelTimer);
      for (const animation of this.animations) animation.cancel();
    });
  }

  next(): void {
    this.request({ step: 1 });
  }

  prev(): void {
    this.request({ step: -1 });
  }

  goTo(spread: number): void {
    this.request({ to: spread });
  }

  goToSection(section: number): void {
    this.request({ to: this.ctx.spreadOfSection(section) });
  }

  /** Closes the cover; resolves once it has settled. */
  close(): Promise<void> {
    this.queue = [];
    this.pendingOpen = false;
    if (this.closed() && !this.turn()) return Promise.resolve();
    const settled = new Promise<void>((resolve) => this.idle.push(resolve));
    if (this.turn()) this.queue.push({ to: 0 });
    else this.request({ to: 0 });
    return settled;
  }

  /** Completes any turn in flight at once, e.g. before the pages are re-flowed. */
  settle(): void {
    this.queue = [];
    this.drag = null;
    if (this.turn()) this.finish(true);
  }

  // -------------------------------------------------------------------------
  // Turning
  // -------------------------------------------------------------------------

  private request(intent: Intent): void {
    if (this.drag?.dir) return;
    if (this.turn()) {
      // Riffle: queue the request and hurry the page already in the air.
      if (this.queue.length < 2) this.queue.push(intent);
      for (const animation of this.animations) animation.updatePlaybackRate(2.2);
      return;
    }
    const from = this.ctx.spread();
    const to = this.target(intent, from);
    if (to === null || to === from) {
      this.flushIdle();
      return;
    }
    this.begin(from, to);
    this.play(0, 1, this.duration(from, to), EASE_TURN);
  }

  private target(intent: Intent, from: number): number | null {
    if (!this.ctx.ready()) {
      const opening = 'step' in intent ? intent.step > 0 : intent.to > 0;
      if (from === 0 && opening) this.pendingOpen = true;
      return null;
    }
    const last = this.ctx.lastSpread();
    const clamp = (spread: number) => Math.min(last, Math.max(0, spread));
    if ('to' in intent) return clamp(intent.to);
    if (from === 0 && intent.step > 0) return clamp(this.ctx.openTo());
    return clamp(from + intent.step);
  }

  private duration(from: number, to: number): number {
    if (from === 0 || to === 0) return 1300;
    const base = this.spreadMode() ? 920 : 720;
    return Math.abs(to - from) > 1 ? base + 160 : base;
  }

  /** Stages a turn: sets the pages beneath and on both sides of the leaf. */
  private begin(from: number, to: number): void {
    const dir = to > from ? 1 : -1;
    const a = this.ctx.facesAt(from);
    const b = this.ctx.facesAt(to);

    if (!this.spreadMode()) {
      this.leaf.set({
        dir,
        front: dir > 0 ? a.right : b.right,
        back: PAPER,
        frontSide: 'recto',
        backSide: 'verso',
      });
    } else if (dir > 0) {
      this.leaf.set({ dir, front: a.right, back: b.left, frontSide: 'recto', backSide: 'verso' });
    } else {
      this.leaf.set({ dir, front: a.left, back: b.right, frontSide: 'verso', backSide: 'recto' });
    }

    this.turn.set({
      dir,
      from,
      to,
      under: dir > 0 ? { left: a.left, right: b.right } : { left: b.left, right: a.right },
    });
    // Render synchronously so the first animated frame already shows the right pages.
    this.cdr.detectChanges();
  }

  private play(from: number, to: number, duration: number, easing: string): void {
    const turn = this.turn();
    if (!turn) return;
    if (prefersReducedMotion()) {
      this.finish(to >= 1);
      return;
    }

    const tracks = turnTracks(this.ctx.mode(), turn.dir, from, to);
    const timing: KeyframeAnimationOptions = { duration, easing, fill: 'both' };
    const animations = [
      this.leafEl().nativeElement.animate(tracks.leaf, timing),
      this.frontEl().nativeElement.animate(tracks.front, timing),
      this.backEl().nativeElement.animate(tracks.back, timing),
      this.frontShadeEl().nativeElement.animate(tracks.frontShade, timing),
      this.backShadeEl().nativeElement.animate(tracks.backShade, timing),
      this.castLeftEl().nativeElement.animate(tracks.castLeft, timing),
      this.castRightEl().nativeElement.animate(tracks.castRight, timing),
    ];
    const shift = this.coverShift(turn, from, to);
    if (shift) animations.push(this.bookEl().nativeElement.animate(shift, timing));

    this.animations = animations;
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (this.animations === animations) this.finish(to >= 1);
      },
      () => {
        // Cancelled: a drag was released or the turn was settled early.
      },
    );
  }

  /** A closed book sits centred on the desk and slides over as it opens. */
  private coverShift(turn: Turn, from: number, to: number): Keyframe[] | null {
    if (!this.spreadMode() || (turn.from !== 0 && turn.to !== 0)) return null;
    const half = this.ctx.layout().pageW / 2;
    const at = (p: number) => {
      const x = turn.from === 0 ? -half * (1 - p) : -half * p;
      return { transform: `translateX(${x.toFixed(2)}px)` };
    };
    return [at(from), at(to)];
  }

  private finish(completed: boolean): void {
    const turn = this.turn();
    if (!turn) return;
    if (completed) this.ctx.spread.set(turn.to);
    this.turn.set(null);
    // Swap the still pages in the same frame the leaf disappears.
    this.cdr.detectChanges();
    for (const animation of this.animations) animation.cancel();
    this.animations = [];

    const next = this.queue.shift();
    if (next) this.request(next);
    else this.flushIdle();
  }

  private flushIdle(): void {
    const waiting = this.idle;
    this.idle = [];
    for (const resolve of waiting) resolve();
  }

  // -------------------------------------------------------------------------
  // Hands
  // -------------------------------------------------------------------------

  protected onPointerDown(event: PointerEvent): void {
    this.suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || this.turn()) return;
    this.drag = {
      pointer: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      x: event.clientX,
      t: event.timeStamp,
      velocity: 0,
      progress: 0,
      dir: 0,
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x0;

    if (!drag.dir) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      const step = dx < 0 ? 1 : -1;
      const from = this.ctx.spread();
      const vertical = Math.abs(event.clientY - drag.y0) > Math.abs(dx);
      const to = vertical ? null : this.target({ step }, from);
      if (to === null || to === from) {
        this.drag = null;
        return;
      }
      if (prefersReducedMotion()) {
        this.drag = null;
        this.suppressClick = true;
        this.request({ step });
        return;
      }
      drag.dir = step;
      this.host.setPointerCapture(event.pointerId);
      this.begin(from, to);
      this.play(0, 1, SCRUB_MS, 'linear');
      for (const animation of this.animations) animation.pause();
    }

    const dt = event.timeStamp - drag.t;
    if (dt > 0) drag.velocity = 0.75 * ((event.clientX - drag.x) / dt) + 0.25 * drag.velocity;
    drag.x = event.clientX;
    drag.t = event.timeStamp;

    const travel = this.ctx.layout().pageW * (this.spreadMode() ? 1.4 : 0.85);
    drag.progress = Math.min(1, Math.max(0, (-dx * drag.dir) / travel));
    for (const animation of this.animations) animation.currentTime = drag.progress * SCRUB_MS;
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    this.drag = null;
    if (!drag.dir) return;
    this.suppressClick = true;
    const fling = -drag.velocity * drag.dir;
    this.release(drag.progress, fling > 0.35 || (drag.progress > 0.4 && fling > -0.2));
  }

  protected onPointerCancel(): void {
    const drag = this.drag;
    this.drag = null;
    if (drag?.dir) this.release(drag.progress, false);
  }

  /** Lets go of a dragged leaf: it either completes the turn or falls back. */
  private release(progress: number, complete: boolean): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    const turn = this.turn();
    if (!turn) return;
    const target = complete ? 1 : 0;
    const remaining = Math.abs(target - progress);
    const duration = Math.max(240, this.duration(turn.from, turn.to) * remaining * 0.85);
    this.play(progress, target, duration, EASE_RELEASE);
  }

  protected onClick(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const target = event.target as HTMLElement;
    const goto = target.closest<HTMLElement>('[data-goto]');
    if (goto) {
      this.goToSection(Number(goto.dataset['goto']));
      return;
    }
    if (target.closest('[data-action="close"]')) {
      this.closeRequested.emit();
      return;
    }

    const rect = this.bookEl().nativeElement.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) return;
    if (this.closed()) {
      this.next();
      return;
    }
    const x = (event.clientX - rect.left) / rect.width;
    if (x >= (this.spreadMode() ? 0.5 : 0.3)) this.next();
    else this.prev();
  }

  /** One page per trackpad swipe or wheel flick, however long its momentum lasts. */
  protected onWheel(event: WheelEvent): void {
    if (event.ctrlKey) return;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => {
      this.wheelTotal = 0;
      this.wheelSpent = false;
    }, 240);
    if (this.wheelSpent) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    this.wheelTotal += delta;
    if (Math.abs(this.wheelTotal) < WHEEL_THRESHOLD) return;
    this.wheelSpent = true;
    if (this.wheelTotal > 0) this.next();
    else this.prev();
  }
}
