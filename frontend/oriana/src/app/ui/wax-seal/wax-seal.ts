import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

let nextId = 0;

/**
 * An irregular wax edge: a circle nudged by a few layered sine waves, smoothed
 * through Catmull-Rom splines. Deterministic, so server and browser agree.
 */
function waxOutline(points = 24, radius = 55, centre = 60): string {
  const at = (i: number): [number, number] => {
    const angle = (i / points) * Math.PI * 2;
    const r =
      radius +
      Math.sin(angle * 3 + 0.6) * 1.7 +
      Math.sin(angle * 7 + 2.1) * 1.1 +
      Math.sin(angle * 11 + 4.4) * 0.7;
    return [centre + Math.cos(angle) * r, centre + Math.sin(angle) * r];
  };
  const pts = Array.from({ length: points }, (_, i) => at(i));
  const p = (i: number) => pts[(i + points) % points];
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < points; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

const OUTLINE = waxOutline();

/** A crimson wax seal pressed with a monogram (or a star), that can be broken. */
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

  protected readonly id = `wax-${nextId++}`;
  protected readonly outline = OUTLINE;
  protected readonly star =
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
}
