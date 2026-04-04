import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { processPlayoffGroups } from './drawTypes/processPlayoffGroups';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpId } from '@Functions/global/extractors';
import { findExtension } from '@Acquire/findExtension';
import { generateTieMatchUps } from './tieMatchUps';

// Constants
import { INCOMPLETE_SOURCE_STRUCTURE, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TALLY } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function generateAndPopulateRRplayoffStructures(params) {
  const stack = 'generateAndPopulateRRplayoffStructures';
  if (!params.playoffGroups) {
    return decorateResult({
      result: { error: MISSING_VALUE },
      info: 'playoffGroups required',
      stack,
    });
  }
  const {
    sourceStructureId,
    requireSequential,
    tournamentRecord,
    drawDefinition,
    playoffGroups,
    groupCount,
    groupSize,
    event,
  } = params;

  const processResult = processPlayoffGroups({
    requireSequential,
    sourceStructureId,
    playoffGroups,
    groupCount,
    groupSize,
    ...params,
  });

  if (processResult.error) return decorateResult({ result: processResult, stack });

  const {
    structures: playoffStructures = [],
    links: playoffLinks = [],
    finishingPositionTargets,
    positionRangeMap,
  } = processResult;

  const positionsPlayedOff = finishingPositionTargets
    ?.flatMap(({ finishingPositions }) => finishingPositions)
    .flatMap((finishingPosition) => positionRangeMap[finishingPosition].finishingPositions);

  drawDefinition.structures.push(...playoffStructures);
  drawDefinition.links.push(...playoffLinks);

  const { matchUps: inContextDrawMatchUps, matchUpsMap } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
  });

  const newStructureIds = new Set(playoffStructures.map(({ structureId }) => structureId));
  const addedMatchUpIds = inContextDrawMatchUps
    ?.filter(({ structureId }) => newStructureIds.has(structureId))
    .map(getMatchUpId);

  const addedMatchUps = matchUpsMap?.drawMatchUps?.filter(({ matchUpId }) => addedMatchUpIds?.includes(matchUpId));

  if (addedMatchUps?.length) {
    const tieFormat = resolveTieFormat({ drawDefinition, event })?.tieFormat;

    if (tieFormat) {
      addedMatchUps.forEach((matchUp) => {
        const { tieMatchUps } = generateTieMatchUps({ isMock: params.isMock, tieFormat, matchUp });
        Object.assign(matchUp, { tieMatchUps, matchUpType: TEAM_MATCHUP });
      });
    }
  }

  // OPTIONALLY: populate positionAssignments for newly generated structures

  const { positionAssignments } = getPositionAssignments({
    structureId: sourceStructureId,
    drawDefinition,
  });
  const finishingPositionParticipantIds = {};
  positionAssignments?.forEach((assignment) => {
    const result = findExtension({
      element: assignment,
      name: TALLY,
    });
    const participantResult = result?.extension?.value;
    const groupOrder = participantResult?.groupOrder;
    if (groupOrder) {
      if (!finishingPositionParticipantIds[groupOrder]) finishingPositionParticipantIds[groupOrder] = [];
      finishingPositionParticipantIds[groupOrder].push(assignment.participantId);
    }
  });

  /*
   *finishingPositionTargets.forEach((target) => {
   *  const { finishingPositions, structureId } = target;
   *  const participantIds = finishingPositions
   *    .flatMap((position) => finishingPositionParticipantIds[position] ?? [])
   *    .sort();
   *  console.log({ structureId, participantIds });
   *  const stageEntries = getStageEntries({
   *    drawDefinition,
   *    structureId,
   *    stage: 'PLAY_OFF',
   *  });
   *  console.log(stageEntries.map((p) => p.participantId).sort());
   *});
   */

  const result = automatedPlayoffPositioning({
    provisionalPositioning: params.provisionalPositioning,
    structureId: sourceStructureId,
    applyPositioning: true,
    event: params.event,
    tournamentRecord,
    drawDefinition,
  });

  // attempt automated positioning but fail silently if source structure is incomplete
  if (result.error && result.error?.code !== INCOMPLETE_SOURCE_STRUCTURE.code) {
    return decorateResult({ result, stack });
  }

  return {
    structures: playoffStructures,
    links: playoffLinks,
    positionsPlayedOff,
    drawDefinition,
    ...SUCCESS,
  };
}
