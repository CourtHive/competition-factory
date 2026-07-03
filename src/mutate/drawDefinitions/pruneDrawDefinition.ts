import { deleteMatchUpsNotice, modifyDrawNotice } from '../notifications/drawNotifications';
import { analyzeDraws } from '@Query/tournaments/analyzeDraws';
import { getMatchUpId } from '@Functions/global/extractors';
import { getDrawStructures } from '@Acquire/findStructure';

import { MISSING_DRAW_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUp } from '@Types/tournamentTypes';

export function pruneDrawDefinition({
  matchPlayDrawPositions = true, // when simply extracting matchUps for aggregation, drawPositions are unnecessary
  tournamentRecord,
  drawDefinition,
  drawId,
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  let relevantMatchUps: MatchUp[] = [];

  const { drawsAnalysis } = analyzeDraws({ tournamentRecord });
  if (drawsAnalysis.canBePruned.includes(drawId)) {
    const isMatchPlay = drawsAnalysis.matchPlay.includes(drawId);
    const drawAnalysis = drawsAnalysis.drawAnalysis[drawId];
    const {
      structures: [mainStructure],
    } = getDrawStructures({
      stageSequence: 1,
      drawDefinition,
      stage: MAIN,
    });

    const structureData = drawAnalysis.structuresData.find(
      ({ structureId }) => mainStructure.structureId === structureId,
    );

    const matchUps = (mainStructure.matchUps ?? []).toSorted((a: any, b: any) => a.roundPosition - b.roundPosition);
    relevantMatchUps = matchUps.filter(({ roundNumber }) => !structureData.inactiveRounds.includes(roundNumber));
    const relevantMatchUpIds = relevantMatchUps.map(getMatchUpId);
    const deletedMatchUpIds = matchUps.map(getMatchUpId).filter((matchUpId) => !relevantMatchUpIds.includes(matchUpId));

    // only ifMatchPlay can the positionAssignments be reallocated
    if (isMatchPlay) {
      const matchPlayMatchUps = relevantMatchUps
        .filter(({ roundNumber }) => !structureData.inactiveRounds.includes(roundNumber))
        .filter(({ winningSide }) => winningSide);

      const matchPlayMatchUpIds = matchPlayMatchUps.map(getMatchUpId);
      const matchUpIdsToDelete = relevantMatchUpIds.filter((matchUpId) => !matchPlayMatchUpIds.includes(matchUpId));
      deletedMatchUpIds.push(...matchUpIdsToDelete);

      const existingDrawPositionPairings = matchPlayMatchUps
        .flatMap((matchUp) => matchUp.drawPositions ?? [])
        .filter(Boolean);
      const existingDrawPositions: number[] = existingDrawPositionPairings.flat();
      const drawPositionsMap = Object.assign(
        {},
        ...existingDrawPositions.map((drawPosition, i) => ({
          [drawPosition]: i + 1,
        })),
      );

      matchPlayMatchUps.forEach((matchUp: any) => {
        if (matchPlayDrawPositions) {
          matchUp.drawPositions = matchUp.drawPositions.map((drawPosition) => drawPositionsMap[drawPosition]);
        } else {
          delete matchUp.drawPositions;
        }
      });

      if (matchPlayDrawPositions) {
        const updatedPositionAssignments = mainStructure?.positionAssignments
          ?.filter((assignment) => existingDrawPositions.includes(assignment.drawPosition))
          .map((assignment) => {
            assignment.drawPosition = drawPositionsMap[assignment.drawPosition];
            return assignment;
          });

        mainStructure.positionAssignments = updatedPositionAssignments;
      } else {
        mainStructure.positionAssignments = [];
      }
      mainStructure.matchUps = matchPlayMatchUps;
      relevantMatchUps = matchPlayMatchUps;
    }

    deleteMatchUpsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUpIds: deletedMatchUpIds,
      drawDefinition,
    });
    modifyDrawNotice({ drawDefinition });
  }

  return { ...SUCCESS, matchUps: relevantMatchUps };
}
