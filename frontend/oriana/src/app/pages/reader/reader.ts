import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { Location, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Bookmarks } from '../../core/bookmarks';
import { Manuscript, parseManuscript } from '../../core/manuscript';
import { RomanPipe } from '../../core/roman';
import type { StoryEntry } from '../../core/story';
import { Icon } from '../../ui/icon';
import { MusicToggle } from '../../ui/music-toggle';
import { Book } from './book/book';
import {
  BookSection,
  assemblePages,
  buildSections,
  pageOfPosition,
  pagesOn,
  positionOf,
  spreadOfPage,
  withContents,
} from './book-model';
import { BookLayout, computeLayout, layoutVars, sameFlow } from './layout';
import { Paginator } from './paginator';
import { ReaderContext } from './reader-context';

interface ContentsEntry {
  section: number;
  numeral: string;
  title: string;
  folio: number | null;
  current: boolean;
}

@Component({
  selector: 'app-reader',
  imports: [Book, Icon, MusicToggle, RomanPipe],
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  providers: [ReaderContext, Paginator],
  host: {
    '[attr.lang]': 'story().lang',
    '[style]': 'cssVars()',
    '[class.is-open]': 'ctx.spread() > 0',
    '(window:resize)': 'onResize()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class Reader {
  /** Resolved from the route by `storyResolver`. */
  readonly story = input.required<StoryEntry>();

  protected readonly ctx = inject(ReaderContext);
  protected readonly labels = this.ctx.labels;

  private readonly paginator = inject(Paginator);
  private readonly bookmarks = inject(Bookmarks);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly book = viewChild.required(Book);
  private readonly measurer = viewChild.required<ElementRef<HTMLElement>>('measurer');
  private readonly contents = viewChild.required<ElementRef<HTMLDialogElement>>('contents');

  protected readonly cssVars = computed(() => layoutVars(this.ctx.layout()));
  protected readonly anchor = computed(() =>
    this.ctx.ready() ? this.ctx.anchorAt(this.ctx.spread()) : null,
  );

  protected readonly status = computed(() => {
    const labels = this.labels();
    if (!this.ctx.ready()) return labels.preparing;
    if (this.ctx.spread() === 0) return labels.openHint;
    const anchor = this.anchor();
    return anchor ? this.describe(anchor.section) : '';
  });

  protected readonly folio = computed(() => {
    const folio = this.anchor()?.folio;
    return folio ? `${folio} / ${this.ctx.totalFolios()}` : '';
  });

  /** Where each chapter begins along the progress rail. */
  protected readonly ticks = computed(() => {
    const last = this.ctx.lastSpread();
    if (last <= 1) return [];
    return this.ctx
      .pages()
      .filter((page) => page.kind === 'chapter' && page.opener)
      .map((page) => (spreadOfPage(this.ctx.mode(), page.index) - 1) / (last - 1));
  });

  protected readonly entries = computed<ContentsEntry[]>(() => {
    const sections = this.ctx.sections();
    const pages = this.ctx.pages();
    const current = this.anchor()?.section ?? -1;
    const entries: ContentsEntry[] = [
      {
        section: sections.findIndex((s) => s.kind === 'title'),
        numeral: '❦',
        title: this.labels().fromBeginning,
        folio: null,
        current: false,
      },
    ];
    sections.forEach((section, index) => {
      if (section.kind !== 'chapter') return;
      entries.push({
        section: index,
        numeral: section.numeral ?? '❦',
        title: section.title || this.labels().chapter,
        folio: pages.find((page) => page.section === index)?.folio ?? null,
        current: index === current,
      });
    });
    return entries;
  });

  /** The whole current section, for screen readers; the visual pages are aria-hidden. */
  protected readonly readable = computed<SafeHtml | string>(() => {
    const anchor = this.anchor();
    return (anchor && this.ctx.sections()[anchor.section]?.html) || '';
  });

  protected readonly announcement = computed(() => {
    const folio = this.anchor()?.folio;
    const status = this.status();
    return folio ? `${status}. ${this.labels().pageOf(folio, this.ctx.totalFolios())}` : status;
  });

  private manuscript: Manuscript | null = null;
  private readonly safeHtml = new Map<string, SafeHtml>();
  private generation = 0;
  private leaving = false;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  /** Captured on arrival, so "back" can return to the exact place on the shelf. */
  private readonly cameFromLibrary =
    this.router.currentNavigation()?.previousNavigation?.finalUrl?.toString() === '/library';

  constructor() {
    this.ctx.story = this.story;
    if (this.browser) this.ctx.layout.set(computeLayout(innerWidth, innerHeight));

    afterNextRender(() => void this.prepare());

    effect(() => {
      const spread = this.ctx.spread();
      const anchor = this.anchor();
      if (!anchor || spread === 0) return;
      const pages = this.ctx.pages();
      const position = positionOf(pages, anchor.index);
      if (!position) return;
      const finished = pagesOn(this.ctx.mode(), spread).some((i) => pages[i]?.kind === 'finis');
      const label = this.describe(anchor.section);
      untracked(() =>
        this.bookmarks.set(this.story().slug, { ...position, label, finished }),
      );
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.resizeTimer));
  }

  protected async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    const dialog = this.contents().nativeElement;
    if (dialog.open) dialog.close();
    await this.book().close();
    if (this.cameFromLibrary) this.location.back();
    else await this.router.navigateByUrl('/library');
  }

  protected openContents(): void {
    this.contents().nativeElement.showModal();
  }

  protected jump(section: number): void {
    this.contents().nativeElement.close();
    this.book().goToSection(section);
  }

  protected onDialogClick(event: MouseEvent): void {
    // A click on the backdrop lands on the <dialog> itself.
    if (event.target === this.contents().nativeElement) this.contents().nativeElement.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (this.contents().nativeElement.open) return;
    const onControl = !!(event.target as HTMLElement | null)?.closest?.(
      'button, a, input, textarea, select, [contenteditable]',
    );
    const book = this.book();

    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        book.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        book.prev();
        break;
      case ' ':
        if (onControl) return;
        if (event.shiftKey) book.prev();
        else book.next();
        break;
      case 'Home':
        book.goTo(1);
        break;
      case 'End':
        book.goTo(this.ctx.lastSpread());
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected onResize(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const next = computeLayout(innerWidth, innerHeight);
      if (this.manuscript && !sameFlow(next, this.ctx.layout())) void this.paginate(next);
      else this.ctx.layout.set(next);
    }, 160);
  }

  private async prepare(): Promise<void> {
    const story = this.story();
    this.manuscript = parseManuscript(await story.load());
    await this.paginate(this.ctx.layout());

    const mark = this.bookmarks.get(story.slug);
    if (mark && !mark.finished) {
      const page = pageOfPosition(this.ctx.pages(), mark);
      this.ctx.openTo.set(spreadOfPage(this.ctx.mode(), page));
    }
  }

  /**
   * Measures the manuscript for a layout and swaps the new pages in at once,
   * keeping the reader on the same passage. Contents folios depend on where the
   * chapters fall, so the contents page is measured a second time.
   */
  private async paginate(layout: BookLayout): Promise<void> {
    if (!this.manuscript) return;
    const generation = ++this.generation;
    const story = this.story();
    const labels = this.labels();
    const host = this.measurer().nativeElement;

    let drafts = buildSections(story, this.manuscript, labels);
    const tocIndex = drafts.findIndex((draft) => draft.kind === 'contents');
    const counts = await this.paginator.measure(
      host,
      layout,
      drafts.map((draft) => (draft.flow ? draft.source : null)),
    );
    if (generation !== this.generation) return;

    let pages = assemblePages(drafts, counts, layout.mode, story.title);
    drafts = withContents(drafts, pages, labels);
    const [tocCount] = await this.paginator.measure(host, layout, [drafts[tocIndex].source]);
    if (generation !== this.generation) return;
    if (tocCount !== counts[tocIndex]) {
      counts[tocIndex] = tocCount;
      pages = assemblePages(drafts, counts, layout.mode, story.title);
      drafts = withContents(drafts, pages, labels);
    }

    const position =
      this.ctx.ready() && this.ctx.spread() > 0
        ? positionOf(this.ctx.pages(), this.ctx.anchorAt(this.ctx.spread())?.index ?? 0)
        : null;

    this.book().settle();
    const sections: BookSection[] = drafts.map((draft) => ({
      ...draft,
      html: draft.source === null ? null : this.trust(draft.source),
    }));
    this.ctx.layout.set(layout);
    this.ctx.sections.set(sections);
    this.ctx.pages.set(pages);
    if (position) {
      this.ctx.spread.set(spreadOfPage(layout.mode, pageOfPosition(pages, position)));
    }
  }

  /** Stable SafeHtml per source, so unchanged chapters are never re-parsed. */
  private trust(source: string): SafeHtml {
    let html = this.safeHtml.get(source);
    if (!html) {
      // Generated by the manuscript parser, which escapes every character of text.
      html = this.sanitizer.bypassSecurityTrustHtml(source);
      this.safeHtml.set(source, html);
    }
    return html;
  }

  private describe(sectionIndex: number): string {
    const section = this.ctx.sections()[sectionIndex];
    if (!section) return '';
    if (!section.label) return section.title;
    return section.title ? `${section.label} · ${section.title}` : section.label;
  }
}
