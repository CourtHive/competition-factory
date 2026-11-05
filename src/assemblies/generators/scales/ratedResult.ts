import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { winnerActualOf } from './ratingsPolicyRules';

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
  margin: { rule?: RatingsMarginRule; marginOfVictory?: number; winnerGameShare?: number };
  protectLosses: boolean;
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

  if (!winningSide) {
    if (matchUpStatus !== COMPLETED || policy.draws === 'EXCLUDE') return undefined;
    return { winningSide: 1, winnerActual: 0.5, loserActual: 0.5, margin, protectLosses };
  }

  const loserSetsWon = (score?.sets ?? []).filter((set) => set.winningSide === 3 - winningSide).length;
  const winnerActual = winnerActualOf({ rule: policy.actual, parsedFormat, loserSetsWon });
  const result: RatedResult = {
    margin: { ...margin, winnerGameShare: winnerGameShareOf(matchUp) },
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
