import { matchUpEventTypeMap } from './matchUpEventTypeMap';
import { intersection } from '@Tools/arrays';
import { isString } from '@Tools/objects';

export function includesMatchUpEventType(types, matchUpEventType) {
  if (!Array.isArray(types) || !isString(matchUpEventType)) return false;
  return intersection(types, matchUpEventTypeMap[matchUpEventType]).length;
}
