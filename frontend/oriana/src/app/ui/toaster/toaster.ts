import { Component, inject } from '@angular/core';
import { labelsFor } from '../../core/i18n';
import { Toast, Toasts } from '../../core/toasts';
import { SITE } from '../../../stories/site';
import { Icon } from '../icon';

/** Where the little notes from core/toasts appear: the foot of the page, out of the way. */
@Component({
  selector: 'app-toaster',
  imports: [Icon],
  template: `
    @for (toast of toasts.list(); track toast.id) {
      <div class="toast" role="status" [class.is-leaving]="toast.leaving">
        <span class="toast__seal" aria-hidden="true"><app-icon [name]="toast.icon" /></span>
        <div class="toast__words">
          <p class="toast__overline">{{ toast.overline }}</p>
          <p class="toast__title">{{ toast.title }}</p>
          @if (toast.detail) {
            <p class="toast__detail">{{ toast.detail }}</p>
          }
          @if (toast.action; as action) {
            <button type="button" class="toast__action" (click)="run(toast, action.run)">
              {{ action.label }} <span aria-hidden="true">›</span>
            </button>
          }
        </div>
        <button
          type="button"
          class="toast__close"
          [attr.aria-label]="close"
          (click)="toasts.dismiss(toast.id)"
        >
          <app-icon name="x" />
        </button>
      </div>
    }
  `,
  styleUrl: './toaster.scss',
})
export class Toaster {
  protected readonly toasts = inject(Toasts);
  protected readonly close = labelsFor(SITE.lang).close;

  protected run(toast: Toast, action: () => void): void {
    this.toasts.dismiss(toast.id);
    action();
  }
}
