import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';

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
 * Each target is assigned to the FIRST matchUp, in draw structure order, that its fingerprint
 * matches; a target without a structure selector therefore lands in the first structure only.
 * MatchUps that don't match any target are left unchanged.
 *
 * The remap is refused (INVALID_VALUES, nothing written) when it would leave a matchUpId on more
 * than one matchUp: the same matchUpId in two targets, two targets resolving to one matchUp, or a
 * target matchUpId already held by a matchUp that is not being remapped.
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
  const candidates = collectCandidates(structures, exitProfiles);

  // Resolve every target before writing anything, so a refused remap leaves the draw untouched
  const assignments = new Map<MatchUp, string>();
  const targetIds = new Set<string>();
  for (const target of targetMatchUpIds) {
    if (targetIds.has(target.matchUpId)) {
      return { error: INVALID_VALUES, info: `matchUpId ${target.matchUpId} is targeted more than once` };
    }
    targetIds.add(target.matchUpId);

    const candidate = candidates.find((c) => targetMatches(target, c));
    if (!candidate) continue;
    if (assignments.has(candidate.matchUp)) {
      return {
        error: INVALID_VALUES,
        info: `targets ${target.matchUpId} and ${assignments.get(candidate.matchUp)} resolve to one matchUp`,
      };
    }
    assignments.set(candidate.matchUp, target.matchUpId);
  }

  for (const { matchUp } of candidates) {
    if (!assignments.has(matchUp) && targetIds.has(matchUp.matchUpId)) {
      return { error: INVALID_VALUES, info: `matchUpId ${matchUp.matchUpId} is already held by an untargeted matchUp` };
    }
  }

  // Build a map of oldMatchUpId → newMatchUpId for cross-reference updates
  const idMap: Record<string, string> = {};
  let remappedCount = 0;
  for (const [matchUp, matchUpId] of assignments) {
    if (matchUp.matchUpId === matchUpId) continue;
    idMap[matchUp.matchUpId] = matchUpId;
    matchUp.matchUpId = matchUpId;
    remappedCount++;
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

type Candidate = {
  parentStructureId?: string;
  exitProfiles: string[];
  stageSequence?: number;
  structureId: string;
  matchUp: MatchUp;
  stage?: string;
};

// Every remappable matchUp (tieMatchUps included) in draw structure order; RR group matchUps take
// the stage and stageSequence of their CONTAINER
function collectCandidates(structures: Structure[], exitProfiles?: Record<string, string[]>): Candidate[] {
  const candidates: Candidate[] = [];
  const addStructure = (structure: Structure, parentStructure?: Structure) => {
    const structureExitProfiles = exitProfiles?.[(parentStructure ?? structure).structureId] ?? [];
    const stage = parentStructure?.stage ?? structure.stage;
    const stageSequence = parentStructure?.stageSequence ?? structure.stageSequence;
    for (const matchUp of matchUpsOf(structure) ?? []) {
      for (const m of [matchUp, ...(matchUp.tieMatchUps ?? [])]) {
        candidates.push({
          parentStructureId: parentStructure?.structureId,
          exitProfiles: structureExitProfiles,
          structureId: structure.structureId,
          stageSequence,
          matchUp: m,
          stage,
        });
      }
    }
  };

  for (const structure of structures) {
    for (const childStructure of structuresOf(structure) ?? []) addStructure(childStructure, structure);
    addStructure(structure);
  }

  return candidates;
}

function targetMatches(t: TargetMatchUpId, c: Candidate): boolean {
  if (t.roundNumber !== c.matchUp.roundNumber || t.roundPosition !== c.matchUp.roundPosition) return false;

  // If structureId is specified, match against the structure or its parent (for RR groups)
  if (t.structureId) return t.structureId === c.structureId || t.structureId === c.parentStructureId;

  // If exitProfile is specified, check against computed profiles
  if (t.exitProfile) return c.exitProfiles.includes(t.exitProfile);

  // Match by stage/stageSequence
  if (t.stage && t.stage !== c.stage) return false;
  if (t.stageSequence && t.stageSequence !== c.stageSequence) return false;

  return true;
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
