import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { LUCKY_DRAW, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { POSITION_ACTIONS } from '@Constants/extensionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TimeItem } from '@Types/tournamentTypes';
import { HydratedSide } from '@Types/hydrated';
import {
  ASSIGN_COURT,
  ASSIGN_VENUE,
  ASSIGN_OFFICIAL,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  ALLOCATE_COURTS,
} from '@Constants/timeItemConstants';

export function resetDrawDefinition({ tournamentRecord, removeScheduling, removeAssignments, drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  // for matchups in all structures:
  // remove all drawPositions which are not first round or fed
  // remove all extensions
  // if removeScheudling, remove all scheduling timeItems

  // for all structures which are NOT QUALIFYING or MAIN { stageSequence: 1 }
  // remove all positionAssignments that are not BYE
  // if removeAssignments, also remove assignments from MAIN/QUALIFYING stageSequence 1

  const isLuckyDraw = drawDefinition.drawType === LUCKY_DRAW;
  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  const getRawMatchUp = (matchUpId) => matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  for (const structure of drawDefinition.structures || []) {
    const { positionAssignments, stage, stageSequence } = structure;

    const isMainOrQualifyingFirst = stageSequence === 1 && [QUALIFYING, MAIN].includes(stage);

    // Lucky draws: always remove virtual positions created by luckyDrawAdvancement
    // regardless of isMainOrQualifyingFirst, since they're not part of the initial draw.
    if (isLuckyDraw && positionAssignments) {
      const initialDrawPositions = new Set(
        (structure.matchUps || [])
          .filter((m: any) => m.roundNumber === 1)
          .flatMap((m: any) => m.drawPositions || [])
          .filter(Boolean),
      );
      structure.positionAssignments = positionAssignments.filter(
        (a) => initialDrawPositions.has(a.drawPosition) && !a.bye,
      );
      if (removeAssignments) {
        for (const a of structure.positionAssignments) {
          if (!a.bye) delete a.participantId;
        }
        structure.seedAssignments = [];
      }
    }
    // Standard draws: reset positionAssignments where appropriate
    else if (positionAssignments && (!isMainOrQualifyingFirst || removeAssignments)) {
      structure.positionAssignments = positionAssignments.map((assignment) => {
        delete assignment.participantId;
        return assignment;
      });
      structure.seedAssignments = [];
    }

    const { matchUps: inContextMatchUps, isRoundRobin } = getAllStructureMatchUps({
      afterRecoveryTimes: false,
      inContext: true,
      matchUpsMap,
      structure,
    });

    // reset all matchUps to initial state
    for (const inContextMatchUp of inContextMatchUps) {
      const { matchUpId, roundNumber } = inContextMatchUp;
      const sides: HydratedSide[] = inContextMatchUp.sides || [];
      const matchUp = getRawMatchUp(matchUpId);
      if (matchUp) {
        delete matchUp.extensions;
        delete matchUp.notes;

        if (isLuckyDraw) {
          // Lucky draws: reset ALL matchUps (including R1 BYE — the BYE positionAssignment
          // is removed, so the matchUp must also be reset to TO_BE_PLAYED).
          // R2+ matchUps lose all drawPositions (they're virtual from luckyDrawAdvancement).
          Object.assign(matchUp, toBePlayed);
          if (roundNumber && roundNumber > 1) {
            matchUp.drawPositions = [];
          }
        } else {
          if (matchUp.matchUpStatus !== BYE) Object.assign(matchUp, toBePlayed);
          if (roundNumber && roundNumber > 1 && matchUp.drawPositions?.length && !isRoundRobin) {
            const fedDrawPositions = sides
              ?.map(({ drawPosition, participantFed }) => !participantFed && drawPosition)
              .filter(Boolean);
            const drawPositions = matchUp.drawPositions.map((drawPosition) =>
              fedDrawPositions.includes(drawPosition) ? undefined : drawPosition,
            ) as number[];
            matchUp.drawPositions = drawPositions;
          }
        }

        if (removeScheduling) {
          delete matchUp.timeItems;
        } else if (matchUp.timeItems?.length) {
          matchUp.timeItems = matchUp.timeItems.filter(
            (timeItem: TimeItem) =>
              timeItem.itemType &&
              ![ALLOCATE_COURTS, ASSIGN_COURT, ASSIGN_VENUE, ASSIGN_OFFICIAL, SCHEDULED_DATE, SCHEDULED_TIME].includes(
                timeItem.itemType,
              ),
          );
        }

        modifyMatchUpNotice({
          tournamentId: tournamentRecord?.tournamentId,
          context: 'resetDrawDefiniton',
          drawDefinition,
          matchUp,
        });
      }
    }
  }

  drawDefinition.extensions = drawDefinition.extensions.filter((extension) => extension.name !== POSITION_ACTIONS);

  const structureIds = (drawDefinition.structures || []).map(({ structureId }) => structureId);

  modifyDrawNotice({ drawDefinition, structureIds });

  return { ...SUCCESS };
}
