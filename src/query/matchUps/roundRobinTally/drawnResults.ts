import { isCompletedCombinedPointTie } from '@Validators/isCompletedCombinedPointTie';
import { parsedFormatCanEndTied } from '@Validators/tiedFormatCompatibility';
import { parse, type SetFormat } from '@Helpers/matchUpFormatCode/parse';
import { overtimeDecision } from '@Scoring/analysis/overtimeScore';
import { parseTallyFormat } from './parseTallyFormat';

// constants and types
import type { MatchUp, Score, Set as SetType } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Only a complete tie permitted by the scoring contract is a drawn result: a level combined total, or a level finish
 * of a format that can end level (scoring spec § 9.7), with no winner named.
 */
export function isDrawnResult(matchUp: MatchUp, fallbackFormat?: string): boolean {
  return (
    matchUp.matchUpStatus === COMPLETED &&
    matchUp.winningSide === undefined &&
    isLevelScore(matchUp.score, matchUp.matchUpFormat ?? fallbackFormat)
  );
}

/**
 * A complete, level score of a format that can end level, whoever was then named its winner: a drawn result where no
 * winner is needed, and the sporting score of a result decided outside it (a shootout, a competition rule, lots, an
 * official decision) where one is.
 *
 * - a level combined total (`isCompletedCombinedPointTie`);
 * - an aggregate whose N segments total level, a timed decider that closed level too;
 * - N sets played to a level count of sets won;
 * - a declared overtime the scoring engine completes with no winner (`overtimeDecision`).
 */
export function isLevelScore(score?: Score, matchUpFormat?: string): boolean {
  if (isCompletedCombinedPointTie({ score, matchUpFormat })) return true;
  const parsed = parse(matchUpFormat ?? '');
  const format = parsed?.setFormat;
  if (parsed?.overtimeFormat) {
    // a declared overtime finishes level where the scoring engine completes it with no winner (finite overtime, no -F:)
    const decision = overtimeDecision(score?.sets, matchUpFormat);
    return !!decision?.complete && !decision.winningSide;
  }
  if (!parsed || !format || format.combinedPointTotal) return false;
  if (!parsedFormatCanEndTied(parsed)) return false;
  const sets = score?.sets ?? [];
  const n = parsed.exactly ?? parsed.bestOf ?? 1;
  const level = ([a, b]: number[]) => a === b;
  if (parsed.aggregate) {
    // only an exactly-N aggregate declares a decider, set N + 1; it can end level only when it is timed with no tiebreak
    const decider = !!parsed.exactly && !!parsed.finalSetFormat;
    if (sets.length !== n + (decider ? 1 : 0)) return false;
    const units = (set: SetType, segment?: SetFormat): number[] =>
      segment?.tiebreakSet && !segment.setTo
        ? [set.side1TiebreakScore ?? set.side1Score ?? 0, set.side2TiebreakScore ?? set.side2Score ?? 0]
        : [set.side1Score ?? 0, set.side2Score ?? 0];
    const total = sets
      .slice(0, n)
      .map((set) => units(set, format))
      .reduce((sum, [a, b]) => [sum[0] + a, sum[1] + b], [0, 0]);
    return level(total) && (!decider || level(units(sets[n], parsed.finalSetFormat)));
  }
  if (sets.length !== n) return false;
  const won = [1, 2].map((side) => sets.filter((set) => set.winningSide === side).length);
  return level(won);
}

export function isCombinedPointFormat(format?: string): boolean {
  return !!parseTallyFormat(format ?? '')?.setFormat?.combinedPointTotal;
}
