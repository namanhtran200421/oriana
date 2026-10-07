import type { WorldId, WorldWords } from '../app/core/reasons';

/**
 * Reasons I love you, found beyond the library window, in three places.
 * Write as many reasons in each as you like (a handful to a dozen suits each
 * place best); every one becomes something she can touch to read.
 *
 * The words below are only keeping their places warm: these are yours to write.
 */
export const REASONS: Record<WorldId, WorldWords> = {
  meadow: {
    name: 'The Flower Field',
    line: 'Burgundy and sky blue, as far as the eye can see.',
    hint: 'Touch a glowing flower',
    reasons: [
      'The way you laugh at my Vinglish, even when I am trying to be serious.',
      'You almost messaged me first. I think about that more than I should.',
      'Talking with you has never once felt like work. Every answer leaves something for me to pick up.',
      'You put people at ease, even someone you had only known for a few hours.',
      'Your kindness is quiet, and once I noticed it, I saw it everywhere.',
      'You make ordinary days feel like the first page of something.',
      'The way you say my name. Our name.',
    ],
  },
  skies: {
    name: 'Above the Clouds',
    line: 'Nearer the stars than we have ever been.',
    hint: 'Touch a wishing star',
    reasons: [
      'Out of every name in the city, I found yours.',
      'You found a piece of me I had long forgotten existed, and held it as if it had always been yours.',
      'With you, I am curious about tomorrow again.',
      'You make me want to be braver than I am.',
      'You are the first person I want to tell everything to.',
      'When I look up at the night, I think about how lucky I am.',
      'You make the screen between us feel a little less far away.',
    ],
  },
  valley: {
    name: 'The House by the Sea',
    line: 'A farmhouse on the hill, the sea at our feet. One day.',
    hint: 'Touch a balloon',
    reasons: [
      'I can see a whole life with you, and I love every part of it.',
      'You feel like home, wherever we are.',
      'I want to grow old reading these with you.',
      'You make the quiet moments my favourite ones.',
      'You believe in me, even on the days I do not.',
      'I love who we are together.',
      'Because you are you. That is the whole reason, really.',
    ],
  },
};
