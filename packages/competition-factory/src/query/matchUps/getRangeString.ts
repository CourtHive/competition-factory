import { isNumeric } from '@Tools/math';
import { unique } from '@Tools/arrays';

export function getRangeString(arr) {
  if (!Array.isArray(arr)) return '';
  const numericArray = arr.filter(isNumeric);
  if (!numericArray.length) return '';
  const range = unique([Math.min(...numericArray), Math.max(...numericArray)]);
  return range.join('-');
}
