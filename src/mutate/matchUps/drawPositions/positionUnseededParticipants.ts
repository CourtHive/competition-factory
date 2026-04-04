import { randomUnseededSeparation } from '@Mutate/drawDefinitions/positionGovernor/randomUnseededSeparation';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';
import { shuffleArray } from '@Tools/arrays';

// constants
import { INSUFFICIENT_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { PLAY_OFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function positionUnseededParticipants({
  provisionalPositioning,
  inContextDrawMatchUps,
  unseededByePositions,
  multipleStructures,
  tournamentRecord,
  drawDefinition,
  seedBlockInfo,
  participants,
  matchUpsMap,
  structureId,
  structure,
  drawSize,
  event,
  random,
}) {
  const stack = 'positionUnseededParticipants';

  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));
  if (!structureId) ({ structureId } = structure);

  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const { seedAssignments } = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structure,
  });

  const assignedSeedParticipantIds = seedAssignments?.map((assignment) => assignment.participantId).filter(Boolean);

  const { stage, stageSequence } = structure;

  const roundTarget =
    stage === QUALIFYING ? findExtension({ element: structure, name: ROUND_TARGET })?.extension?.value : undefined;

  const entryStatuses = DIRECT_ENTRY_STATUSES;
  const entries = getStageEntries({
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    entryStatuses,
    structureId,
    roundTarget,
    stage,
  });
  const unseededEntries = entries.filter((entry) => !assignedSeedParticipantIds?.includes(entry.participantId));
  const unseededParticipantIds = unseededEntries.map((entry) => entry.participantId);
  const unfilledDrawPositions = positionAssignments
    ?.filter((assignment) => {
      return !assignment.participantId && !assignment.bye && !assignment.qualifier;
    })
    .map((assignment) => assignment.drawPosition);

  if (!multipleStructures && unseededParticipantIds.length > (unfilledDrawPositions?.length || 0)) {
    return decorateResult({
      result: { error: INSUFFICIENT_DRAW_POSITIONS },
      context: {
        unseededParticipantsCount: unseededParticipantIds.length,
        unfilledDrawPositionsCount: unfilledDrawPositions?.length,
      },
      stack,
    });
  }

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });
  let avoidance = appliedPolicies?.[POLICY_TYPE_AVOIDANCE];

  if (structure.stage === PLAY_OFF) {
    // generate avoidance policies automatically for Playoffs from Round Robin Groups
    const groupings = entries.reduce((groupings, entry) => {
      if (!groupings[entry.groupingValue]) groupings[entry.groupingValue] = [];
      groupings[entry.groupingValue].push(entry.participantId);
      return groupings;
    }, {});
    if (Object.keys(groupings).length) {
      avoidance ??= { policyName: 'Playoff Avoidance' };
      avoidance.policyAttributes ??= [];
      avoidance.policyAttributes.push({ groupings });
    }
  }

  if (avoidance && participants) {
    return randomUnseededSeparation({
      provisionalPositioning,
      unseededParticipantIds,
      inContextDrawMatchUps,
      unseededByePositions,
      tournamentRecord,
      drawDefinition,
      seedBlockInfo,
      participants,
      matchUpsMap,
      structureId,
      avoidance,
      drawSize,
      entries,
      random,
    });
  } else {
    return randomUnseededDistribution({
      provisionalPositioning,
      unseededParticipantIds,
      inContextDrawMatchUps,
      unfilledDrawPositions,
      multipleStructures,
      tournamentRecord,
      drawDefinition,
      seedBlockInfo,
      structureId,
      matchUpsMap,
      drawSize,
      event,
      random,
    });
  }
}

function randomUnseededDistribution({
  provisionalPositioning,
  unseededParticipantIds,
  inContextDrawMatchUps,
  unfilledDrawPositions,
  multipleStructures,
  tournamentRecord,
  drawDefinition,
  seedBlockInfo,
  matchUpsMap,
  structureId,
  drawSize,
  event,
  random,
}) {
  // when { drawSize: 2 } reverse the order so that popping results in equivalent order
  const shuffledDrawPositions =
    drawSize > 2 ? shuffleArray(unfilledDrawPositions, random) : unfilledDrawPositions.reverse();

  for (const participantId of unseededParticipantIds) {
    const drawPosition = shuffledDrawPositions.pop();
    if (!multipleStructures || drawPosition) {
      const result = assignDrawPosition({
        provisionalPositioning,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        seedBlockInfo,
        participantId,
        drawPosition,
        matchUpsMap,
        structureId,
        event,
      });
      if (result?.error) console.log('!!!!!', { result });
      if (result?.error) return decorateResult({ result, stack: 'randomUnseededDistribution' });
    }
  }
  return { ...SUCCESS };
}
