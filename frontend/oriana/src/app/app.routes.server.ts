import { RenderMode, ServerRoute } from '@angular/ssr';
import { WORLD_IDS } from './core/reasons';
import { LIBRARY } from '../stories/library';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'read/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => LIBRARY.map(({ slug }) => ({ slug })),
  },
  {
    path: 'reasons/:world',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => WORLD_IDS.map((world) => ({ world })),
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
