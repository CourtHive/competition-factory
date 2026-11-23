import { isNumeric } from '@Tools/math';

export function accumulate(a: number[]): number {
  if (!Array.isArray(a)) return 0;
  return a.reduce((sum, val) => (isNumeric(sum) ? sum : 0) + (isNumeric(val) ? val : 0), 0);
}
