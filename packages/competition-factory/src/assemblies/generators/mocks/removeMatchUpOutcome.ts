import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { findEvent } from '@Acquire/findEvent';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type OutcomeArgs = {
  tournamentRecord?: Tournament;
  drawId?: string;
  matchUpId: string;
  event?: Event;
  drawDefinition?: DrawDefinition;
};
export function removeMatchUpOutcome({ tournamentRecord, drawId, matchUpId, event, drawDefinition }: OutcomeArgs) {
  if (!drawDefinition && drawId && tournamentRecord) {
    const result = findEvent({ tournamentRecord, drawId });
    if (result.error) return result;
    drawDefinition = result.drawDefinition;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- any falsy event is replaced by the one found, not only a missing one
    if (!event) event = result.event;
  }

  return setMatchUpStatus({
    outcome: toBePlayed,
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event,
  } as Parameters<typeof setMatchUpStatus>[0]);
}
