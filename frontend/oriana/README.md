# The Library of Oriana

A small library of stories, read like a real book: break the wax seal, choose a
volume from the shelf, open its leather cover and turn the pages by hand.

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
monogram on the wax seal, the little note in the library, and the music. Set
`lang: 'vi'` there to show the threshold and library in Vietnamese.

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
- **Route changes** use the View Transitions API; a volume's cover on the shelf
  morphs into the book on the desk.
- Every route is prerendered, so `dist/oriana/browser` can be hosted on any
  static host (Netlify, Vercel, GitHub Pages, Firebase Hosting).
