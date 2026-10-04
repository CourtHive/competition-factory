import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';

/**
 * One shape for a tiebreak-only set.
 *
 * A set a format plays as a single tiebreak — `S:TB10`, or the `F:TB10` match tiebreak that decides a
 * `SET3-S:6/TB7-F:TB10` — reached the engine in THREE shapes (measured 2026-10-02, validator debate G3):
 *
 *   (a) `{ side1TiebreakScore: 10, side2TiebreakScore: 8 }`                — mocks, a format-less parse
 *   (b) `{ side1Score: 10, side2Score: 8, tiebreakSet: true }`             — a parse WITH the format
 *       — and the same pair with no marker, read as (b) wherever the format says the set is a tiebreak
 *   (c) `{ side1Score: 1, side2Score: 0, side1TiebreakScore: 10, side2TiebreakScore: 8 }`
 *                                                                           — the point engine, every hydrated read
 *
 * `analyzeSet` recognised only (a): a tiebreak set was "tiebreak scores and no game scores". So (b) and (c)
 * were invalid sets to the analysis, `analyzeMatchUp` followed, and `setMatchUpState`'s guard against
 * reverting a COMPLETED matchUp to a live status — which asks `validMatchUpOutcome` — failed OPEN on every
 * matchUp a client had read back. Hydration (`annotateScoreSets`) then rewrote (b)'s game fields to the
 * 1-0 marker without first moving the points, so a `[10-8]` typed through a format-aware parse was stored
 * intact, printed `[10-8]` in the derived string, and read back as `1-0` with no points anywhere.
 *
 * The rule: a tiebreak-only set's points live in `side1TiebreakScore` / `side2TiebreakScore`. The game
 * fields, when present, are the 1-0 marker — the convention the point engine writes and hydration adds.
 * Shape (b) is READ for what it is wherever a set is analysed, and never written: the write path and
 * hydration both move its points into the tiebreak fields first.
 */

const isNumber = (value: unknown): value is number => typeof value === 'number' && !Number.isNaN(value);

/** The format a given set is played to: the final set's where the format names one and this is it. */
export function formatForSet(matchUpScoringFormat: any, setNumber?: number) {
  const { bestOf, exactly, finalSetFormat, setFormat } = matchUpScoringFormat ?? {};
  const maxSetNumber = bestOf || exactly;
  const isDecidingSet = finalSetGoverns(
    matchUpScoringFormat,
    setNumber,
    !!(setNumber && maxSetNumber && setNumber === maxSetNumber),
  );
  return (isDecidingSet && finalSetFormat) || setFormat;
}

type SideValues = [number | undefined, number | undefined];

/**
 * The 1-0 MARKER on its own: a tiebreak-only set whose game fields hold `1-0` (or `0-1`) and which carries
 * no tiebreak points. CA, 2026-10-02 (ruling V11): *"if a tiebreak set is required to complete the matchUp
 * and there is 1-0 in games that is acceptable"* — the points were not recorded, the winner was. A `1-0`
 * in the tiebreak FIELDS is points, and under a target above one it is no finished tiebreak; under `TB1`
 * the target is one, so `1-0` there is the points and never the marker.
 */
export function isTiebreakMarker(set: any, setFormat?: any): boolean {
  const tiebreakTo = setFormat?.tiebreakSet?.tiebreakTo;
  if (typeof tiebreakTo !== 'number' || tiebreakTo <= 1) return false;
  if (isNumber(set?.side1TiebreakScore) || isNumber(set?.side2TiebreakScore)) return false;
  const [a, b] = [set?.side1Score, set?.side2Score];
  return (a === 1 && b === 0) || (a === 0 && b === 1);
}

export type TiebreakSetReading = {
  /** The set holds the 1-0 marker and no points — see `isTiebreakMarker`. */
  isMarker?: boolean;
  /** The set is a tiebreak-only set, by the format's say, the hydration marker, or its own fields. */
  isTiebreakSet: boolean;
  /** The tiebreak points — read from the game fields when a (b)-shaped set carries them there. */
  sideTiebreakScores: SideValues;
  /** The game fields, or nothing when they held the points. */
  sideGameScores: SideValues;
};

/**
 * Where a set's points are, whatever shape it arrived in.
 *
 * `setFormat` is the set's own format — the deciding set's where there is one — and its `tiebreakSet`
 * says the set is a tiebreak. Without it the set's fields speak: tiebreak scores and no game scores, or
 * the hydration marker.
 */
export function readTiebreakSet(set: any, setFormat?: any): TiebreakSetReading {
  const sideGameScores: SideValues = [set?.side1Score, set?.side2Score];
  const sideTiebreakScores: SideValues = [set?.side1TiebreakScore, set?.side2TiebreakScore];
  const hasGameScores = sideGameScores.some(isNumber);
  const hasTiebreakScores = sideTiebreakScores.some(isNumber);

  // Where the FORMAT says the set is a tiebreak, any score in it is tiebreak points — including a pair in
  // the game fields with no marker, the shape the slam adapter and the US Open capture store a decider
  // in. Requiring tiebreak scores here left that shape a regular set to the analysis and let hydration
  // overwrite its points with the 1-0 marker (residual (b), 2026-10-02).
  const isTiebreakSet =
    !!set?.tiebreakSet ||
    (hasTiebreakScores && !hasGameScores) ||
    !!(setFormat?.tiebreakSet && (hasTiebreakScores || hasGameScores));

  // The marker is not points: it says who won and nothing about the score
  if (isTiebreakMarker(set, setFormat)) {
    return { isTiebreakSet: true, isMarker: true, sideTiebreakScores: [undefined, undefined], sideGameScores };
  }

  const pointsInGameFields = isTiebreakSet && hasGameScores && !hasTiebreakScores;
  if (pointsInGameFields) {
    return { isTiebreakSet, sideTiebreakScores: sideGameScores, sideGameScores: [undefined, undefined] };
  }

  return { isTiebreakSet, sideTiebreakScores, sideGameScores };
}

/**
 * The set with its points in the tiebreak fields. The same object comes back when nothing had to move,
 * so a caller can test identity to know whether anything changed.
 */
export function withPointsInTiebreakFields<T extends Record<string, any>>(set: T, setFormat?: any): T {
  const { isTiebreakSet, isMarker, sideTiebreakScores } = readTiebreakSet(set, setFormat);
  if (isMarker) return set;
  const pointsInGameFields = isTiebreakSet && !isNumber(set?.side1TiebreakScore) && !isNumber(set?.side2TiebreakScore);
  if (!pointsInGameFields) return set;

  const { side1Score: _side1Score, side2Score: _side2Score, ...rest } = set;
  return {
    ...rest,
    side1TiebreakScore: sideTiebreakScores[0],
    side2TiebreakScore: sideTiebreakScores[1],
  } as unknown as T;
}
