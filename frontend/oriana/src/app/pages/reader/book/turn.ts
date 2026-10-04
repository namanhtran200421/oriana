import type { BookMode } from '../layout';

/**
 * Keyframes for one page turn, sampled from a continuous model so any slice of
 * it (a drag let go half-way, say) can be played on its own.
 *
 * Progress p runs 0 → 1 in the direction of the turn. In a spread the leaf
 * rotates a full 180° about the spine; on a single page it lifts away to the
 * left and fades, like a page of a notebook bound on its left edge.
 */

export interface TurnTracks {
  leaf: Keyframe[];
  front: Keyframe[];
  back: Keyframe[];
  frontShade: Keyframe[];
  backShade: Keyframe[];
  castLeft: Keyframe[];
  castRight: Keyframe[];
}

interface Frame {
  angle: number;
  opacity: number;
  shade: number;
  castLeft: number;
  castLeftScale: number;
  castRight: number;
  castRightScale: number;
}

const SAMPLES = 12;

export function frameAt(mode: BookMode, dir: 1 | -1, p: number): Frame {
  if (mode === 'spread') {
    // The page lifting off casts a shadow that narrows as the leaf stands up;
    // the page it lands on darkens as the leaf comes down over it.
    const rising = p < 0.5 ? Math.sin(Math.PI * p * 2) : 0;
    const landing = p > 0.5 ? Math.sin(Math.PI * (p - 0.5) * 2) : 0;
    const uncovered = { cast: 0.55 * rising, scale: 1 - 0.65 * Math.min(1, p * 2) };
    const covered = { cast: 0.5 * landing, scale: 0.35 + 0.65 * Math.max(0, p * 2 - 1) };
    const [left, right] = dir > 0 ? [covered, uncovered] : [uncovered, covered];
    return {
      angle: dir > 0 ? -180 * p : 180 * p,
      opacity: 1,
      shade: 0.5 * Math.sin(Math.PI * p),
      castLeft: left.cast,
      castLeftScale: left.scale,
      castRight: right.cast,
      castRightScale: right.scale,
    };
  }

  const lifted = dir > 0 ? p : 1 - p; // 0 = lying on the book, 1 = gone
  return {
    angle: -112 * lifted,
    opacity: lifted < 0.6 ? 1 : Math.max(0, 1 - (lifted - 0.6) / 0.3),
    shade: 0.45 * lifted,
    castLeft: 0,
    castLeftScale: 1,
    castRight: 0.42 * Math.sin(Math.PI * Math.min(1, lifted * 1.15)),
    castRightScale: 1 - 0.4 * lifted,
  };
}

export function turnTracks(mode: BookMode, dir: 1 | -1, from: number, to: number): TurnTracks {
  const tracks: TurnTracks = {
    leaf: [],
    front: [],
    back: [],
    frontShade: [],
    backShade: [],
    castLeft: [],
    castRight: [],
  };
  for (let i = 0; i <= SAMPLES; i++) {
    const offset = i / SAMPLES;
    const f = frameAt(mode, dir, from + (to - from) * offset);
    tracks.leaf.push({ offset, transform: `rotateY(${f.angle.toFixed(3)}deg)` });
    tracks.front.push({ offset, opacity: f.opacity });
    tracks.back.push({ offset, opacity: f.opacity });
    tracks.frontShade.push({ offset, opacity: f.shade });
    tracks.backShade.push({ offset, opacity: f.shade });
    tracks.castLeft.push({
      offset,
      opacity: f.castLeft,
      transform: `scaleX(${f.castLeftScale.toFixed(3)})`,
    });
    tracks.castRight.push({
      offset,
      opacity: f.castRight,
      transform: `scaleX(${f.castRightScale.toFixed(3)})`,
    });
  }
  return tracks;
}
