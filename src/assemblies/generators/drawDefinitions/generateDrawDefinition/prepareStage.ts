import { getSeedsCountAndStageEntries, seeding } from '@Mutate/drawDefinitions/structureSeeding';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { positionPagePlayoff } from '@Mutate/drawDefinitions/positionPagePlayoff';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { getDrawStructures } from '@Acquire/findStructure';

// constants and types
import { MAIN, PAGE_PLAYOFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { Entry, PositionAssignment } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function prepareStage(params): ResultType & {
  positionAssignments?: PositionAssignment[];
  positioningReport?: any;
  stageEntries?: Entry[];
  structureId?: string;
  seedsCount?: number;
  conflicts?: any[];
} {
  const stack = 'prepareStage';

  const { drawDefinition } = params;
  const { structures } = getDrawStructures({
    stageSequence: params.stageSequence || 1,
    roundTarget: params.roundTarget,
    stage: params.stage,
    drawDefinition,
  });

  const preparedStructureIds: string[] = params.preparedStructureIds ?? [];
  const structure = structures?.find(({ structureId }) => !preparedStructureIds.includes(structureId));
  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });
  const structureId = structure?.structureId;

  const { seedsCount, stageEntries, seedLimit } = getSeedsCountAndStageEntries({ ...params, structureId });
  if (params.seededParticipants || params.event || params.seedingScaleName) {
    seeding({ ...params, seedsCount, structure, structureId });
  }

  // a MAIN generated before its entries is a shell: nothing is placed, qualifier seats included, until its
  // positioning is generated (CA, 2026-10-09: "the slots for qualifiers shouldn't be reserved in advance at all,
  // those qualifying placeholders or the qualifiers themselves get placed when the draw positioning is generated")
  const awaitingEntries = params.stage === MAIN && !stageEntries.length;
  // a bare qualifiersCount, with no qualifying structure or placeholder link to record it, is recorded only by the
  // qualifier seats it places: those are placed, and nothing else
  const { qualifiersCount: linkedQualifiersCount = 0 } = getQualifiersCount({
    stageSequence: structure.stageSequence,
    stage: structure.stage,
    drawDefinition,
    structureId,
  });
  const unrecordedQualifiers = awaitingEntries && (params.qualifiersCount ?? 0) > linkedQualifiersCount;
  const doPositioning =
    params.automated !== false &&
    (!awaitingEntries || unrecordedQualifiers) &&
    !isAdHocType(params.drawType) &&
    !(params.qualifyingOnly && params.stage !== QUALIFYING);
  const multipleStructures = (structures?.length || 0) > 1;
  const placeByes = unrecordedQualifiers ? false : params.placeByes;
  const positioningResult = doPositioning
    ? positioning({ ...params, multipleStructures, placeByes, seedLimit, structureId })
    : {};
  if (positioningResult?.error) return decorateResult({ result: positioningResult, stack });

  // For ad-hoc/Swiss draws where full positioning is skipped, still mark qualifier positions
  const structurePositionAssignments = positionAssignmentsOf(structure);
  if (!doPositioning && isAdHocType(params.drawType) && structurePositionAssignments?.length) {
    const qualifiersCount = params.qualifiersCount || 0;
    if (qualifiersCount > 0) {
      const unfilled = structurePositionAssignments.filter((a) => !a.participantId && !a.qualifier && !a.bye);
      for (let i = 0; i < qualifiersCount && i < unfilled.length; i++) {
        unfilled[i].qualifier = true;
      }
    }
  }

  return {
    ...positioningResult,
    stageEntries,
    structureId,
    seedsCount,
  };
}

function positioning(
  params,
): ResultType & { conflicts?: any[]; positionAssignments?: PositionAssignment[]; positioningReport?: any } {
  const seedsOnly = typeof params.automated === 'object' && params.automated.seedsOnly;
  if (params.drawType === PAGE_PLAYOFF) return positionPagePlayoff({ ...params, seedsOnly });
  // if { seedsOnly: true } then only seeds and an Byes releated to seeded positions are placed
  const result = automatedPositioning({ ...params, seedsOnly });
  if (result.error) return result;

  const positionAssignments = result?.positionAssignments;
  const positioningReport = result?.positioningReport;

  return { conflicts: result.conflicts, positionAssignments, positioningReport };
}
