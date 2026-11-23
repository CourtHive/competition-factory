import { withdrawArrivalFrom } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import type { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';

/**
 * A BYE ORIGIN GOES WITH ITS FEEDER'S DELIVERY. The `{ BYE, BYE }` pair names a BYE matchUp that has delivered: a seat
 * held by a BYE and the other by a participant (`deliveredStatus`, F3). It is written once that participant arrives, and
 * nothing took it back when they left again, so a cleared result whose loser sat opposite a BYE left the side the BYE
 * feeds naming a feeder that now sends nobody (census A1 wave 3 G1b, 9 rows: FIRST_ROUND_LOSER_CONSOLATION 16/14
 * 21029590 `Consolation|2|1`, COMPASS 16 21132642 `West|2|1` and 21146515 `West|2|2`, FIRST_MATCH_LOSER_CONSOLATION
 * 16/11 21080472 `Consolation|3|1`; `aByeOriginGoesWhenItsFeederSeatEmpties`). The position itself stays advanced past
 * the BYE, so no release reaches the matchUp holding the pair: it is asked here, of every BYE matchUp in `structureId`
 * that holds one of `clearedDrawPositions`. A BYE claim on the same side stays (`withdrawArrivalFrom`).
 */
export function withdrawUndeliveredByeOrigins({
  clearedDrawPositions,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  structureId,
  event,
}: {
  positionAssignments: PositionAssignment[];
  clearedDrawPositions: number[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structureId: string;
  event?: Event;
}) {
  if (!clearedDrawPositions.length) return;
  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const filled = (drawPosition: number) =>
    positionAssignments.some(
      (assignment) => assignment.drawPosition === drawPosition && (assignment.bye || assignment.participantId),
    );
  const feeders = (resolvedMap?.mappedMatchUps?.[structureId]?.matchUps ?? []).filter(
    (matchUp) =>
      matchUp.matchUpStatus === BYE &&
      matchUp.drawPositions?.some((drawPosition) => clearedDrawPositions.includes(drawPosition)) &&
      (matchUp.drawPositions ?? []).filter((drawPosition) => drawPosition && filled(drawPosition)).length < 2,
  );
  if (!feeders.length) return;
  const feederIds = new Set(feeders.map(({ matchUpId }) => matchUpId));

  for (const matchUp of resolvedMap?.drawMatchUps ?? []) {
    const provenance = matchUp.sideExitProvenance;
    const origins = ([1, 2] as const)
      .map((sideNumber) => provenance?.[sideNumber])
      .filter(
        (entry) =>
          entry?.matchUpStatus === BYE &&
          entry.previousMatchUpStatus === BYE &&
          !!entry.sourceMatchUpId &&
          feederIds.has(entry.sourceMatchUpId),
      )
      .map((entry) => entry?.sourceMatchUpId);
    if (!origins.length) continue;
    for (const sourceMatchUpId of origins) withdrawArrivalFrom({ sourceMatchUpId, matchUp });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'withdrawUndeliveredByeOrigins',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }
}
