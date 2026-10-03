import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { parse } from '@Helpers/matchUpFormatCode/parse';

const hasValue = (value: unknown) => value !== undefined && value !== null;
const isPlayed = (set: any) =>
  [set?.side1Score, set?.side2Score, set?.side1TiebreakScore, set?.side2TiebreakScore].some(hasValue);

/**
 * The first set a best-of match could not have played, in words, or `undefined`.
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
 * so neither is asked. Sets with no score at all are not counted as played.
 */
export function setPlayedAfterDecision(sets: any[], matchUpFormat?: string): string | undefined {
  if (!matchUpFormat || !sets?.length) return undefined;
  const parsed = parse(matchUpFormat);
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
