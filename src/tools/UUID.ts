/*
  based on an answer provided by Jeff Ward on StackOverflow; November 2019
  https://stackoverflow.com/users/1026023/jeff-ward
  https://stackoverflow.com/questions/105034/how-to-create-guid-uuid?rq=1
*/

import { generateRange } from './arrays';

/**
 * generate a given number of UUIDs
 *
 * @param {number} count - number of UUIDs to generate
 */
export function UUIDS(count = 1, pre?, random?: () => number) {
  return generateRange(0, count).map(() => UUID(pre, random));
}

export function UUID(pre?, random?: () => number) {
  const rng = random ?? Math.random;
  const lut: string[] = [];

  for (let i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? '0' : '') + i.toString(16);
  }


  const d0 = Math.trunc(rng() * 0xffffffff);

  const d1 = Math.trunc(rng() * 0xffffffff);

  const d2 = Math.trunc(rng() * 0xffffffff);

  const d3 = Math.trunc(rng() * 0xffffffff);

  const uuid =
    lut[d0 & 0xff] +
    lut[(d0 >> 8) & 0xff] +
    lut[(d0 >> 16) & 0xff] +
    lut[(d0 >> 24) & 0xff] +
    '-' +
    lut[d1 & 0xff] +
    lut[(d1 >> 8) & 0xff] +
    '-' +
    lut[((d1 >> 16) & 0x0f) | 0x40] +
    lut[(d1 >> 24) & 0xff] +
    '-' +
    lut[(d2 & 0x3f) | 0x80] +
    lut[(d2 >> 8) & 0xff] +
    '-' +
    lut[(d2 >> 16) & 0xff] +
    lut[(d2 >> 24) & 0xff] +
    lut[d3 & 0xff] +
    lut[(d3 >> 8) & 0xff] +
    lut[(d3 >> 16) & 0xff] +
    lut[(d3 >> 24) & 0xff];

  return typeof pre === 'string' ? `${pre}_${uuid.replaceAll('-', '')}` : uuid;
}
