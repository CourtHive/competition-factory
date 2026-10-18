// Mutate
import { announceDrawChange, attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ResetCompetitionStateArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
};

export function resetCompetitionState({
  tournamentRecord,
  drawDefinition,
  event,
}: ResetCompetitionStateArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const attributes = ['competitionState'];
  const before = attributesSnapshot(drawDefinition, attributes);

  setFirstClassOrExtension({
    element: drawDefinition,
    attribute: 'competitionState',
    name: COMPETITION_STATE,
    value: undefined,
  });
  // a draw with no state to clear is left as it was, and announces nothing
  announceDrawChange({ tournamentRecord, drawDefinition, attributes, before, event });

  return { ...SUCCESS };
}
