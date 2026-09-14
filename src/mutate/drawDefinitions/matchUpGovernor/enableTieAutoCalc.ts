import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants
import { INVALID_MATCHUP, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

export function enableTieAutoCalc({ tournamentRecord, drawDefinition, matchUpId, event }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { matchUp } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  if (matchUp?.matchUpType !== TEAM_MATCHUP) return { error: INVALID_MATCHUP };

  return setMatchUpState({
    enableAutoCalc: true,
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
  });
}
