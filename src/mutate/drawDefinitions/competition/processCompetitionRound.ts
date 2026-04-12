// Query
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import { getCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';

// Mutate
import { processCompetitionMatchUp } from './processCompetitionMatchUp';
import { addExtension } from '@Mutate/extensions/addExtension';

// Constants
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ProcessCompetitionRoundArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  roundNumber: number;
  matchUps: MatchUp[];
  event?: Event;
};

export function processCompetitionRound(params: ProcessCompetitionRoundArgs): ResultType {
  const { tournamentRecord, drawDefinition, roundNumber, matchUps, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { ...SUCCESS };

  const { competitionState } = getCompetitionState({ drawDefinition });
  if (!competitionState) return { ...SUCCESS };

  // Check if this round was already processed
  if (competitionState.roundStates[roundNumber]?.processed) return { ...SUCCESS };

  // Process all completed matchUps in this round
  const roundMatchUps = matchUps.filter(
    (m) =>
      m.roundNumber === roundNumber && (m.winningSide || completedMatchUpStatuses.includes(m.matchUpStatus as any)),
  );

  for (const matchUp of roundMatchUps) {
    processCompetitionMatchUp({ tournamentRecord, drawDefinition, matchUp, event });
  }

  // Re-read state (it was updated by processCompetitionMatchUp)
  const { competitionState: updatedState } = getCompetitionState({ drawDefinition });
  if (updatedState) {
    updatedState.roundStates[roundNumber] = {
      roundNumber,
      processed: true,
    };

    addExtension({
      element: drawDefinition,
      extension: { name: COMPETITION_STATE, value: updatedState },
    });
  }

  return { ...SUCCESS };
}
