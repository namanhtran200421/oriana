import { RenderMode, ServerRoute } from '@angular/ssr';
import { LIBRARY } from '../stories/library';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'read/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => LIBRARY.map(({ slug }) => ({ slug })),
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
