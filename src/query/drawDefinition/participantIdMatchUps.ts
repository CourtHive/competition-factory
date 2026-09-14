import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';

// constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Participant } from '@Types/tournamentTypes';

type GetParticipantIdMatchUps = {
  tournamentParticipants?: Participant[];
  drawDefinition: DrawDefinition;
  event?: Event;
};
export function getParticipantIdMatchUps({ tournamentParticipants, drawDefinition, event }: GetParticipantIdMatchUps) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const result = getAllDrawMatchUps({
    tournamentParticipants,
    inContext: true,
    drawDefinition,
    event,
  });

  const allMatchUps = makeDeepCopy(result.matchUps, false, true);

  const participantIds = unique(
    allMatchUps.reduce((participantIds, matchUp) => {
      return participantIds.concat(...matchUp.sides.map((side) => side.participantId).filter(Boolean));
    }, []),
  );

  const participantIdMatchUps = Object.assign(
    {},
    ...participantIds.map((participantId) => {
      const matchUps = allMatchUps.filter((matchUp) => {
        const participantIds = matchUp.sides.map((side) => side.participantId).filter(Boolean);
        return participantIds.includes(participantId);
      });
      return { [participantId]: matchUps };
    }),
  );

  return { participantIds, participantIdMatchUps };
}
