import { inject } from '@angular/core';
import { RedirectCommand, ResolveFn, Router, Routes } from '@angular/router';
import { labelsFor } from './core/i18n';
import type { StoryEntry } from './core/story';
import { Library } from './pages/library/library';
import { Reader } from './pages/reader/reader';
import { Threshold } from './pages/threshold/threshold';
import { findStory } from '../stories/library';
import { SITE } from '../stories/site';

const storyResolver: ResolveFn<StoryEntry> = (route) =>
  findStory(route.paramMap.get('slug')) ??
  new RedirectCommand(inject(Router).parseUrl('/library'));

const storyTitle: ResolveFn<string> = (route) => {
  const story = findStory(route.paramMap.get('slug'));
  return story ? `${story.title} · ${SITE.title}` : SITE.title;
};

export const routes: Routes = [
  { path: '', component: Threshold, title: SITE.title },
  {
    path: 'library',
    component: Library,
    title: `${labelsFor(SITE.lang).yourStories} · ${SITE.title}`,
  },
  {
    path: 'read/:slug',
    component: Reader,
    resolve: { story: storyResolver },
    title: storyTitle,
  },
  { path: '**', redirectTo: '' },
];
