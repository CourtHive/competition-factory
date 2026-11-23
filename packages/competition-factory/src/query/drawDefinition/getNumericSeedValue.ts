import { isConvertableInteger } from '@Tools/math';
import { ensureInt } from '@Tools/ensureInt';

export function getNumericSeedValue(seedValue) {
  if (!seedValue) return Infinity;
  if (isConvertableInteger(seedValue)) return ensureInt(seedValue);
  const firstValue = seedValue.split('-')[0];
  if (isConvertableInteger(firstValue)) return ensureInt(firstValue);
  return Infinity;
}
