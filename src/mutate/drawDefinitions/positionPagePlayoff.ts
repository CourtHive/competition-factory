import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { getParticipantId } from '@Functions/global/extractors';
import { shuffleArray } from '@Tools/arrays';
import { numericSort } from '@Tools/sorting';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type PositionPagePlayoffArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  random?: () => number;
  seedsOnly?: boolean;
  event?: Event;
};

// A PAGE_PLAYOFF's four entrants enter two structures: Qualifier 1 (MAIN stageSequence 1) takes the
// top two seeds and the Eliminator (MAIN stageSequence 2) the other two. Generic positioning sees all
// four entries for each two-position structure, so the entrants are divided here.
export function positionPagePlayoff({
  tournamentRecord,
  drawDefinition,
  seedsOnly,
  random,
  event,
}: PositionPagePlayoffArgs): ResultType {
  const mainStructures = drawDefinition.structures?.filter(({ stage }) => stage === MAIN) ?? [];
  const qualifierOne = mainStructures.find(({ stageSequence }) => stageSequence === 1);
  const eliminator = mainStructures.find(({ stageSequence }) => stageSequence === 2);
  if (!qualifierOne || !eliminator) return { error: STRUCTURE_NOT_FOUND };

  const entries = getStageEntries({ entryStatuses: DIRECT_ENTRY_STATUSES, drawDefinition, stage: MAIN });
  const enteredIds = entries.map(getParticipantId);

  const seededIds = (qualifierOne.seedAssignments ?? [])
    .filter(({ participantId }) => participantId && enteredIds.includes(participantId))
    .sort((a, b) => numericSort(a.seedNumber, b.seedNumber))
    .map(getParticipantId)
    .slice(0, 2);
  const unseededIds = seedsOnly
    ? []
    : shuffleArray(
        enteredIds.filter((id) => !seededIds.includes(id)),
        random,
      );
  const orderedIds = [...seededIds, ...unseededIds];

  const placements = [
    { structureId: qualifierOne.structureId, participantIds: orderedIds.slice(0, 2) },
    { structureId: eliminator.structureId, participantIds: orderedIds.slice(2, 4) },
  ];

  for (const { structureId, participantIds } of placements) {
    for (const [index, participantId] of participantIds.entries()) {
      const result = assignDrawPosition({
        drawPosition: index + 1,
        tournamentRecord,
        drawDefinition,
        participantId,
        structureId,
        event,
      });
      if (result.error) return result;
    }
  }

  return { ...SUCCESS };
}
