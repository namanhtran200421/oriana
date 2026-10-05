import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Bookmark } from '../../../core/bookmarks';
import { labelsFor } from '../../../core/i18n';
import { RomanPipe, toRoman } from '../../../core/roman';
import type { StoryEntry } from '../../../core/story';
import { InkText } from '../../../ui/ink-text';
import { SITE } from '../../../../stories/site';
import type { VolumeDetail } from '../shelf';
import type { Stage } from '../stage/engine';
import { STOPS, Stop } from '../stage/journey';

interface Volume {
  story: StoryEntry;
  volume: number;
  roman: string;
}

/**
 * The library as a room you walk through. A fixed canvas holds the reading
 * room in three dimensions; the page scrolls past it, and scrolling moves the
 * camera: from the lamplit desk, down over the letter as it unfolds, up to
 * the shelf where Oriana's volumes stand. The words for each moment are laid
 * over the picture, and everything the canvas does can also be done here.
 */
@Component({
  selector: 'app-reading-room',
  imports: [InkText, RomanPipe],
  templateUrl: './reading-room.html',
  styleUrl: './reading-room.scss',
  host: { '[class.is-holding]': '!!held()' },
})
export class ReadingRoom {
  readonly stories = input.required<readonly StoryEntry[]>();
  readonly marks = input<Partial<Record<string, Bookmark>>>({});
  readonly details = input<Partial<Record<string, VolumeDetail>>>({});
  readonly read = output<StoryEntry>();
  /** The room could not be built here; the flat library should stand in. */
  readonly failed = output<void>();

  protected readonly site = SITE;
  protected readonly labels = labelsFor(SITE.lang);
  protected readonly volumes = computed<Volume[]>(() =>
    this.stories().map((story, i) => ({ story, volume: i + 1, roman: toRoman(i + 1) })),
  );
  protected readonly ready = signal(false);
  protected readonly hovered = signal<string | null>(null);
  protected readonly held = signal<Volume | null>(null);
  protected readonly settled = signal(false);
  protected readonly leaving = signal(false);
  /** Which moment of the journey is on screen, for what can be pressed. */
  protected readonly atShelf = signal(false);
  /** How far the room has got with being built, 0 to 1. */
  protected readonly built = signal(0);
  /** The resting place nearest the camera. */
  protected readonly here = signal<Stop>('desk');
  /** How far the page scrolls, in pixels, for placing the resting places. */
  protected readonly travel = signal(0);
  protected readonly stops = (Object.keys(STOPS) as Stop[]).map((key) => ({
    key,
    at: STOPS[key],
    label: { desk: this.labels.theDesk, letter: this.labels.theLetter, shelf: this.labels.theShelf }[key],
  }));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  private readonly readButton = viewChild<ElementRef<HTMLButtonElement>>('readButton');
  private stage?: Stage;

