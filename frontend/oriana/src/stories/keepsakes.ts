import type { KeepsakeEntry, KeepsakeId, LastLetter } from '../app/core/keepsakes';

/**
 * The treasure hunt: little things hidden around the house, each kept in the
 * locket once found. `hint` is a gentle nudge, `clue` says plainly where to
 * look, and `note` is what she reads once it is found. Change any of the
 * words; the ids are what the house listens for.
 */
export const KEEPSAKES: Record<KeepsakeId, KeepsakeEntry> = {
  // --- In the library ------------------------------------------------------
  seal: {
    name: 'The Broken Seal',
    icon: 'seal',
    place: 'library',
    hint: 'Every adventure starts at the front door.',
    clue: 'Break the wax seal on the very first page.',
    note: 'You opened it! Everything in here was made for you, so take your time and touch everything. Some of it is hiding.',
  },
  letter: {
    name: 'A Note on the Desk',
    icon: 'mail',
    place: 'library',
    hint: 'Someone left something folded on the desk.',
    clue: 'Walk into the library until the letter on the desk unfolds.',
    note: 'I left it there so it would be the first thing you found. I still mean every word.',
  },
  lamp: {
    name: 'The Lamplighter',
    icon: 'lamp',
    place: 'library',
    hint: 'Every library needs someone to look after its light.',
    clue: 'Switch the lamp on the desk off… and then on again.',
    note: 'Even with every light off, I would still find my way to you.',
  },
  inkwell: {
    name: 'A Drop of Ink',
    icon: 'feather',
    place: 'library',
    hint: 'Every story starts with a little ink.',
    clue: 'Touch the inkwell on the desk (or the one on the shelf).',
    note: 'Every word in these books started right there, and every one of them is about you.',
  },
  pile: {
    name: 'The Unwritten Book',
    icon: 'book',
    place: 'library',
    hint: 'Somebody left a couple of books lying around.',
    clue: 'Touch the pile of books on the desk (or the stack lying on the shelf).',
    note: 'Its pages are still empty. We will fill them in together.',
  },
  shelf: {
    name: 'Taken Down',
    icon: 'library',
    place: 'library',
    hint: 'Books like to be held.',
    clue: 'Take one of your volumes down from the shelf.',
    note: 'Your shelf, your stories. There is plenty of room for more.',
  },
  cat: {
    name: 'A Purr',
    icon: 'cat',
    place: 'library',
    hint: 'Someone small and furry would love some attention.',
    clue: 'Pet the library cat (tap her five times in a row).',
    note: 'She says you are her favourite person. She has very good taste.',
  },

  // --- Between the pages ---------------------------------------------------
  flower: {
    name: 'A Pressed Flower',
    icon: 'flower',
    place: 'books',
    hint: 'Someone pressed a flower between the pages of the book.',
    clue: 'About a third of the way through the book, watch the bottom corners of the pages.',
    note: 'Pressed and kept, like every little moment with you.',
  },
  clover: {
    name: 'A Four-Leaf Clover',
    icon: 'clover',
    place: 'books',
    hint: 'A little luck is hiding deeper in the book.',
    clue: 'About two thirds of the way through the book, watch the bottom corners of the pages.',
    note: 'Finding you was the luckiest thing that has ever happened to me.',
  },
  finis: {
    name: 'Finis',
    icon: 'book-open',
    place: 'books',
    hint: 'Every story has an ending.',
    clue: 'Read any volume all the way to its last page.',
    note: 'The end of a book, but nowhere near the end of us. Thank you for reading ♡',
  },
  pages: {
    name: 'The Page Turner',
    icon: 'layers',
    place: 'books',
    hint: 'Keep reading. Then keep reading a little more.',
    clue: 'Turn a hundred pages, in any of the books.',
    note: 'A hundred pages! It makes me so happy that you read them.',
  },

  // --- Beyond the window -------------------------------------------------
  window: {
    name: 'The Open Window',
    icon: 'moon',
    place: 'reasons',
    hint: 'There is a window in the library. Where does it lead?',
    clue: 'Touch the tall window in the library (or the “Reasons I love you” button), and go through it.',
    note: 'Every reason I love you is out there. Take your time with them.',
  },
  meadow: {
    name: 'A Field of Reasons',
    icon: 'flower',
    place: 'reasons',
    hint: 'In the flower field, a heart of roses, and flowers glowing round it.',
    clue: 'Read every reason in the flower field.',
    note: 'Burgundy and sky blue, as far as you can see. Still not as many as there are reasons.',
  },
  skies: {
    name: 'Wishing Stars',
    icon: 'star',
    place: 'reasons',
    hint: 'Above the clouds, some of the stars are close enough to touch.',
    clue: 'Read every reason above the clouds.',
    note: 'I used to wish on stars. Now I just look at you.',
  },
  valley: {
    name: 'The House by the Sea',
    icon: 'sun',
    place: 'reasons',
    hint: 'Balloons are drifting over a farmhouse by the sea.',
    clue: 'Read every reason at the house by the sea.',
    note: 'One day: a little farmhouse on a hill by the sea, and you in it.',
  },

  // --- Secrets -------------------------------------------------------------
  whisper: {
    name: 'Her Name, Whispered',
    icon: 'sparkles',
    place: 'secrets',
    hint: 'The house wakes up for the right name.',
    clue: 'Type “oriana” on your keyboard, or whisper it into the locket.',
    note: 'My favourite word, in any language.',
  },
  namesake: {
    name: 'Same Name',
    icon: 'users',
    place: 'secrets',
    hint: 'Two people, one name.',
    clue: 'Type the name we share, or whisper it into the locket.',
    note: 'Male Nam Anh and Female Nam Anh, just like my sister said.',
  },
  vinglish: {
    name: 'Half & Half',
    icon: 'chat',
    place: 'secrets',
    hint: 'You laughed at the way I talk, half one language and half the other. What did I call it?',
    clue: 'The word is in Chapter Two. Whisper it into the locket.',
    note: 'Mắc cười kiểu nửa English nửa Vietnamese của you ghê ♡',
  },
  konami: {
    name: 'Old Magic',
    icon: 'gamepad',
    place: 'secrets',
    hint: 'An old spell from the arcades. It begins: up, up…',
    clue: '↑ ↑ ↓ ↓ ← → ← → B A on the keyboard, or whisper “up up down down left right left right b a”.',
    note: 'Thirty extra lives, and I would spend every one of them with you.',
  },
  owl: {
    name: 'The Night Owl',
    icon: 'moon',
    place: 'secrets',
    hint: 'The library feels different after midnight.',
    clue: 'Visit between midnight and four in the morning.',
    note: 'Go to sleep! …after one more chapter.',
  },

  // --- For finding everything else ----------------------------------------
  last: {
    name: 'The Last Letter',
    icon: 'heart',
    place: 'last',
    hint: 'Find every other keepsake, and this one opens by itself.',
    clue: 'Find every other keepsake, and this one opens by itself.',
    note: 'You found everything. Of course you did.',
  },
};

/**
 * Opened only once every other keepsake has been found. This one is yours to
 * write; the words below are only keeping its place warm.
 */
export const LAST_LETTER: LastLetter = {
  heading: 'Ori,',
  paragraphs: [
    'If you are reading this, you have found every single thing I hid in here. The seal, the lamp, the flower between the pages, the cat. I hope a few of them made you smile.',
    'I hid them because I wanted this little library to feel like a place you could keep coming back to, and keep finding something new. A bit like how it has been with you, every day since that first message.',
    'Same first name, different surname. Out of all the people in the city, it was you. I am so glad I didn’t keep scrolling.',
    'There are still so many chapters to write. I can’t wait to write them with you.',
  ],
  signature: 'Steve',
};
