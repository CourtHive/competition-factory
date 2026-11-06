import { deriveCountables } from '@Helpers/ratings/competition/deriveCountables';
import { winnerActualOf } from '@Helpers/ratings/ratingsPolicyRules';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { RatingsMarginRule, RatingsPolicy } from '@Types/ratingsPolicyTypes';
import { AD_HOC, MAIN } from '@Constants/drawDefinitionConstants';
import type { OvertimeScoreContext } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

export type RatedResult = {
  /** the side rated as the winner; side 1 for a draw, rated 0.5 each */
  winningSide: number;
  winnerActual: number;
  loserActual: number;
  margin: { rule?: RatingsMarginRule; marginOfVictory?: number; winnerGameShare?: number; draw?: boolean };
  protectLosses: boolean;
  /** FIVB: a winner gains at least this */
  winnerMinimumGain?: number;
};

/**
 * How a matchUp's result is rated under a policy, or `undefined` where it is not rated: no winner and not a COMPLETED
 * draw, or a draw the policy excludes.
 */
export function ratedResultOf(matchUp: HydratedMatchUp, policy: RatingsPolicy): RatedResult | undefined {
  const { matchUpFormat, matchUpStatus, score, winningSide } = matchUp;
  const parsedFormat = matchUpFormat ? parse(matchUpFormat) : undefined;
  const margin = { rule: policy.margin, marginOfVictory: marginOfVictoryOf(matchUp), winnerGameShare: undefined };
  const protectLosses = !!policy.protections?.includes('KNOCKOUT_LOSS_PROTECTION') && isKnockout(matchUp);

  // the share of the scoring units won, or FIFA's goal table, rates a draw by its score too
  const share =
    (policy.actual.rule === 'SCORE_SHARE' && scoreShareOf(matchUp)) ||
    (policy.actual.rule === 'GOAL_TABLE' && goalTableShareOf(matchUp, policy.actual.table)) ||
    undefined;

  if (!winningSide) {
    if (matchUpStatus !== COMPLETED || policy.draws === 'EXCLUDE') return undefined;
    // a share sums to 1; FIFA's goal table gives both sides the same value at a draw
    const [side1Actual, side2Actual] = share ?? [0.5, 0.5];
    return {
      margin: { ...margin, draw: true },
      loserActual: side2Actual,
      winnerActual: side1Actual,
      winningSide: 1,
      protectLosses,
    };
  }

  const loserSetsWon = (score?.sets ?? []).filter((set) => set.winningSide === 3 - winningSide).length;
  if (policy.actual.rule === 'SET_SCORE_VALUE') {
    const winnerSetsWon = (score?.sets ?? []).filter((set) => set.winningSide === winningSide).length;
    const { values } = policy.actual;
    const [winnerValue, loserValue] = [
      values[`${winnerSetsWon}-${loserSetsWon}`],
      values[`${loserSetsWon}-${winnerSetsWon}`],
    ];
    if (winnerValue === undefined || loserValue === undefined) return undefined;
    const { winnerMinimumGain } = policy;
    return {
      winningSide,
      winnerActual: winnerValue,
      loserActual: loserValue,
      margin,
      protectLosses,
      winnerMinimumGain,
    };
  }
  const winnerActual = share
    ? share[winningSide - 1]
    : winnerActualOf({ rule: policy.actual, parsedFormat, loserSetsWon });
  const result: RatedResult = {
    margin: { ...margin, winnerGameShare: winnerGameShareOf(matchUp) },
    winnerMinimumGain: policy.winnerMinimumGain,
    loserActual: 1 - winnerActual,
    protectLosses,
    winnerActual,
    winningSide,
  };

  // the record of how the result was decided, where the overtime records keep it
  const overtime = (score as { overtime?: OvertimeScoreContext } | undefined)?.overtime;
  const decidedIn = overtime?.decidedIn;
  const shootout =
    (decidedIn === 'DECIDER' && !!parsedFormat?.finalSetFormat?.shootout) ||
    (decidedIn === 'EXTERNAL' && overtime?.decidedBy?.method === 'SHOOTOUT');
  const rule = (shootout && policy.shootoutResult) || (decidedIn === 'OVERTIME' && policy.overtimeResult) || undefined;
  if (rule?.rule === 'PARTIAL') return { ...result, winnerActual: rule.winner, loserActual: rule.loser };
  if (rule?.margin !== undefined) return { ...result, margin: { ...result.margin, marginOfVictory: rule.margin } };
  return result;
}

/** Goals or points between the sides in an aggregate format (its decider and a shootout not counted), else undefined. */
function marginOfVictoryOf(matchUp: HydratedMatchUp): number | undefined {
  const { matchUpFormat } = matchUp;
  if (!matchUpFormat || !parse(matchUpFormat)?.aggregate) return undefined;
  const { aggregateScores } = analyzeMatchUp({ matchUp, matchUpFormat });
  return aggregateScores ? Math.abs(aggregateScores[0] - aggregateScores[1]) : undefined;
}

/** The winner's share of the games; a tiebreak-only set counts one game to its winner. */
function winnerGameShareOf(matchUp: HydratedMatchUp): number | undefined {
  const { score, winningSide } = matchUp;
  const games = [0, 0];
  for (const set of score?.sets ?? []) {
    const side1 = set.side1Score ?? 0;
    const side2 = set.side2Score ?? 0;
    if (side1 || side2) {
      games[0] += side1;
      games[1] += side2;
    } else if (set.winningSide) {
      games[set.winningSide - 1] += 1;
    }
  }
  const total = games[0] + games[1];
  return total && winningSide ? games[winningSide - 1] / total : undefined;
}

function isKnockout(matchUp: HydratedMatchUp): boolean {
  const { stage, isRoundRobin, drawType } = matchUp as HydratedMatchUp & { isRoundRobin?: boolean };
  return stage === MAIN && !isRoundRobin && drawType !== AD_HOC;
}

/** Each side's share of the scoring units won (points, else games, else sets), as the competition policy counts them. */
function scoreShareOf(matchUp: HydratedMatchUp): [number, number] {
  const { side1Count, side2Count } = deriveCountables(matchUp);
  const total = side1Count + side2Count;
  return total ? [side1Count / total, side2Count / total] : [0.5, 0.5];
}

/**
 * Each side's actual result from FIFA's women's goal table: the non-winner's value by its goals and the goal
 * difference, the winner's 1 − it; undefined where the format sums no goals.
 */
function goalTableShareOf(matchUp: HydratedMatchUp, table: number[][]): [number, number] | undefined {
  const { matchUpFormat } = matchUp;
  if (!matchUpFormat || !parse(matchUpFormat)?.aggregate) return undefined;
  const { aggregateScores } = analyzeMatchUp({ matchUp, matchUpFormat });
  if (!aggregateScores) return undefined;
  const [side1, side2] = aggregateScores;
  const row = table[Math.min(Math.min(side1, side2), table.length - 1)];
  const value = row[Math.min(Math.abs(side1 - side2), row.length - 1)];
  if (side1 === side2) return [value, value];
  return side1 > side2 ? [1 - value, value] : [value, 1 - value];
}
