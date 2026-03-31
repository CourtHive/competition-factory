import { numericSort } from './sorting';
import { ensureInt } from './ensureInt';
import { isString } from './objects';

export function isPowerOf2(n?) {
  if (Number.isNaN(Number(n))) return false;
  return n > 0 && (n & (n - 1)) === 0;
}

export function median(arr: number[]): number | undefined {
  if (!arr.length) return undefined;
  const s = [...arr].sort(numericSort);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function deriveExponent(n) {
  if (n === 1) return false; // Special case - infinite loop avoided
  if (Number.isNaN(Number(n))) return false;
  if (!isPowerOf2(n)) return false;
  let m = n;
  let i = 1;
  while (m !== 2) {
    i += 1;
    m = m / 2;
  }
  return i;
}

export function coerceEven(n) {
  return Number.isNaN(Number(n)) ? 0 : (n % 2 && n + 1) || n;
}

export function nearestPowerOf2(val) {
  return Math.pow(2, Math.round(Math.log(val) / Math.log(2)));
}

export function isNumeric(value) {
  return !Number.isNaN(Number.parseFloat(value));
}

export function isOdd(num) {
  const numInt = ensureInt(num);
  if (Number.isNaN(numInt)) return undefined;
  if (numInt === 0) return false;
  return (numInt & -numInt) === 1;
}

export function nextPowerOf2(n?) {
  if (Number.isNaN(Number(n))) return false;
  while (!isPowerOf2(n)) {
    n++;
  }
  return n;
}

export function randomInt(min, max, random?: () => number) {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor((random ?? Math.random)() * (max - min + 1)) + min;
}

// does accept e.e. '1.0'
export function isConvertableInteger(n) {
  if (isString(n) && !n.trim().length) return false;
  return Number.isSafeInteger(typeof n === 'string' ? +n : n);
}

// produces an approximated normal distribution between 0 and max
export function weightedRandom(max = 1, weight = 3, round = true, random?: () => number) {
  const rng = random ?? Math.random;
  let num = 0;
  for (let i = 0; i < weight; i++) {
    num += rng() * (max / weight);
  }
  return round && max > 1 ? Math.round(num) : num;
}

// round to nearest step, e.g. 0.25
function stepRound(value, step) {
  step || (step = 1);
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

export function skewedDistribution(min: number, max: number, skew: number, step?, significantDecimals = 2, random?: () => number) {
  const rng = random ?? Math.random;
  const u = 1 - rng();

  const v = 1 - rng();
  let num = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);

  num = num / 10 + 0.5;

  if (num > 1 || num < 0) {
    num = skewedDistribution(min, max, skew, undefined, 2, random);
  } else {
    num = Math.pow(num, skew);
    num *= max - min;
    num += min;
  }

  if (step) num = stepRound(num, step);

  return Number.parseFloat(num.toFixed(significantDecimals));
}

export function safePct(numerator, denominator, round = true) {
  return denominator && isNumeric(numerator) && isNumeric(denominator)
    ? (round && Math.round((numerator / denominator) * 100)) || numerator / denominator
    : 0;
}

export function fixedDecimals(value: number, to = 2) {
  return Number.parseFloat(Number(Math.round(value * 1000) / 1000).toFixed(to));
}
