import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants
import {
  CANNOT_CHANGE_WINNING_SIDE,
  MISSING_DRAW_DEFINITION,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type EnableTieAutoCalcArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpId: string;
  event?: Event;
};
export function enableTieAutoCalc({ tournamentRecord, drawDefinition, matchUpId, event }: EnableTieAutoCalcArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { matchUp } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  if (matchUp?.matchUpType !== TEAM_MATCHUP) return { error: INVALID_MATCHUP };

  const result = setMatchUpStatus({
    enableAutoCalc: true,
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
  } as Parameters<typeof setMatchUpStatus>[0]);

  // This API has always reported the stored dual when enabling would change a winner already played on.
  // The selector's refusal names its projection instead; keep the public enableTieAutoCalc envelope.
  return result.error?.code === CANNOT_CHANGE_WINNING_SIDE.code ? { ...result, context: { matchUp } } : result;
}
