import { checkScoreCompleteness } from '@Validators/scoreCompleteness';
import { getMatchUpRatingDelta } from './getMatchUpRatingDelta';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { RANKING, RATING, SEEDING } from '@Constants/scaleConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';

export type UpsetBasis = typeof SEEDING | typeof RANKING | typeof RATING;

type GetMatchUpUpsetArgs = {
  /** `SEEDING` (default), `RANKING` or `RATING`. */
  scaleType?: UpsetBasis;
  /** The ranking or rating scale, e.g. `WTN`. Required for `RANKING` and `RATING`. */
  scaleName?: string;
  /** Overrides the scale's declared value accessor. */
  scaleAccessor?: string;
  /** A `RATING` scale's direction, for a scale `ratingsParameters` does not know. Ignored otherwise. */
  ascending?: boolean;
  /** Rate a doubles matchUp by its players' SINGLES values (as `getMatchUpRatingDelta`). */
  singlesForDoubles?: boolean;
  matchUp: Partial<HydratedMatchUp>;
};

export type MatchUpUpset = {
  isUpset: boolean;
  basis?: UpsetBasis;
  winningSide?: number;
  /** The winner's and loser's values on the basis; a seed or ranking position, or a rating */
  winnerValue?: number;
  loserValue?: number;
  /** Why there is no verdict: not a fully scored result, or a side without a value on the basis */
  info?: string;
  error?: ErrorType;
};

const NOT_SCORED = 'not a fully scored result';

/** A side's seed as a number: `seedValue` before `seedNumber`; `~` is unseeded; a block (`5-8`) is its first seed. */
function seedOf(side?: HydratedSide): number | undefined {
  const value = side?.seedValue === '~' ? undefined : (side?.seedValue ?? side?.seedNumber);
  if (value === undefined || value === null || value === '') return undefined;
  const seed = Number.parseFloat(String(value));
  return Number.isFinite(seed) ? seed : undefined;
}

/**
 * A result that was played to the end and fully scored: `COMPLETED` with a winner and a score whose every set is a
 * finished, legal set under the matchUp's format (`checkScoreCompleteness`, the rule the score-entry dialog gates its
 * Submit on). Retirements, walkovers and defaults are not, whatever their score (CA, 2026-10-26).
 */
function isFullyScored(matchUp: Partial<HydratedMatchUp>): boolean {
  if (matchUp?.matchUpStatus !== COMPLETED || !matchUp.winningSide) return false;
  const sets = matchUp.score?.sets ?? [];
  if (!sets.length) return false;
  const { isComplete } = checkScoreCompleteness({
    matchUpFormat: matchUp.matchUpFormat,
    winningSide: matchUp.winningSide,
    matchUpStatus: COMPLETED,
    sets,
  });
  return isComplete;
}

function seedingUpset(matchUp: Partial<HydratedMatchUp>): MatchUpUpset {
  const winningSide = matchUp.winningSide;
  const winner = matchUp.sides?.find((side) => side?.sideNumber === winningSide);
  const loser = matchUp.sides?.find((side) => side?.sideNumber && side.sideNumber !== winningSide);
  const winnerValue = seedOf(winner);
  const loserValue = seedOf(loser);
  if (loserValue === undefined)
    return { isUpset: false, basis: SEEDING, winningSide, winnerValue, info: 'the loser was unseeded' };
  // an unseeded winner ranks below every seed
  const isUpset = winnerValue === undefined || winnerValue > loserValue;
  return { isUpset, basis: SEEDING, winningSide, winnerValue, loserValue };
}

/**
 * Whether a matchUp's result was an upset: the side that lost was the stronger on `scaleType`.
 *
 * - **Only a fully scored result** (see `isFullyScored`) can be an upset; anything else answers `isUpset: false` with
 *   `info`. A walkover, a default or a retirement decides nothing about strength.
 * - **SEEDING** (default): the loser was seeded and the winner was unseeded or a lower seed (a higher number). An
 *   unseeded loser is not upset.
 * - **RANKING**: a lower ranking position is stronger. Both sides need a value on `scaleName`.
 * - **RATING**: the direction is the scale's own (`ratingsParameters[scaleName].ascending`, e.g. lower WTN is
 *   stronger, higher UTR is), resolved by `getMatchUpRatingDelta`, which also reads ingested string values and takes a
 *   pair's mean. Both sides need a value; a scale of unknown direction is an error unless `ascending` is given.
 *
 * Reads the hydrated matchUp only (sides, seeds, participants' `rankings` / `ratings` by matchUpType, score, format),
 * so it answers for a matchUp from any query without engine state.
 */
export function getMatchUpUpset({
  scaleType = SEEDING,
  singlesForDoubles,
  scaleAccessor,
  ascending,
  scaleName,
  matchUp,
}: GetMatchUpUpsetArgs): MatchUpUpset {
  if (!matchUp || typeof matchUp !== 'object') return { isUpset: false, error: MISSING_MATCHUP };
  if (![SEEDING, RANKING, RATING].includes(scaleType)) {
    return { isUpset: false, error: INVALID_VALUES, info: `unknown scaleType ${String(scaleType)}` };
  }
  if (scaleType !== SEEDING && !scaleName) {
    return { isUpset: false, error: INVALID_VALUES, info: `scaleName is required for ${scaleType}` };
  }
  if (!isFullyScored(matchUp)) return { isUpset: false, basis: scaleType, info: NOT_SCORED };

  if (scaleType === SEEDING) return seedingUpset(matchUp);

  const winningSide = matchUp.winningSide;
  const delta = getMatchUpRatingDelta({
    // a ranking position is always lower-is-stronger
    ascending: scaleType === RANKING ? true : ascending,
    sideNumber: winningSide,
    singlesForDoubles,
    scaleAccessor,
    scaleName,
    matchUp,
  });
  if (delta.error) return { isUpset: false, basis: scaleType, winningSide, error: delta.error, info: delta.info };
  if (delta.signedDelta === undefined) {
    return { isUpset: false, basis: scaleType, winningSide, info: `a side has no ${scaleName} value` };
  }
  // from the winner's perspective, positive means the opponent was the stronger
  return {
    isUpset: delta.signedDelta > 0,
    winnerValue: delta.ownRating,
    loserValue: delta.oppRating,
    basis: scaleType,
    winningSide,
  };
}