  private destroyed = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      let stop = () => {};
      void this.build().then((cleanup) => (stop = cleanup));
      destroyRef.onDestroy(() => {
        this.destroyed = true;
        stop();
        this.stage?.dispose();
      });
    });
  }

  /** Walks to one of the resting places. */
  protected goTo(at: number): void {
    scrollTo({ top: at * this.travel(), behavior: 'smooth' });
  }

  /** A plaque under the hand draws its book forward on the shelf. */
  protected reachFor(slug: string | null): void {
    this.stage?.highlight(slug);
  }

  protected titleOf(slug: string | null): Volume | undefined {
    return this.volumes().find((v) => v.story.slug === slug);
  }

  protected async takeDown(volume: Volume): Promise<void> {
    if (!this.stage || this.held()) return;
    this.held.set(volume);
    this.settled.set(false);
    this.panel().nativeElement.showModal();
    await this.stage.takeDown(volume.story.slug);
    if (this.held() !== volume) return;
    this.settled.set(true);
    this.readButton()?.nativeElement.focus({ preventScroll: true });
  }

  protected async putBack(): Promise<void> {
    if (!this.stage || !this.held() || !this.settled()) return;
    this.settled.set(false);
    this.panel().nativeElement.close();
    await this.stage.putBack();
    this.held.set(null);
  }

  protected async readIt(): Promise<void> {
    const volume = this.held();
    if (!this.stage || !volume || !this.settled() || this.leaving()) return;
    this.leaving.set(true);
    await this.stage.leanIn();
    this.read.emit(volume.story);
  }

  protected onPanelCancel(event: Event): void {
    event.preventDefault();
    void this.putBack();
  }

  protected onPanelClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('.panel__card')) void this.putBack();
  }

  private async build(): Promise<() => void> {
    const canvas = this.canvas().nativeElement;
    const lite = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
    let stage: Stage;
    try {
      const { createStage } = await import('../stage/engine');
      stage = await createStage(canvas, {
        lite,
        onProgress: (done) => this.built.set(done),
        paper: '/textures/paper.webp',
        volumeLabel: this.labels.volume,
        note: SITE.preface,
        volumes: this.volumes().map((v) => {
          const mark = this.marks()[v.story.slug];
          return { ...v, finished: !!mark?.finished, reading: !!mark && !mark.finished };
        }),
        onHover: (slug) => {
          this.hovered.set(slug);
          if (slug) canvas.dataset['cursor'] = this.labels.takeDownShort;
          else delete canvas.dataset['cursor'];
          canvas.style.cursor = slug ? 'pointer' : '';
        },
      });
    } catch {
      if (!this.destroyed) this.failed.emit();
      return () => {};
    }
    // Left before the room was finished: let it go at once.
    if (this.destroyed) {
      stage.dispose();
      return () => {};
    }
    this.stage = stage;

    const style = this.host.style;
    let frame = 0;
    const root = document.documentElement;
    const measure = () => this.travel.set(Math.max(0, root.scrollHeight - innerHeight));
    const progress = () => (this.travel() > 0 ? scrollY / this.travel() : 0);
    const place = () => {
      frame = 0;
      const p = progress();
      stage.setProgress(p);
      style.setProperty('--p', p.toFixed(4));
      const nearest = this.stops.reduce((a, b) => (Math.abs(b.at - p) < Math.abs(a.at - p) ? b : a));
      if (nearest.key !== this.here()) this.here.set(nearest.key);
      // Each moment's words come and go with the camera.
      style.setProperty('--title', String(fade(p, -1, 0, 0.05, 0.13)));
      style.setProperty('--letter', String(fade(p, 0.3, 0.38, 0.5, 0.58)));
      style.setProperty('--shelf', String(fade(p, 0.8, 0.88, 2, 3)));
      const atShelf = p > 0.84;
      if (atShelf !== this.atShelf()) this.atShelf.set(atShelf);
    };
    const onScroll = () => (frame ||= requestAnimationFrame(place));
    const onResize = () => {
      measure();
      stage.resize(innerWidth, innerHeight);
      onScroll();
    };
    const onMove = (event: PointerEvent) => {
      stage.setPointer(
        (event.clientX / innerWidth) * 2 - 1,
        -(event.clientY / innerHeight) * 2 + 1,
      );
    };
    const onLeave = () => stage.setPointer(null, 0);
    // Picked where the click landed, so a tap works as well as a hover.
    const onClick = (event: MouseEvent) => {
      const slug = stage.pick(
        (event.clientX / innerWidth) * 2 - 1,
        -(event.clientY / innerHeight) * 2 + 1,
      );
      const volume = slug ? this.titleOf(slug) : undefined;
      if (volume) void this.takeDown(volume);
    };

    measure();
    stage.resize(innerWidth, innerHeight);
    stage.setProgress(progress(), true);
    place();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    // The walk settles at the desk, the letter and the shelf.
    root.style.scrollSnapType = 'y proximity';
    this.ready.set(true);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      root.style.scrollSnapType = '';
    };
  }
}

/** 0 before `a`, rising to 1 by `b`, holding to `c`, gone again by `d`. */
function fade(p: number, a: number, b: number, c: number, d: number): number {
  const rise = Math.min(1, Math.max(0, (p - a) / (b - a)));
  const fall = Math.min(1, Math.max(0, (d - p) / (d - c)));
  return Math.round(Math.min(rise, fall) * 1000) / 1000;
}
