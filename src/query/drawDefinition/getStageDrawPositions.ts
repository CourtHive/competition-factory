// Query
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';
import { getEntryProfileQualifiersCount } from './getEntryProfileQualifiers';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { getQualifiersCount } from './getQualifiersCount';

// constants
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type GetStageDrawPositionsCountArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  stageSequence?: number;
  stage?: string;
  event?: Event;
};

/**
 * Where a stage's draw positions count came from: the generated structures, or — before any exist,
 * MAIN only — the event's `entryProfile.targetDrawSize`, then the sanctioning constraints extension.
 */
export type DrawPositionsBasis = 'STRUCTURE' | 'TARGET_DRAW_SIZE' | 'SANCTIONING_CONSTRAINTS' | 'NONE';

/** where a stage's qualifier positions came from: the structure's links, or the event's `entryProfile` */
export type QualifierPositionsBasis = 'STRUCTURE' | 'ENTRY_PROFILE' | 'NONE';

export function getStageDrawPositionsSource({
  stage,
  drawDefinition,
  stageSequence,
  tournamentRecord,
  event,
}: GetStageDrawPositionsCountArgs): { drawPositions: number; basis: DrawPositionsBasis } {
  const structures = drawDefinition?.structures?.filter(
    (s) => s.stage === stage && (!stageSequence || s.stageSequence === stageSequence),
  );

  if (structures?.length) {
    const drawPositions = structures.reduce((total: number, s) => {
      if (s.structureType === CONTAINER) {
        return (
          total + (s.structures?.reduce((sum: number, sub) => sum + (positionAssignmentsOf(sub)?.length ?? 0), 0) ?? 0)
        );
      }
      return total + (s.positionAssignments?.length ?? 0);
    }, 0);
    return { drawPositions, basis: 'STRUCTURE' };
  }

  if (stage === MAIN) {
    // No structures yet: the event's own statement of its intended draw size comes first
    const targetDrawSize = event?.entryProfile?.targetDrawSize;
    if (isPositiveInteger(targetDrawSize)) return { drawPositions: targetDrawSize, basis: 'TARGET_DRAW_SIZE' };

    // ...then the sanctioning constraints extension
    if (tournamentRecord) {
      const { constraints } = getDrawCompositionConstraints({ tournamentRecord, event });
      if (constraints?.drawSize) return { drawPositions: constraints.drawSize, basis: 'SANCTIONING_CONSTRAINTS' };
    }
  }

  return { drawPositions: 0, basis: 'NONE' };
}

export function getStageDrawPositionsCount(params: GetStageDrawPositionsCountArgs) {
  return getStageDrawPositionsSource(params).drawPositions;
}

/**
 * A stage's draw positions, the positions held for qualifiers, and the difference: the places open to
 * entries that do not come through qualifying. Qualifier positions are counted from the links into the
 * stage's structure; before that structure exists (MAIN only), from the event's `entryProfile`.
 */
export function getStageDrawPositionsBreakdown(
  params: GetStageDrawPositionsCountArgs & { provisionalPositioning?: boolean },
): {
  qualifierPositionsBasis: QualifierPositionsBasis;
  drawPositionsBasis: DrawPositionsBasis;
  qualifierPositions: number;
  positionsAvailable: number;
  drawPositions: number;
} {
  const { provisionalPositioning, drawDefinition, stageSequence, stage, tournamentRecord, event } = params;
  const { drawPositions, basis: drawPositionsBasis } = getStageDrawPositionsSource({
    tournamentRecord,
    drawDefinition,
    stageSequence,
    stage,
    event,
  });

  let qualifierPositions = 0;
  let qualifierPositionsBasis: QualifierPositionsBasis = 'NONE';

  if (drawPositionsBasis === 'STRUCTURE' && drawDefinition) {
    // Find the structureId for the target stage so getQualifiersCount can derive from links
    const targetStructure = drawDefinition.structures?.find(
      (s) => s.stage === stage && (!stageSequence || s.stageSequence === stageSequence),
    );
    const { qualifiersCount } = getQualifiersCount({
      structureId: targetStructure?.structureId,
      provisionalPositioning,
      drawDefinition,
      stageSequence,
      stage,
    });
    qualifierPositions = qualifiersCount ?? 0;
    if (qualifierPositions) qualifierPositionsBasis = 'STRUCTURE';
  } else if (stage === MAIN) {
    qualifierPositions = getEntryProfileQualifiersCount(event?.entryProfile);
    if (qualifierPositions) qualifierPositionsBasis = 'ENTRY_PROFILE';
  }

  return {
    positionsAvailable: drawPositions && drawPositions - qualifierPositions,
    qualifierPositionsBasis,
    drawPositionsBasis,
    qualifierPositions,
    drawPositions,
  };
}

// drawSize - qualifyingPositions
export function getStageDrawPositionsAvailable(
  params: GetStageDrawPositionsCountArgs & { drawDefinition: DrawDefinition; provisionalPositioning?: boolean },
) {
  return getStageDrawPositionsBreakdown(params).positionsAvailable;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
