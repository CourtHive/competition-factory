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

  // ── The margin honours an explicit `winBy`, which it previously ignored ──
  //
  // `NoAD` and a tiebreak both force a one-game margin, and both were already handled. What was not is a
  // format that DECLARES its margin: `parse('SET1-S:5WB1')` emits `{setTo: 5, noTiebreak: true, winBy: 1}`,
  // with no `NoAD`, so a 5-4 fell through to a two-game margin and came back INCOMPLETE — though
  // first-to-five wins that set. `SET1-S:5NOAD` worked, which is what made the gap easy to miss: the two
  // formats express the same rule under different keys and only one of them was read.
  //
  // The symptom reached further than this function. `getSetWinningSide` delegates here, so `analyzeSet`
  // reported `winningSide: undefined` for the same 5-4 — one root cause, two wrong answers. Found while
  // courthive-components was being moved off its hand-rolled copies of this logic (CA, 2026-09-27).
  const declaredWinBy = setFormat.winBy;
  const winMargin =
    (!requiresTiebreak && setFormat.NoAD) || requiresTiebreak || (isTiebreakSet && setFormat.tiebreakFormat?.NoAD)
      ? 1
      : (declaredWinBy ?? 2);
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
