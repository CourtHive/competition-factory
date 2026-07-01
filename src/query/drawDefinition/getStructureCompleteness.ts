// constants and types
import { DrawDefinition, Event, MatchUp, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// Completeness roll-up — the COMPANION to getStructureInconsistencies. Where the
// inconsistency checker asks "is the DECIDED state self-consistent?", this asks "what is
// still MISSING before the draw is fully populated and played?" — the question a manual
// position-assignment workflow or a third-party CODES reconstruction pipeline (IONSport,
// national-federation ingest) needs answered at a publish checkpoint.
//
// It is deliberately NOT part of the inconsistency result: an unassigned drawPosition or an
// unplayed matchUp is a valid in-progress state, not a defect. Only structures with something
// outstanding are returned; `complete` is true when nothing is outstanding across the scan.
//
// Read from STORED structure state (positionAssignments + structures[].matchUps), so it works
// on a hand-built drawDefinition without loading a tournament into the engine.

type UnplayedMatchUp = { matchUpId: string; roundNumber?: number; roundPosition?: number };

type StructureCompleteness = {
  structureId: string;
  structureName?: string;
  stage?: string;
  unassignedPositions: number[];
  unplayedMatchUps: UnplayedMatchUp[];
};

type GetStructureCompletenessArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  structureId?: string;
  event?: Event;
};

// A position is occupied by a participant, a bye, or a (still-pending) qualifier — anything
// else is an unassigned drawPosition awaiting placement.
function positionOccupied(assignment: PositionAssignment): boolean {
  return !!(assignment.participantId || assignment.bye || assignment.qualifier);
}

// A matchUp is resolved when it has a winningSide, is a BYE, or carries a completed status
// that resolves without a winner (double walkover/default, cancelled, abandoned, dead rubber).
function matchUpResolved(matchUp: MatchUp): boolean {
  return (
    !!matchUp.winningSide || matchUp.matchUpStatus === BYE || completedMatchUpStatuses.includes(matchUp.matchUpStatus)
  );
}

// Flatten the structure tree — round-robin CONTAINER nodes hold their groups in `structures[]`.
function collectStructures(structures: Structure[] | undefined, collected: Structure[]): void {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
}

export function getStructureCompleteness(params: GetStructureCompletenessArgs): ResultType & {
  complete?: boolean;
  completeness?: { unassignedPositionCount: number; unplayedMatchUpCount: number; structures: StructureCompleteness[] };
} {
  const { drawDefinition, structureId } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const allStructures: Structure[] = [];
  collectStructures(drawDefinition.structures, allStructures);

  const structures: StructureCompleteness[] = [];
  let unassignedPositionCount = 0;
  let unplayedMatchUpCount = 0;

  for (const structure of allStructures) {
    if (structureId && structure.structureId !== structureId) continue;

    const unassignedPositions = (structure.positionAssignments ?? [])
      .filter((assignment) => !positionOccupied(assignment))
      .map((assignment) => assignment.drawPosition)
      .sort((a, b) => a - b);

    const unplayedMatchUps: UnplayedMatchUp[] = ((structure.matchUps ?? []) as MatchUp[])
      .filter((matchUp) => !matchUp.collectionId && !matchUpResolved(matchUp))
      .map((matchUp) => ({
        matchUpId: matchUp.matchUpId,
        roundNumber: matchUp.roundNumber,
        roundPosition: matchUp.roundPosition,
      }));

    // only surface structures that actually have something outstanding
    if (!unassignedPositions.length && !unplayedMatchUps.length) continue;

    unassignedPositionCount += unassignedPositions.length;
    unplayedMatchUpCount += unplayedMatchUps.length;
    structures.push({
      structureId: structure.structureId,
      structureName: structure.structureName,
      stage: structure.stage,
      unassignedPositions,
      unplayedMatchUps,
    });
  }

  const complete = unassignedPositionCount === 0 && unplayedMatchUpCount === 0;
  return { ...SUCCESS, complete, completeness: { unassignedPositionCount, unplayedMatchUpCount, structures } };
}
