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

  const leaderHoldsTiebreak =
    (leadingSide === 1 && set.side1TiebreakScore > set.side2TiebreakScore) ||
    (leadingSide === 2 && set.side2TiebreakScore > set.side1TiebreakScore);

  const tiebreakIsValid =
    ignoreTiebreak || (requiresTiebreak && leaderHoldsTiebreak && tiebreakReachesTarget(set, setFormat, isTiebreakSet));

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

/**
 * Whether a tiebreak has actually been WON: the leader's points reach the target, by the margin.
 *
 * ── Any lead used to be a win ──
 *
 * The only tiebreak question this function asked was whether the leading side held the higher points.
 * Measured 2026-09-30: a `3-1` in a match tiebreak to ten was complete, so was a `10-9`, and so was a
 * `7-6` decided by a `3-1` tiebreak. `getSetWinningSide` and `analyzeSet` delegate here, so all three
 * carried a `winningSide` — while `validateSetScore` refused every one of them. The engine's two answers
 * to "is this set over" had come apart, and a score-entry interface that asked the analysis was told a
 * match tiebreak was won at three points.
 *
 * The rule is the validator's: the winner reaches `tiebreakTo`, by two unless the tiebreak is no-ad.
 * Where the format names no target nothing can be checked and the lead alone still decides, which is the
 * previous behaviour exactly. A target of ONE — the sudden-death point a `F:TB1` decider is — cannot be
 * won by two, so the margin is capped at the target: `1-0` wins it.
 */
function tiebreakReachesTarget(set, setFormat, isTiebreakSet?: boolean): boolean {
  const tiebreakFormat = isTiebreakSet ? setFormat?.tiebreakSet : setFormat?.tiebreakFormat;
  const tiebreakTo = tiebreakFormat?.tiebreakTo;
  if (typeof tiebreakTo !== 'number') return true;

  const high = Math.max(set.side1TiebreakScore ?? 0, set.side2TiebreakScore ?? 0);
  const low = Math.min(set.side1TiebreakScore ?? 0, set.side2TiebreakScore ?? 0);
  const margin = tiebreakFormat?.NoAD ? 1 : Math.min(2, tiebreakTo);

  return high >= tiebreakTo && high - low >= margin;
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
