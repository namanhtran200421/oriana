import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { labelsFor } from '../../core/i18n';
import { playLabelsFor } from '../../core/i18n-play';
import { Locket } from '../../core/locket';
import { prefersReducedMotion } from '../../core/motion';
import { Ambience } from '../../core/ambience';
import { ReasonsRead, WORLD_IDS, WorldId, isWorld } from '../../core/reasons';
import { Sfx } from '../../core/sfx';
import { canDrawWebGL2 } from '../../core/webgl';
import { Cursor } from '../../ui/cursor';
import { Icon, IconName } from '../../ui/icon';
import { LocketButton } from '../../ui/locket-button';
import { MusicToggle } from '../../ui/music-toggle';
import { REASONS } from '../../../stories/reasons';
import { SITE } from '../../../stories/site';
import type { Runtime, WorldBuilder } from './world/runtime';

const ICONS: Record<WorldId, IconName> = { meadow: 'flower', skies: 'moon', valley: 'sun' };

/** Each place is its own bundle, fetched when it is travelled to. */
const BUILDERS: Record<WorldId, () => Promise<WorldBuilder>> = {
  meadow: () => import('./world/meadow').then((m) => m.buildMeadow),
  skies: () => import('./world/skies').then((m) => m.buildSkies),
  valley: () => import('./world/valley').then((m) => m.buildValley),
};

/**
 * Beyond the library window: reasons I love you, kept in three places drawn
 * in three dimensions. Each reason is something there to touch: a glowing
 * flower, a wishing star, a balloon. Where the room cannot be drawn, or for
 * those who would rather things kept still, the reasons are simply written
 * down.
 */
