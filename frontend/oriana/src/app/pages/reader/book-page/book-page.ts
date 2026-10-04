import { Component, computed, inject, input } from '@angular/core';
import { RomanPipe } from '../../../core/roman';
import { WaxSeal } from '../../../ui/wax-seal/wax-seal';
import { SITE } from '../../../../stories/site';
import { BookPageRef, PageSide } from '../book-model';
import { ReaderContext } from '../reader-context';

/**
 * One printed page. Flowed sections show a single column of the section's
 * text; front and back matter are set by hand like a title page would be.
 */
@Component({
  selector: 'app-book-page',
  imports: [RomanPipe, WaxSeal],
  templateUrl: './book-page.html',
  styleUrl: './book-page.scss',
  host: {
    '[attr.data-side]': 'side()',
    '[attr.data-kind]': 'page().kind',
  },
})
export class BookPage {
  readonly page = input.required<BookPageRef>();
  readonly side = input<PageSide>('recto');

  protected readonly ctx = inject(ReaderContext);
  protected readonly site = SITE;
  protected readonly section = computed(() => this.ctx.sections()[this.page().section] ?? null);
  protected readonly offset = computed(() => {
    const { flowW, gap } = this.ctx.layout();
    return `translateX(${-this.page().column * (flowW + gap)}px)`;
  });
}
