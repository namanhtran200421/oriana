import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

interface Pixel {
  x: number;
  y: number;
  fill: string;
}

/**
 * A wax seal in big pixels, sixteen across: a round blob with a drip or two,
 * lit from the top left, a ring pressed into it. Worked out once; the same
 * on the server as in the browser.
 */
function waxPixels(): Pixel[] {
  const pixels: Pixel[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const angle = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy) - Math.sin(angle * 5 + 1.3) * 0.35;
      if (d > 7.4) continue;
      let fill = '#a3203a';
      if (d > 6.4) fill = '#6e1424';
      else if (d > 4.4 && d < 5.4) fill = '#7a1730';
      else if (dx + dy < -5 && d < 6.4) fill = '#c23a52';
      if (dx > 3 && dy > 3 && d > 5.4 && d <= 6.4) fill = '#86182e';
      pixels.push({ x, y, fill });
    }
  }
  return pixels;
}

/** A small heart for a seal without a letter. */
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const HEART_PIXELS: Pixel[] = HEART.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (ch === '#' ? [{ x: x + 4.5, y: y + 5, fill: '#5c1020' }] : [])),
);

const PIXELS = waxPixels();

/** A crimson wax seal, in pixels, pressed with a monogram (or a heart), that can be broken. */
@Component({
  selector: 'app-wax-seal',
  imports: [NgTemplateOutlet],
  templateUrl: './wax-seal.html',
  styleUrl: './wax-seal.scss',
  host: {
    'aria-hidden': 'true',
    '[style.--seal-size]': "typeof size() === 'number' ? size() + 'px' : size()",
    '[class.is-broken]': 'broken()',
  },
})
export class WaxSeal {
  /** Pixels, or any CSS length (e.g. a clamp() that follows the viewport). */
  readonly size = input<number | string>(96);
  /** Letter pressed into the wax. Without one, the seal carries a star. */
  readonly monogram = input<string | null>(null);
  /** Cracks the seal in two and lets the halves fall away. */
  readonly broken = input(false);

  protected readonly pixels = PIXELS;
  protected readonly heart = HEART_PIXELS;
}
