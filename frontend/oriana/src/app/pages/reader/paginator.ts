import { Injectable } from '@angular/core';
import { BookLayout, layoutVars } from './layout';

const FONT_TIMEOUT = 2500;

/**
 * Counts how many pages each flowed section needs by letting the browser lay
 * it out in CSS columns, one page-sized column per page, inside a hidden host.
 */
@Injectable()
export class Paginator {
  async measure(
    host: HTMLElement,
    layout: BookLayout,
    sources: readonly (string | null)[],
  ): Promise<number[]> {
    for (const [name, value] of Object.entries(layoutVars(layout))) {
      host.style.setProperty(name, value);
    }
    host.replaceChildren();

    const flows = sources.map((source) => {
      if (source === null) return null;
      const flow = document.createElement('div');
      flow.className = 'flow';
      // Sources come from the manuscript parser, which escapes all text.
      flow.innerHTML = `${source}<div class="flow-end"></div>`;
      host.append(flow);
      return flow;
    });

    // Lay out now so every face in use starts downloading, then wait for them:
    // a late italic or Vietnamese subset would shift every line after it.
    void host.offsetHeight;
    await settleFonts();

    const step = layout.flowW + layout.gap;
    const counts = flows.map((flow) => {
      if (!flow) return 1;
      const end = flow.lastElementChild as HTMLElement;
      const offset = end.getBoundingClientRect().left - flow.getBoundingClientRect().left;
      return Math.max(1, Math.round(offset / step) + 1);
    });

    host.replaceChildren();
    return counts;
  }
}

function settleFonts(): Promise<unknown> {
  if (!document.fonts?.ready) return Promise.resolve();
  return Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
  ]);
}
