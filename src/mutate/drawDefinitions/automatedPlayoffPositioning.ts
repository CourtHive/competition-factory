import { getMinFinishingPositionRange } from '@Functions/sorters/structureSort';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { getPlayoffStructures } from '@Query/structure/structureGetter';
import { automatedPositioning } from './automatedPositioning';

// Constants and types
import { DRAW_DEFINITION_NOT_FOUND, ErrorType, INCOMPLETE_SOURCE_STRUCTURE } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { SeedingProfile } from '@Types/factoryTypes';

type StructurePositionAssignmentType = {
  positionAssignments: PositionAssignment[];
  structureId: string;
};

type AutomatedPlayoffPositioningArgs = {
  provisionalPositioning?: boolean;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  applyPositioning?: boolean;
  random?: () => number;
  structureId: string;
  placeByes?: boolean;
  seedsOnly?: boolean;
  event?: Event;
};
export function automatedPlayoffPositioning(params: AutomatedPlayoffPositioningArgs): {
  structurePositionAssignments?: StructurePositionAssignmentType[];
  positioningReports?: { [key: string]: any }[];
  success?: boolean;
  error?: ErrorType;
} {
  const {
    applyPositioning = true,
    provisionalPositioning,
    tournamentRecord,
    drawDefinition,
    seedingProfile,
    structureId,
    placeByes,
    seedsOnly,
    random,
  } = params;

  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  const structureIsComplete = isCompletedStructure({
    drawDefinition,
    structureId,
  });
  if (!structureIsComplete && !provisionalPositioning) {
    return { error: INCOMPLETE_SOURCE_STRUCTURE };
  }

  const playoffStructures = getPlayoffStructures({
    drawDefinition,
    structureId,
  }).playoffStructures?.sort((a, b) => getMinFinishingPositionRange(a) - getMinFinishingPositionRange(b));
  const structurePositionAssignments: StructurePositionAssignmentType[] = [];

  const positioningReports: { [key: string]: any }[] = [];

  if (playoffStructures) {
    for (const structure of playoffStructures) {
      const { structureId: playoffStructureId } = structure;
      const result = automatedPositioning({
        structureId: playoffStructureId,
        provisionalPositioning,
        applyPositioning,
        tournamentRecord,
        drawDefinition,
        seedingProfile,
        placeByes,
        seedsOnly,
        random,
      });

      if (result.error) return result;

      if (result.positionAssignments) {
        structurePositionAssignments.push({
          positionAssignments: result.positionAssignments,
          structureId: playoffStructureId,
        });
      }
      if (result.positioningReport) positioningReports.push(result.positioningReport);
    }
  }

  return { ...SUCCESS, structurePositionAssignments, positioningReports };
}
