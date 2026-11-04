import { isCompletedCombinedPointTie } from '@Validators/isCompletedCombinedPointTie';
import { parsedFormatCanEndTied } from '@Validators/tiedFormatCompatibility';
import { parse, type SetFormat } from '@Helpers/matchUpFormatCode/parse';
import { parseTallyFormat } from './parseTallyFormat';

// constants and types
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import type { MatchUp, Score, Set as SetType } from '@Types/tournamentTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function validateDrawTallyOptions(policy?: RoundRobinTallyPolicy): ResultType {
  if (
    policy?.drawCredit !== undefined &&
    (typeof policy.drawCredit !== 'number' ||
      !Number.isFinite(policy.drawCredit) ||
      policy.drawCredit < 0 ||
      policy.drawCredit > 1)
  )
    return { error: INVALID_VALUES, info: 'drawCredit must be a finite number between 0 and 1' };
  if (
    policy?.outcomePoints !== undefined &&
    (!policy.outcomePoints ||
      (['win', 'draw', 'loss'] as const).some(
        (key) => typeof policy.outcomePoints?.[key] !== 'number' || !Number.isFinite(policy.outcomePoints[key]),
      ))
  )
    return { error: INVALID_VALUES, info: 'outcomePoints requires finite win, draw and loss values' };
  const usesStandingsPoints =
    policy?.groupOrderKey === 'standingsPoints' ||
    (Array.isArray(policy?.tallyDirectives) &&
      policy.tallyDirectives.some((directive) => directive?.attribute === 'standingsPoints'));
  if (usesStandingsPoints && !policy?.outcomePoints)
    return { error: INVALID_VALUES, info: 'standingsPoints ranking requires outcomePoints' };
  return { ...SUCCESS };
}

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
 * - N sets played to a level count of sets won.
 *
 * A declared overtime is the overtime workstream's (`overtimeScoreVerdict`), so it is not read here.
 */
export function isLevelScore(score?: Score, matchUpFormat?: string): boolean {
  if (isCompletedCombinedPointTie({ score, matchUpFormat })) return true;
  const parsed = parse(matchUpFormat ?? '');
  const format = parsed?.setFormat;
  if (!parsed || !format || format.combinedPointTotal || parsed.overtimeFormat) return false;
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
