import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { parse, ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

// types
import type { Set as SetType } from '@Types/tournamentTypes';

const hasValue = (value: unknown) => value !== undefined && value !== null;
const isPlayed = (set?: SetType) =>
  [set?.side1Score, set?.side2Score, set?.side1TiebreakScore, set?.side2TiebreakScore].some(hasValue);

/**
 * The most sets an `exactly` format records: N, plus one where the match is decided by AGGREGATE points.
 * There a level total goes to a sudden-death tiebreak (`-F:TB1`), and that tiebreak is NOT one of the N
 * sets (CA, 2026-10-04, the INTENNSE format). A format decided by sets plays N and no more.
 */
export function maxExactlySets(parsed?: ParsedFormat): number | undefined {
  const exactly = parsed?.exactly;
  if (!exactly) return undefined;
  return exactly + (isAggregateFormat(parsed) ? 1 : 0);
}

/**
 * The first set a match could not have played, in words, or `undefined`.
 *
 * ── The set count was never compared to the format ──
 *
 * A best-of match ends the moment a side wins a majority of its sets. `validateMatchUpScore` never asked,
 * so five sets validated under `SET3`; and the engine recorded `6-4 6-4 4-6` — a third set played after a
 * 2-0 win — because `analyzeScore` checks only that the winner holds the most sets (validator debate X2,
 * re-measured 2026-10-02).
 *
 * Two refusals: more sets than the format plays, and any played set after the one that decided the match.
 * An `exactly` format plays every set whatever the running score, and an aggregate is decided on points,
 * so neither is asked whether the match was decided — but an `exactly` format is still asked the first:
 * `SET3X-S:T10` recorded a fourth set as COMPLETED (measured 2026-10-04). Sets with no score at all are
 * not counted as played.
 */
export function setPlayedAfterDecision(sets: SetType[], matchUpFormat?: string): string | undefined {
  if (!matchUpFormat || !sets?.length) return undefined;
  const parsed = parse(matchUpFormat);
  const maxSets = maxExactlySets(parsed);
  if (maxSets) {
    const playedCount = sets.filter(isPlayed).length;
    return playedCount > maxSets ? `Set ${maxSets + 1}: exactly ${parsed?.exactly} sets are played` : undefined;
  }
  const bestOf = parsed?.bestOf;
  if (!bestOf || parsed?.exactly || isAggregateFormat(parsed)) return undefined;

  const played = sets.filter(isPlayed);
  if (played.length > bestOf) {
    return `Set ${bestOf + 1}: a best of ${bestOf} plays at most ${bestOf} set${bestOf === 1 ? '' : 's'}`;
  }

  const setsToWin = Math.ceil(bestOf / 2);
  const won = [0, 0];
  for (let index = 0; index < played.length; index++) {
    const { winningSide } = played[index];
    if (winningSide === 1 || winningSide === 2) won[winningSide - 1] += 1;
    const decided = won[0] >= setsToWin || won[1] >= setsToWin;
    if (decided && index < played.length - 1) {
      const next = played[index + 1];
      return `Set ${next?.setNumber ?? index + 2}: played after the match was decided`;
    }
  }
  return undefined;
}
