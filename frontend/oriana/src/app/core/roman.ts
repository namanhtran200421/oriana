import { Pipe, PipeTransform } from '@angular/core';

const NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(value: number): string {
  let rest = Math.floor(value);
  if (rest <= 0 || rest >= 4000) return String(value);
  let out = '';
  for (const [amount, numeral] of NUMERALS) {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  }
  return out;
}

@Pipe({ name: 'roman' })
export class RomanPipe implements PipeTransform {
  transform(value: number): string {
    return toRoman(value);
  }
}
