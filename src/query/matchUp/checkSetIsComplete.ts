import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';

type CheckSetIsCompleteArgs = {
  matchUpScoringFormat?: any;
  ignoreTiebreak?: boolean;
  isDecidingSet?: boolean;
  isTiebreakSet?: boolean;
  matchUpFormat?: string;
  isTimedSet?: boolean;
  set: any;
};

export function checkSetIsComplete({
  ignoreTiebreak = false,
  matchUpScoringFormat,
  matchUpFormat,
  isTiebreakSet,
  isDecidingSet,
  isTimedSet,
  set,
}: CheckSetIsCompleteArgs) {
  if (!set) return { error: MISSING_VALUE, info: 'missing set' };
  matchUpScoringFormat = matchUpScoringFormat || (matchUpFormat && parse(matchUpFormat));

  const setFormat = (isDecidingSet && matchUpScoringFormat.finalSetFormat) || (matchUpScoringFormat?.setFormat ?? {});
  const { side1Score, side2Score } = set;
  const { setTo, tiebreakAt } = setFormat;
  const hasScore = side1Score || side2Score;

  const leadingSide = getLeadingSide({ set });
  const scoreDiff = Math.abs(side1Score - side2Score);
  const containsSetTo = side1Score >= setTo || side2Score >= setTo;

  const requiresTiebreak =
    isTiebreakSet ||
    (side1Score >= setTo && side2Score >= setTo) ||
    (tiebreakAt && tiebreakAt < setTo && (side1Score === tiebreakAt || side2Score === tiebreakAt));

  const tiebreakIsValid =
    ignoreTiebreak ||
    (requiresTiebreak &&
      ((leadingSide === 1 && set.side1TiebreakScore > set.side2TiebreakScore) ||
        (leadingSide === 2 && set.side2TiebreakScore > set.side1TiebreakScore)));

  const winMargin =
    (!requiresTiebreak && setFormat.NoAD) || requiresTiebreak || (isTiebreakSet && setFormat.tiebreakFormat?.NoAD)
      ? 1
      : 2;
  const hasWinMargin = scoreDiff >= winMargin;
  const validNormalSetScore = containsSetTo && (hasWinMargin || requiresTiebreak);

  return !!(
    ((isTimedSet && hasScore) || validNormalSetScore || isTiebreakSet) &&
    (!requiresTiebreak || tiebreakIsValid)
  );
}

export function getLeadingSide({ set }) {
  if (set.side1Score || set.side2Score) {
    if (set.side1Score > set.side2Score) return 1;
    if (set.side2Score > set.side1Score) return 2;
  } else if (set.side1TiebreakScore || set.side2TiebreakScore) {
    if (set.side1TiebreakScore > set.side2TiebreakScore) return 1;
    if (set.side2TiebreakScore > set.side1TiebreakScore) return 2;
  }
  return undefined;
}
