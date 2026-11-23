import { disableNotifications, enableNotifications } from '@Global/state/globalState';
import { automatedPositioning, positionStructure } from './automatedPositioning';
import { getMinFinishingPositionRange } from '@Functions/sorters/structureSort';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { composeThenWrite, isStoredDraw } from '@Tools/composeThenWrite';
import { getPlayoffStructures } from '@Query/structure/structureGetter';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
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
type PlayoffPositioningResult = {
  structurePositionAssignments?: StructurePositionAssignmentType[];
  positioningReports?: { [key: string]: any }[];
  success?: boolean;
  error?: ErrorType;
};

export function automatedPlayoffPositioning(params: AutomatedPlayoffPositioningArgs): PlayoffPositioningResult {
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

  const playoffArgs = { provisionalPositioning, tournamentRecord, seedingProfile, structureId, placeByes, seedsOnly };

  // a preview: each structure positioned on its own copy, the stored draw unwritten (as it always was)
  if (!applyPositioning) {
    const preview = (args: AutomatedPositioningArgs) => automatedPositioning({ ...args, applyPositioning: false });
    return positionPlayoffs({ ...playoffArgs, drawDefinition, random, placeStructure: preview });
  }

  // a draw still being generated is not in the record: a refusal discards it whole
  if (!isStoredDraw({ tournamentRecord, drawDefinition })) {
    return positionPlayoffs({ ...playoffArgs, drawDefinition, random, placeStructure: positionStructure });
  }

  // COMPOSE, THEN WRITE. Positioning one playoff structure changes what the next is positioned from (the
  // Championship's placements change the Consolation's stage entries and seed proxies), so the playoffs are
  // composed together, in order, on ONE working copy of the draw. A refusal of any of them is returned with
  // the stored draw unwritten; only playoffs that composed are written, making the same choices.
  return composeThenWrite({
    compose: (random) => {
      const workingCopy = makeDeepCopy(drawDefinition, false, true);
      disableNotifications();
      try {
        return positionPlayoffs({
          ...playoffArgs,
          drawDefinition: workingCopy,
          random,
          placeStructure: positionStructure,
        });
      } finally {
        enableNotifications();
      }
    },
    write: (random) => positionPlayoffs({ ...playoffArgs, drawDefinition, random, placeStructure: positionStructure }),
    random,
  });
}

type AutomatedPositioningArgs = Parameters<typeof positionStructure>[0];

type PositionPlayoffsArgs = {
  placeStructure: (args: AutomatedPositioningArgs) => ReturnType<typeof positionStructure>;
  provisionalPositioning?: boolean;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  random?: () => number;
  structureId: string;
  placeByes?: boolean;
  seedsOnly?: boolean;
};

function positionPlayoffs({
  placeStructure,
  drawDefinition,
  structureId,
  ...args
}: PositionPlayoffsArgs): PlayoffPositioningResult {
  const playoffStructures = getPlayoffStructures({
    drawDefinition,
    structureId,
  }).playoffStructures?.sort((a, b) => getMinFinishingPositionRange(a) - getMinFinishingPositionRange(b));
  const structurePositionAssignments: StructurePositionAssignmentType[] = [];

  const positioningReports: { [key: string]: any }[] = [];

  for (const structure of playoffStructures ?? []) {
    // an AD_HOC playoff has no drawPositions; its participants are paired, not positioned
    if (isAdHoc({ structure })) continue;
    const { structureId: playoffStructureId } = structure;
    const result = placeStructure({ ...args, structureId: playoffStructureId, drawDefinition });

    if (result.error) return result;

    if (result.positionAssignments) {
      structurePositionAssignments.push({
        positionAssignments: result.positionAssignments,
        structureId: playoffStructureId,
      });
    }
    if (result.positioningReport) positioningReports.push(result.positioningReport);
  }

  return { ...SUCCESS, structurePositionAssignments, positioningReports };
}
