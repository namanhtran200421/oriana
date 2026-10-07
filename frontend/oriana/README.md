# The Library of Oriana

A small library of stories in a blocky little world: break the wax seal on the
title screen, walk through a cosy library built of blocks, take her book down
from its nook in the shelves, and turn its pages by hand. Everything is pixels,
from the font to the icons to the lanterns, and every texture and model is
drawn in code for this house alone.

```bash
npm start          # http://localhost:4200
npm test           # unit tests (Vitest)
npm run build      # static site in dist/oriana/browser
```

## Writing a story

Everything you write lives in [`src/stories/`](src/stories/).

1. Create a Markdown file, e.g. `src/stories/the-orchard.md`.
2. Add an entry for it to [`library.ts`](src/stories/library.ts). The order of
   the list is the order on the shelf ("Volume I", "Volume II"…).

```ts
{
  slug: 'the-orchard',               // the URL: /read/the-orchard
  title: 'The Orchard',
  subtitle: 'A spring story',        // optional
  author: 'Nam Anh',
  lang: 'en',                        // 'en' or 'vi': labels & fonts follow it
  year: 2026,
  binding: 'oak',                    // 'crimson' | 'mahogany' | 'oak'
  blurb: 'One or two sentences for the shelf.',
  epigraph: { text: 'A line printed alone before the contents.' }, // optional
  closing: 'Printed beneath "Finis".', // optional
  featured: true,                    // optional: wax seal on the shelf
  cover: 'covers/orchard.jpg',       // optional: image in public/, shown sepia & arch-topped
  load: () => import('./the-orchard.md').then((m) => m.default),
},
```

### The manuscript format

```md
# Prologue {-}               ← a chapter without a number
# The Reading Room           ← Chapter I, II, III… are numbered for you

Paragraphs are separated by a blank line. *Italics* or _italics_,
**bold** if you must. "Quotes", -- dashes and ... are typeset properly.

> Letters and verse go in quote blocks.
> Every line break is kept.

* * *                        ← a scene break (❦)

![A caption](plates/window.jpg)   ← an arch-topped plate; put the file in public/plates/

## A small heading
```

Pages, page numbers, the contents page and running heads are all worked out
from the text, for whatever screen it is read on. Readers' places are
remembered per story in their browser.

## Making it yours

