import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Bookmark } from '../../../core/bookmarks';
import { labelsFor } from '../../../core/i18n';
import { prefersReducedMotion } from '../../../core/motion';
import { RomanPipe } from '../../../core/roman';
import type { StoryEntry } from '../../../core/story';
import { BookCover } from '../../../ui/book-cover/book-cover';
import { SITE } from '../../../../stories/site';
import type { TakenVolume } from '../bookcase/bookcase';
import type { VolumeDetail } from '../shelf';
import { Spine } from '../spine/spine';

type Phase = 'closed' | 'flying' | 'settled' | 'leaving';

const OPEN_MS = 1500;
const CLOSE_MS = 1150;
const EASE = 'cubic-bezier(0.45, 0.05, 0.2, 1)';

interface Flight {
  tome: Keyframe[];
  spineShade: Keyframe[];
  coverShade: Keyframe[];
  camera: Keyframe[];
}

/**
 * The reading stand. A volume taken down slides out of its place, is carried
 * forward and turned in the hand until its cover faces Oriana; put back, it
 * makes the same journey home. The cover here is the very one the reader
 * opens, so choosing to read lets one become the other.
 */
@Component({
  selector: 'app-volume-viewer',
  imports: [BookCover, RomanPipe, Spine],
  templateUrl: './volume-viewer.html',
  styleUrl: './volume-viewer.scss',
})
export class VolumeViewer {
  readonly marks = input<Partial<Record<string, Bookmark>>>({});
  readonly details = input<Partial<Record<string, VolumeDetail>>>({});
  /** The volume is back in its place on the shelf. */
  readonly returned = output<void>();
  readonly read = output<StoryEntry>();

  protected readonly labels = labelsFor(SITE.lang);
  protected readonly siteLang = SITE.lang;
  protected readonly current = signal<TakenVolume | null>(null);
  protected readonly phase = signal<Phase>('closed');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly tome = viewChild<ElementRef<HTMLElement>>('tome');
  private readonly readButton = viewChild<ElementRef<HTMLButtonElement>>('readButton');
  private readonly injector = inject(Injector);

  open(volume: TakenVolume): void {
    if (this.phase() !== 'closed') return;
    this.current.set(volume);
    this.phase.set('flying');
    this.dialog().nativeElement.showModal();
    afterNextRender({ read: () => void this.carryIn(volume) }, { injector: this.injector });
  }

  async close(): Promise<void> {
    const volume = this.current();
    if (!volume || this.phase() !== 'settled') return;
    this.phase.set('leaving');
    const tome = this.tome()?.nativeElement;
    if (tome && !prefersReducedMotion()) {
      await this.play(tome, reverse(flight(volume.spine, tome)), CLOSE_MS);
    }
    this.dialog().nativeElement.close();
    this.current.set(null);
    this.phase.set('closed');
    this.returned.emit();
  }

  protected readIt(): void {
    const volume = this.current();
    if (volume && this.phase() === 'settled') this.read.emit(volume.story);
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    void this.close();
  }

  /** The cover opens the book; anywhere else but the details puts it back. */
  protected onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.tome')) this.readIt();
    else if (!target.closest('.viewer__details')) void this.close();
  }

  private async carryIn(volume: TakenVolume): Promise<void> {
    const tome = this.tome()?.nativeElement;
    if (tome && !prefersReducedMotion()) await this.play(tome, flight(volume.spine, tome), OPEN_MS);
    if (this.phase() !== 'flying') return;
    this.phase.set('settled');
    this.readButton()?.nativeElement.focus({ preventScroll: true });
  }

  private play(tome: HTMLElement, track: Flight, duration: number): Promise<unknown> {
    const timing: KeyframeAnimationOptions = { duration, easing: EASE, fill: 'both' };
    const stage = tome.parentElement as HTMLElement;
    const [spineShade, coverShade] = tome.querySelectorAll<HTMLElement>('.tome__shade');
    const motions = [
      tome.animate(track.tome, timing),
      stage.animate(track.camera, timing),
      spineShade.animate(track.spineShade, timing),
      coverShade.animate(track.coverShade, timing),
    ];
    return Promise.all(motions.map((motion) => motion.finished)).catch(() => undefined);
  }
}

/**
 * From the spine standing on the shelf to the cover facing the reader. At
 * the start the turned book's spine lies exactly over the shelved one, and
 * the camera looks straight at it, so the hand-off is seamless.
 */
function flight(spine: HTMLElement, tome: HTMLElement): Flight {
  const from = spine.getBoundingClientRect();
  const stage = (tome.parentElement as HTMLElement).getBoundingClientRect();
  const width = tome.offsetWidth;
  const height = tome.offsetHeight;
  const centreX = stage.left + stage.width / 2;
  const centreY = stage.top + stage.height / 2;

  const scale = from.height / height;
  const dx = from.left + from.width / 2 - centreX;
  const dy = from.top + from.height / 2 - centreY;
  const lift = from.height * 0.14;
  const at = (
    x: number,
    y: number,
    z: number,
    s: number,
    back: number,
    turn: number,
    tilt: number,
  ) =>
    `translate3d(${x}px, ${y}px, ${z}px) scale3d(${s}, ${s}, ${s}) ` +
    `translateZ(${back}px) rotateY(${turn}deg) rotateZ(${tilt}deg)`;

  return {
    tome: [
      { offset: 0, transform: at(dx, dy, 0, scale, -width / 2, 90, 0) },
      { offset: 0.2, transform: at(dx, dy - lift, 80, scale * 1.04, -width / 2, 90, 0) },
      {
        offset: 0.6,
        transform: at(dx * 0.4, dy * 0.4 - 30, 130, (scale + 1) / 2, -width / 4, 46, -3),
      },
      { offset: 1, transform: at(0, 0, 0, 1, 0, 0, 0) },
    ],
    camera: [
      {
        offset: 0,
        perspectiveOrigin: `${from.left + from.width / 2 - stage.left}px ${from.top + from.height / 2 - stage.top}px`,
      },
      { offset: 1, perspectiveOrigin: `${stage.width / 2}px ${stage.height / 2}px` },
    ],
    spineShade: [
      { offset: 0, opacity: 0 },
      { offset: 0.2, opacity: 0 },
      { offset: 1, opacity: 0.7 },
    ],
    coverShade: [
      { offset: 0, opacity: 0.8 },
      { offset: 0.2, opacity: 0.8 },
      { offset: 1, opacity: 0 },
    ],
  };
}

function reverse(track: Flight): Flight {
  const back = (frames: Keyframe[]) =>
    frames.map((frame) => ({ ...frame, offset: 1 - Number(frame.offset) })).reverse();
  return {
    tome: back(track.tome),
    camera: back(track.camera),
    spineShade: back(track.spineShade),
    coverShade: back(track.coverShade),
  };
}
