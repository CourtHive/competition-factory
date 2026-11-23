// Query
import { deriveCompetitionState } from '@Query/drawDefinition/competition/deriveCompetitionState';
import { getStoredCompetitionState } from '@Query/drawDefinition/competition/getCompetitionState';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';

// Mutate
import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';

// constants
import { MISSING_DRAW_DEFINITION, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ProcessCompetitionMatchUpArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUp: MatchUp;
  event?: Event;
};

/**
 * Brings the stored competition state up to date after a result: the state is re-derived from every result of the
 * draw (`deriveCompetitionState`) and the stored copy replaced. Idempotent: entering, re-entering or correcting a result
 * leaves the state the results decide, where the v1 fold added the result again each time (C1).
 */
export function processCompetitionMatchUp(params: ProcessCompetitionMatchUpArgs): ResultType {
  const { tournamentRecord, drawDefinition, matchUp, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!matchUp) return { error: MISSING_MATCHUP };

  const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
  if (!competitionPolicy) return { ...SUCCESS };

  const stored = getStoredCompetitionState({ drawDefinition });
  if (!stored) return { ...SUCCESS };

  const attributes = ['competitionState'];
  const before = attributesSnapshot(drawDefinition, attributes);
  setFirstClassOrExtension({
    element: drawDefinition,
    attribute: 'competitionState',
    name: COMPETITION_STATE,
    value: deriveCompetitionState({ competitionPolicy, competitionState: stored, drawDefinition }),
  });
  announceDrawChange({ tournamentRecord, drawDefinition, attributes, before, event });

  return { ...SUCCESS };
}
