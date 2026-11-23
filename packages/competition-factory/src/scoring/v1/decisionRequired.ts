import type { MatchUp, PointSituation } from '@Types/scoring/types';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Whether a match is `COMPLETED` without a winner, so a host must decide it (scoring-engine spec § 9.7
 * rule 3, § 11.2; CA 2026-10-18): a level close with no declared decider, or a combined total's tie.
 * The engine records no decision.
 */
export function isDecisionRequired(matchUp: MatchUp): boolean {
  return matchUp.matchUpStatus === COMPLETED && matchUp.winningSide === undefined;
}

/** The situation of a match COMPLETED without a winner: nothing is in play, and a decision is due. */
export function decisionRequiredSituation(): PointSituation {
  return {
    isBreakPoint: false,
    isGamePoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    isGoldenPoint: false,
    isTiebreak: false,
    decisionRequired: true,
  };
}
