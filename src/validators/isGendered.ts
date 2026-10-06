// constants and types
import { isFemale } from './isFemale';
import { isMale } from './isMale';

export function isGendered(gender: unknown): boolean {
  return isFemale(gender) || isMale(gender);
}
