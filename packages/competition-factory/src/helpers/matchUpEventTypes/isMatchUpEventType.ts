import { matchUpEventTypeMap } from './matchUpEventTypeMap';
import { isObject, isString } from '@Tools/objects';

export const isMatchUpEventType = (type?) => (params?) => {
  const matchUpEventType = (isObject(params) && params?.matchUpType) || (isString(params) && params);
  return matchUpEventType && matchUpEventTypeMap[type].includes(matchUpEventType);
};
