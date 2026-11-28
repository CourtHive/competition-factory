import type { Score } from '@Types/tournamentTypes';

/** Whether a score (given, or the matchUp's) has a value: more than one set, or a first set with any score. */
type CheckScoreHasValueArgs = { matchUp?: { score?: Score } | null; score?: Score };

/** A matchUp may be passed as the params object: its own `score` is read. Other attributes are not read. */
export function checkScoreHasValue(params: object): boolean;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function checkScoreHasValue(params?: CheckScoreHasValueArgs | null): boolean;
// eslint-disable-next-line no-redeclare -- overload implementation
export function checkScoreHasValue(params) {
  const matchUp = params?.matchUp;
  const score = params?.score || matchUp?.score;

  const firstSet = score?.sets?.[0];
  const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore, side1PointScore, side2PointScore } =
    firstSet ?? {};
  const firstSetScore =
    side1Score || side2Score || side1TiebreakScore || side2TiebreakScore || side1PointScore || side2PointScore;
  const hasValue = score?.sets?.length > 1 || firstSetScore;

  return !!hasValue;
}
