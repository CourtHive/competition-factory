import { checkSetIsComplete, getLeadingSide } from './checkSetIsComplete';

// types
import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';
import type { Set as SetType } from '@Types/tournamentTypes';

type GetSetWinningSideArgs = {
  matchUpScoringFormat: ParsedFormat | undefined;
  isTiebreakSet?: boolean;
  isDecidingSet?: boolean;
  isTimedSet?: boolean;
  setObject: SetType;
};

export function getSetWinningSide({
  matchUpScoringFormat,
  isDecidingSet,
  isTiebreakSet,
  isTimedSet,
  setObject,
}: GetSetWinningSideArgs) {
  if (!setObject) return undefined;
  const leadingSide = getLeadingSide({ set: setObject });
  const setIsComplete = checkSetIsComplete({
    matchUpScoringFormat,
    set: setObject,
    isDecidingSet,
    isTiebreakSet,
    isTimedSet,
  });
  return (setIsComplete && leadingSide) || undefined;
}
