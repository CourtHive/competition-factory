import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import { ResultType, TargetMatchUpId } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type RemapArgs = {
  targetMatchUpIds: TargetMatchUpId[];
  drawDefinition: DrawDefinition;
};

/**
 * Remap matchUpIds on a drawDefinition using targeted assignments.
 *
 * Each target specifies a matchUpId to assign and a location fingerprint
 * (roundNumber + roundPosition + optional stage/stageSequence/exitProfile/structureId).
 * MatchUps that don't match any target are left unchanged.
 *
 * Cross-references (winnerMatchUpId, loserMatchUpId) are updated to reflect
 * any remapped IDs. tieMatchUp IDs are also remapped when targeted.
 */
export function remapDrawDefinitionMatchUpIds({
  targetMatchUpIds,
  drawDefinition,
}: RemapArgs): ResultType & { remappedCount?: number } {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!Array.isArray(targetMatchUpIds) || !targetMatchUpIds.length) return { error: INVALID_VALUES };

  const { exitProfiles } = getExitProfiles({ drawDefinition });
  const structures = drawDefinition.structures ?? [];

  // Build a map of oldMatchUpId → newMatchUpId for cross-reference updates
  const idMap: Record<string, string> = {};
  let remappedCount = 0;

  for (const structure of structures) {
    const structureExitProfiles: string[] = exitProfiles?.[structure.structureId] ?? [];

    // Handle CONTAINER structures (round-robin groups)
    const childStructures = structuresOf(structure);
    if (childStructures?.length) {
      for (const childStructure of childStructures) {
        remappedCount += remapStructureMatchUps({
          exitProfiles: structureExitProfiles,
          structure: childStructure,
          parentStructure: structure,
          targetMatchUpIds,
          idMap,
        });
      }
    }

    // Handle direct matchUps on the structure
    remappedCount += remapStructureMatchUps({
      exitProfiles: structureExitProfiles,
      targetMatchUpIds,
      structure,
      idMap,
    });
  }

  // Update cross-references across all matchUps
  if (Object.keys(idMap).length) {
    for (const structure of structures) {
      updateCrossReferences(structure, idMap);
      for (const child of structuresOf(structure) ?? []) {
        updateCrossReferences(child, idMap);
      }
    }
  }

  return { ...SUCCESS, remappedCount };
}

function remapStructureMatchUps({
  parentStructure,
  targetMatchUpIds,
  exitProfiles,
  structure,
  idMap,
}: {
  parentStructure?: Structure;
  targetMatchUpIds: TargetMatchUpId[];
  exitProfiles: string[];
  structure: Structure;
  idMap: Record<string, string>;
}): number {
  let count = 0;
  const resolvedStage = parentStructure?.stage ?? structure.stage;
  const resolvedStageSequence = parentStructure?.stageSequence ?? structure.stageSequence;

  for (const matchUp of matchUpsOf(structure) ?? []) {
    const target = findTarget({
      stageSequence: resolvedStageSequence,
      roundPosition: matchUp.roundPosition,
      roundNumber: matchUp.roundNumber,
      structureId: structure.structureId,
      parentStructureId: parentStructure?.structureId,
      stage: resolvedStage,
      targetMatchUpIds,
      exitProfiles,
    });

    if (target && target.matchUpId !== matchUp.matchUpId) {
      idMap[matchUp.matchUpId] = target.matchUpId;
      matchUp.matchUpId = target.matchUpId;
      count++;
    }

    // Remap tieMatchUps if targeted
    for (const tieMatchUp of matchUp.tieMatchUps ?? []) {
      const tieTarget = findTarget({
        stageSequence: resolvedStageSequence,
        roundPosition: tieMatchUp.roundPosition,
        roundNumber: tieMatchUp.roundNumber,
        structureId: structure.structureId,
        parentStructureId: parentStructure?.structureId,
        stage: resolvedStage,
        targetMatchUpIds,
        exitProfiles,
      });

      if (tieTarget && tieTarget.matchUpId !== tieMatchUp.matchUpId) {
        idMap[tieMatchUp.matchUpId] = tieTarget.matchUpId;
        tieMatchUp.matchUpId = tieTarget.matchUpId;
        count++;
      }
    }
  }

  return count;
}

function findTarget({
  parentStructureId,
  targetMatchUpIds,
  stageSequence,
  roundPosition,
  exitProfiles,
  structureId,
  roundNumber,
  stage,
}: {
  parentStructureId?: string;
  targetMatchUpIds: TargetMatchUpId[];
  stageSequence?: number;
  roundPosition?: number;
  exitProfiles: string[];
  structureId: string;
  roundNumber?: number;
  stage?: string;
}): TargetMatchUpId | undefined {
  return targetMatchUpIds.find((t) => {
    if (t.roundNumber !== roundNumber || t.roundPosition !== roundPosition) return false;

    // If structureId is specified, match against the structure or its parent (for RR groups)
    if (t.structureId) return t.structureId === structureId || t.structureId === parentStructureId;

    // If exitProfile is specified, check against computed profiles
    if (t.exitProfile) return exitProfiles.includes(t.exitProfile);

    // Match by stage/stageSequence
    if (t.stage && t.stage !== stage) return false;
    if (t.stageSequence && t.stageSequence !== stageSequence) return false;

    return true;
  });
}

function updateCrossReferences(structure: Structure, idMap: Record<string, string>): void {
  const updateMatchUp = (matchUp: MatchUp) => {
    if (matchUp.winnerMatchUpId && idMap[matchUp.winnerMatchUpId]) {
      matchUp.winnerMatchUpId = idMap[matchUp.winnerMatchUpId];
    }
    if (matchUp.loserMatchUpId && idMap[matchUp.loserMatchUpId]) {
      matchUp.loserMatchUpId = idMap[matchUp.loserMatchUpId];
    }
    for (const tie of matchUp.tieMatchUps ?? []) {
      updateMatchUp(tie);
    }
  };

  for (const matchUp of matchUpsOf(structure) ?? []) {
    updateMatchUp(matchUp);
  }
}
