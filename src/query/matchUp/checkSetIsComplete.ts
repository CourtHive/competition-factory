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

  // Only a format that HAS a tiebreak can require one. An advantage set (`S:6`, no `/TB`) runs on past
  // six-all by two clear games — 1968 Wimbledon reached 24-22 — and this read both sides at `setTo` as
  // "tiebreak now" regardless, so an 8-6 came back INCOMPLETE (measured 2026-10-02, with or without
  // `NOAD`). `parse` writes `noTiebreak: true` and no `tiebreakAt` for such a set; a hand-built format
  // with neither field is read the same way, as the advantage set it declares.
  const formatHasTiebreak = !!(setFormat.tiebreakFormat || setFormat.tiebreakAt);
  const requiresTiebreak =
    isTiebreakSet ||
    (formatHasTiebreak && side1Score >= setTo && side2Score >= setTo) ||
    (tiebreakAt && tiebreakAt < setTo && (side1Score === tiebreakAt || side2Score === tiebreakAt));

  const leaderHoldsTiebreak =
    (leadingSide === 1 && set.side1TiebreakScore > set.side2TiebreakScore) ||
    (leadingSide === 2 && set.side2TiebreakScore > set.side1TiebreakScore);

  const tiebreakIsValid =
    ignoreTiebreak || (requiresTiebreak && leaderHoldsTiebreak && tiebreakReachesTarget(set, setFormat, isTiebreakSet));

  // ── The margin is two games, a declared `winBy`, or one through a tiebreak — never `NoAD` ──
  //
  // `NoAD` on a set format is no-advantage GAME scoring: a game at deuce decided by one point. It says
  // nothing about how the SET ends, which under `S:6NOAD/TB7` is still two clear games or the tiebreak at
  // six-all — the ITF's own short sets and the USTA "Standard Doubles" format both read that way, and a
  // one-game SET margin is a different token, `WB1` (`parse('SET1-S:5WB1')` emits `winBy: 1`; TYPTI).
  // This function read `NoAD` as that margin, so a `6-5` under `SET3-S:6NOAD/TB7-F:TB10` came back
  // COMPLETE, and `getSetWinningSide` and `analyzeSet`, which delegate here, named a winner for it.
  // Settled by CA 2026-10-01; the grammar and sources are in
  // `Mentat/statuses/2026-10-01-noad-at-three-levels-and-the-one-game-set.md`.
  //
  // `winBy` itself was previously ignored: a 5-4 under `SET1-S:5WB1` fell through to a two-game margin
  // and came back INCOMPLETE, though first-to-five wins that set (CA, 2026-09-27).
  const declaredWinBy = setFormat.winBy;
  const winMargin = requiresTiebreak || (isTiebreakSet && setFormat.tiebreakFormat?.NoAD) ? 1 : (declaredWinBy ?? 2);
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
