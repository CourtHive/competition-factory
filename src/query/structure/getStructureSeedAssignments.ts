import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { ErrorType, MISSING_SEED_ASSIGNMENTS, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, SeedAssignment, StageTypeUnion, Structure } from '@Types/tournamentTypes';
import { PLAY_OFF } from '@Constants/drawDefinitionConstants';

type GetStructureSeedAssignmentsArgs = {
  provisionalPositioning?: boolean;
  drawDefinition?: DrawDefinition;
  returnAllProxies?: boolean;
  structure?: Structure;
  structureId?: string;
};

export function getStructureSeedAssignments({
  provisionalPositioning,
  returnAllProxies,
  drawDefinition,
  structureId,
  structure,
}: GetStructureSeedAssignmentsArgs): {
  seedAssignments?: SeedAssignment[];
  stageSequence?: number;
  stage?: StageTypeUnion;
  seedLimit?: number;
  error?: ErrorType;
} {
  let error,
    seedAssignments: SeedAssignment[] = [];

  if (!structure) {
    ({ structure, error } = findStructure({ drawDefinition, structureId }));
  }

  const positionAssignments = getPositionAssignments({
    structure,
  }).positionAssignments;

  if (error || !structure) return { seedAssignments: [], error: STRUCTURE_NOT_FOUND };

  if (!structureId) structureId = structure.structureId;

  const { stage, stageSequence } = structure;

  const isPlayoffStructure = stage === PLAY_OFF;
  const entries =
    isPlayoffStructure &&
    drawDefinition &&
    getStageEntries({
      provisionalPositioning,
      drawDefinition,
      stageSequence,
      structureId,
      stage,
    });

  const proxiedEntries = entries
    ? entries
        .filter((entry) => entry.placementGroup === 1)
        .sort((a, b) => {
          // GEMscore is used here because headToHead encounters are not relevant
          // when the participants are derived from more than one RR group
          return (a.GEMscore < b.GEMscore && 1) || (a.GEMscore > b.GEMscore && -1) || 0;
        })
        .map((entry, index) => {
          const seedNumber = index + 1;
          return {
            participantId: entry.participantId,
            seedValue: seedNumber,
            seedProxy: true, // flag so that proxy seeding information doesn't get used externally
            seedNumber,
          };
        })
    : [];

  const seedProxies = proxiedEntries?.slice(
    0,
    returnAllProxies ? proxiedEntries.length : positionAssignments.length / 2,
  );

  if (seedProxies.length) {
    // seedProxies are only found in PLAY_OFF when ROUND_ROBIN is MAIN stage
    seedAssignments = seedProxies;
  } else if (structure.seedAssignments) {
    seedAssignments = structure.seedAssignments;
  } else {
    error = MISSING_SEED_ASSIGNMENTS;
  }

  const seedLimit = structure.seedLimit ?? structure?.positionAssignments?.length;

  return {
    seedAssignments,
    stageSequence,
    seedLimit,
    stage,
    error,
  };
}