@Component({
  selector: 'app-reasons',
  imports: [Cursor, Icon, LocketButton, MusicToggle],
  templateUrl: './reasons.html',
  styleUrl: './reasons.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Reasons {
  /** The place, from the route: /reasons/:world. */
  readonly world = input<string>();

  protected readonly labels = playLabelsFor(SITE.lang);
  protected readonly chrome = labelsFor(SITE.lang);
  protected readonly signature = SITE.preface.signature;
  protected readonly reasons = inject(ReasonsRead);
  protected readonly id = computed<WorldId>(() => {
    const world = this.world();
    return isWorld(world) ? world : WORLD_IDS[0];
  });
  protected readonly words = computed(() => REASONS[this.id()]);
  protected readonly total = computed(() => this.words().reasons.length);
  protected readonly readHere = computed(() => this.reasons.countIn(this.id()));
  protected readonly places = WORLD_IDS.map((id) => ({
    id,
    icon: ICONS[id],
    name: REASONS[id].name,
    total: REASONS[id].reasons.length,
  }));

  /** The reason open, if any. */
  protected readonly selected = signal<number | null>(null);
  /** The place has arrived and the veil has lifted. */
  protected readonly ready = signal(false);
  protected readonly building = signal(false);
  protected readonly leaving = signal(false);
  /** False where the places cannot be drawn: the reasons are listed instead. */
  protected readonly drawn = signal(true);
  protected readonly listing = signal(false);
  /** A touch screen: looking about is done by dragging. */
  protected readonly touch = signal(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly router = inject(Router);
  private readonly sfx = inject(Sfx);
  private readonly ambience = inject(Ambience);
  private readonly booted = signal(false);
  private runtime: Runtime | null = null;
  private generation = 0;
  private destroyed = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const locket = inject(Locket);

    afterNextRender(() => {
      this.reasons.restore();
      this.touch.set(matchMedia('(pointer: coarse)').matches);
      if (prefersReducedMotion() || !canDrawWebGL2()) this.drawn.set(false);
      this.booted.set(true);
    });

    // Arriving somewhere, or travelling on to the next place.
    effect(() => {
      const id = this.id();
      if (!this.booted()) return;
      untracked(() => void this.enter(id));
    });

    // With the locket open over it, the place rests.
    effect(() => {
      const covered = locket.isOpen();
      if (this.ready()) this.runtime?.setPaused(covered);
    });

    destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.ambience.play(null);
      this.runtime?.dispose();
    });
  }

  /** A reason touched: the camera leans in, and it is read. */
  protected pick(index: number): void {
    if (this.leaving() || index < 0 || index >= this.total()) return;
    this.selected.set(index);
    this.runtime?.select(index);
    this.reasons.mark(this.id(), index);
    this.runtime?.setRead(this.readSet());
    this.sfx.play('pop', index * 2);
  }

  protected pickFromList(index: number): void {
    if (this.drawn()) this.listing.set(false);
    this.pick(index);
  }

  /** The next reason not yet read here, or simply the next one. */
  protected next(): void {
    const total = this.total();
    const from = this.selected() ?? -1;
    for (let step = 1; step <= total; step++) {
      const index = (from + step) % total;
      if (!this.reasons.has(this.id(), index)) return this.pick(index);
    }
    this.pick((from + 1) % total);
  }

  protected close(): void {
    this.selected.set(null);
    this.runtime?.select(null);
  }

  protected async travel(id: WorldId): Promise<void> {
    if (id === this.id() || this.leaving()) return;
    this.sfx.play('flip');
    await this.depart();
    if (!this.destroyed) await this.router.navigate(['/reasons', id]);
  }

  protected async back(): Promise<void> {
    if (this.leaving()) return;
    await this.depart();
    if (!this.destroyed) await this.router.navigateByUrl('/library');
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.target as Element | null)?.closest?.('input, textarea, dialog[open]')) return;
    const index = this.selected();
    if (event.key === 'Escape' && index !== null) this.close();
    else if (event.key === 'ArrowRight') this.pick(((index ?? -1) + 1) % this.total());
    else if (event.key === 'ArrowLeft') this.pick(((index ?? 0) - 1 + this.total()) % this.total());
    else return;
    event.preventDefault();
  }

  /** The camera rises away as the veil comes down. */
  private async depart(): Promise<void> {
    this.close();
    this.leaving.set(true);
    this.ready.set(false);
    this.ambience.play(null);
    await Promise.all([
      this.runtime?.leave() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
  }

  private async enter(id: WorldId): Promise<void> {
    const generation = ++this.generation;
    this.selected.set(null);
    this.listing.set(false);
    // The place is heard before it is seen.
    this.ambience.play(id);
    if (!this.drawn()) {
      this.leaving.set(false);
      this.ready.set(true);
      return;
    }
    this.building.set(true);
    try {
      if (!this.runtime) {
        const canvas = this.canvas()?.nativeElement;
        if (!canvas) throw new Error('No canvas');
        const { createRuntime } = await import('./world/runtime');
        if (this.destroyed) return;
        this.runtime = createRuntime(canvas, {
          lite: matchMedia('(max-width: 767px), (pointer: coarse)').matches,
          onHover: (index) => {
            if (index === null) delete canvas.dataset['cursor'];
            else canvas.dataset['cursor'] = '♡';
          },
          onPick: (index) => this.pick(index),
        });
      }
      const runtime = this.runtime;
      const build = await BUILDERS[id]();
      const world = await build({
        renderer: runtime.renderer,
        lite: matchMedia('(max-width: 767px), (pointer: coarse)').matches,
        count: REASONS[id].reasons.length,
      });
      if (generation !== this.generation || this.destroyed) {
        world.dispose();
        return;
      }
      await runtime.show(world);
      runtime.setRead(this.readSet());
    } catch {
      // Something in the drawing failed: the reasons, written down, will do.
      this.drawn.set(false);
      this.runtime?.dispose();
      this.runtime = null;
    } finally {
      if (generation === this.generation) {
        this.building.set(false);
        this.leaving.set(false);
        this.ready.set(true);
      }
    }
  }

  private readSet(): Set<number> {
    const id = this.id();
    return new Set(REASONS[id].reasons.map((_, i) => i).filter((i) => this.reasons.has(id, i)));
  }
}