[`site.ts`](src/stories/site.ts) holds the title, the one-line tagline, the
monogram on the wax seal, the little note in the library, the music, and the
name of the library cat. Set `lang: 'vi'` there to show the threshold and
library in Vietnamese. Two optional touches live there too: `metOn` (the day
it all began; the locket counts the days since) and `celebrations` (days like
Valentine's that bring a note and falling hearts when she visits).

## The treasure hunt

Keepsakes are hidden all over the house: the wax seal, the lantern on the desk
(put it out, then light it again), the inkwell, the pile of books, a pressed flower
and a four-leaf clover between the pages of the book, a hundred pages
turned, secret words typed anywhere ("oriana"), the arcade code, a visit after
midnight, the open window and each place beyond it. Each is kept in **the locket**
(the heart button at the top) with a note; tap one not yet found for a hint,
or tap the cat for one. Finding them all opens **the last letter**.

- [`keepsakes.ts`](src/stories/keepsakes.ts): every keepsake's name, hints and
  note, and the last letter. Change the words freely; the ids are what the
  house listens for.
- A story's `treasures: ['flower', 'clover']` in [`library.ts`](src/stories/library.ts)
  hides those keepsakes evenly through its pages (a third and two thirds in).
- The locket's settings can forget every find, to hunt again from the start.

## Reasons I love you

The tall window in the library opens (touch it, or the heart in the
masthead): the casements swing out and the camera flies through, into three
places drawn in three dimensions, each with its own reasons to touch:

- **The Flower Field**: a heart of burgundy roses in a pink hedge, set in a
  sea of sky-blue cornflowers at sunset, with a rose arch, a swing, a picnic,
  fairy lights, butterflies and bees; each reason is a giant glowing flower
  round the heart's edge.
- **Above the Clouds**: floating islands with cherry trees and lanterns over a
  sea of block clouds, under a square moon; each reason is a little wishing
  star with a face, and those she has read are joined into a constellation.
- **The House by the Sea**: one farmhouse on a headland at sunset, sheep and
  cows in its pasture, wheat in the field, smoke from the chimney; below it a
  beach, a dock with a lantern, a fire on the sand, gulls, and waves rolling in
  with foam; each reason is a hot-air balloon of wool.

Each place has its own sound, made as it plays: a breeze with birdsong in the
flower field, crickets above the clouds, the sea and its gulls by the house.
It plays under the music, and only while sounds are switched on.

[`reasons.ts`](src/stories/reasons.ts) holds every place's name and its
reasons: add, change or remove them freely, and the places make room. Reading
every reason in a place is a keepsake. Where the places cannot be drawn (no
WebGL 2, or reduced motion), the reasons are simply written down.

## Reading

Besides turning pages by click, swipe, drag, wheel or arrow keys, the **Aa**
button sets the type larger or smaller (or press <kbd>+</kbd> / <kbd>−</kbd>)
and turns on candlelight pages for reading in the dark. Visits, pages turned,
stories finished and reasons read are kept in the locket's journal.

## How it is built

- **Design tokens** (colour, type, motion) are CSS custom properties in
  [`src/styles/_tokens.scss`](src/styles/_tokens.scss); shared ornaments, buttons
  and book typography live beside them as global partials.
- **Pagination** uses CSS multi-column layout: a chapter is laid out as a row of
  page-sized columns, and each page shows one column
  ([`paginator.ts`](src/app/pages/reader/paginator.ts),
  [`_prose.scss`](src/styles/_prose.scss)).
- **Page turns** are Web Animations on a single two-sided leaf, sampled from a
  continuous model so a drag can be let go at any point
  ([`book.ts`](src/app/pages/reader/book/book.ts),
  [`turn.ts`](src/app/pages/reader/book/turn.ts)).
- **The blocky worlds** are built on a small voxel engine in
  [`src/app/voxel`](src/app/voxel): sixteen-pixel block textures painted in code
  ([`blocks.ts`](src/app/voxel/blocks.ts)); volumes of blocks lit by sky and
  lantern light spreading a step dimmer each block, meshed with only their
  visible faces and their corners darkened where blocks crowd
  ([`volume.ts`](src/app/voxel/volume.ts)); small models built cell by cell
  ([`micro.ts`](src/app/voxel/micro.ts), [`models.ts`](src/app/voxel/models.ts));
  square suns, moons and stars, block clouds, an open sea, pixel particles.
- **The places beyond the window** share one renderer
  ([`runtime.ts`](src/app/pages/reasons/world/runtime.ts)); each place is its
  own lazily loaded bundle, fetched only when it is travelled to. The library
  room is built the same way ([`engine.ts`](src/app/pages/library/stage/engine.ts)),
  and so is the little world turning behind the title screen.
- **Ambient sound** for each place is synthesised as it plays
  ([`ambience.ts`](src/app/core/ambience.ts)).
- **Little sounds** are synthesised with the Web Audio API rather than loaded
  ([`sfx.ts`](src/app/core/sfx.ts)); sparkles and falling hearts are drawn
  outside Angular ([`delight.ts`](src/app/core/delight.ts)). Both follow the
  locket's settings, and the motion is skipped for reduced-motion visitors.
- **Remembered things** (bookmarks, keepsakes, the journal, settings) live in
  `localStorage` and are read in after hydration, so the server's page and the
  browser's first render always agree ([`storage.ts`](src/app/core/storage.ts)).
- **Route changes** use the View Transitions API; a volume's cover on the shelf
  morphs into the book on the desk.
- Every route is prerendered, so `dist/oriana/browser` can be hosted on any
  static host (Netlify, Vercel, GitHub Pages, Firebase Hosting).
