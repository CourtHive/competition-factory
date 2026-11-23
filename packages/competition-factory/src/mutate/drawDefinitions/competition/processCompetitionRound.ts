// Query
import { deriveCompetitionState } from '@Query/drawDefinition/competition/deriveCompetitionState';
import { getStoredCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';

// Mutate
import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ProcessCompetitionRoundArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  roundNumber: number;
  matchUps: MatchUp[];
  event?: Event;
};

/**
 * Marks a round processed (PER_ROUND) and re-derives the stored competition state from the draw's results
 * (`deriveCompetitionState`). A round already processed is left as it is.
 */
export function processCompetitionRound(params: ProcessCompetitionRoundArgs): ResultType {
  const { tournamentRecord, drawDefinition, roundNumber, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { ...SUCCESS };

  const stored = getStoredCompetitionState({ drawDefinition });
  if (!stored) return { ...SUCCESS };

  // Check if this round was already processed
  if (stored.roundStates[roundNumber]?.processed) return { ...SUCCESS };

  const attributes = ['competitionState'];
  const before = attributesSnapshot(drawDefinition, attributes);
  const marked = { ...stored, roundStates: { ...stored.roundStates, [roundNumber]: { roundNumber, processed: true } } };
  setFirstClassOrExtension({
    element: drawDefinition,
    attribute: 'competitionState',
    name: COMPETITION_STATE,
    value: deriveCompetitionState({ competitionPolicy, competitionState: marked, drawDefinition }),
  });
  announceDrawChange({ tournamentRecord, drawDefinition, attributes, before, event });

  return { ...SUCCESS };
}
