import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { findEvent } from '@Acquire/findEvent';

export function removeMatchUpOutcome({ tournamentRecord, drawId, matchUpId, event, drawDefinition }) {
  if (!drawDefinition && drawId && tournamentRecord) {
    const result = findEvent({ tournamentRecord, drawId });
    if (result.error) return result;
    drawDefinition = result.drawDefinition;
    if (!event) event = result.event;
  }

  return setMatchUpStatus({
    outcome: toBePlayed,
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
  });
}
