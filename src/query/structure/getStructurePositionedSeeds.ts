import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { getStructureSeedAssignments } from './getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '../drawDefinition/positionsGetter';

type GetStructurePositionedSeeds = {
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  structure: Structure;
};
export function getStructurePositionedSeeds({
  provisionalPositioning,
  drawDefinition,
  structure,
}: GetStructurePositionedSeeds) {
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const { seedAssignments } = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structure,
  });
  const seedMap = Object.assign(
    {},
    ...(seedAssignments ?? [])
      .filter((assignment) => assignment.participantId)
      .map((assignment: any) => ({
        // because we already know participantId is present!
        [assignment.participantId]: assignment,
      })),
  );
  return positionAssignments
    ?.map((assignment: any) => {
      return !seedMap[assignment.participantId]
        ? ''
        : {
            ...assignment,
            seedNumber: seedMap[assignment.participantId].seedNumber,
            seedValue: seedMap[assignment.participantId].seedValue,
          };
    })
    .filter(Boolean);
}
