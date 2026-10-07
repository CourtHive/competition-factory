import { getStructureRoundProfile } from '@Query/structure/getStructureRoundProfile';
import { getLinkQualifiersCount } from './getQualifiersCount';
import { isValidForQualifying } from './isValidForQualifying';
import { getPositionAssignments } from './positionsGetter';
import { structuresOf } from '@Acquire/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { getStructureLinks } from './linkGetter';

// constants and types
import { MISSING_DRAW_DEFINITION, MISSING_STRUCTURE_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { LOSER, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

export type QualifyingTarget = {
  roundNumber: number;
  drawPositionsCount: number; // positions that ENTER the structure in this round
  unfilledPositionsCount: number; // of those, positions with neither participant nor bye
  qualifierPositionsCount: number; // of those, positions marked `qualifier` (reserved for qualifiers, link or no link)
  unplacedDirectEntriesCount: number; // round 1 only: direct entries in the draw not yet positioned
  feedingStructures: { structureId: string; structureName?: string; qualifiersCount: number; placeholder: boolean }[];
  promisedQualifiers: number; // sent into this round by real qualifying structures
  reservedQualifiers: number; // reserved by placeholder links (source round 0); a real structure consumes them
  structuralCapacity: number; // drawPositionsCount - promisedQualifiers: the rule attachQualifyingStructure enforces
  remainingCapacity: number; // unfilled - promised - unplaced direct entries: what the draw can hold as placed today
};

type GetAvailableQualifyingTargetsArgs = {
  drawDefinition: DrawDefinition;
  structureId: string;
};

/**
 * The rounds of a structure that qualifying structures may feed, with the room each one has.
 *
 * Several qualifying structures may feed the same round as long as the qualifiers they produce, in
 * aggregate, do not exceed the drawPositions that round has (CA, 2026-10-07). Round 1 is always a
 * candidate; a feed round is a candidate unless a LOSER link already fills it. The placement-state
 * numbers are reported so a client can show what already feeds a round and clamp its offer.
 */
export function getAvailableQualifyingTargets({
  drawDefinition,
  structureId,
}: GetAvailableQualifyingTargetsArgs): ResultType & { valid?: boolean; targets?: QualifyingTarget[] } {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };

  const structureResult = findStructure({ drawDefinition, structureId });
  if (structureResult.error) return structureResult;
  const structure = structureResult.structure as Structure;

  const { valid } = isValidForQualifying({ drawDefinition, structureId });
  const inbound: DrawLink[] = getStructureLinks({ drawDefinition, structureId }).links?.target ?? [];
  const loserFedRounds = new Set(
    inbound.filter((link) => link.linkType === LOSER).map((link) => link.target.roundNumber),
  );

  const positionAssignments = getPositionAssignments({ structure }).positionAssignments ?? [];
  const assignedParticipantIds = new Set(positionAssignments.map((pa) => pa.participantId).filter(Boolean));
  const unfilled = (drawPositions: number[]) =>
    positionAssignments.filter((pa) => drawPositions.includes(pa.drawPosition) && !pa.participantId && !pa.bye).length;
  const qualifierMarked = (drawPositions: number[]) =>
    positionAssignments.filter((pa) => drawPositions.includes(pa.drawPosition) && pa.qualifier).length;

  const stage = structure.stage;
  const unplacedDirectEntriesCount = (drawDefinition.entries ?? []).filter(
    (entry) =>
      (entry.entryStage ?? 'MAIN') === stage &&
      entry.entryStatus &&
      DIRECT_ENTRY_STATUSES.includes(entry.entryStatus) &&
      !assignedParticipantIds.has(entry.participantId),
  ).length;

  // drawPositions by the round in which they ENTER the structure
  const entryPositionsByRound: { [roundNumber: number]: number[] } = {};
  if (structuresOf(structure)) {
    entryPositionsByRound[1] = positionAssignments.map((pa) => pa.drawPosition);
  } else {
    const { roundProfile } = getStructureRoundProfile({ drawDefinition, structureId });
    const seen = new Set<number>();
    for (const roundNumber of Object.keys(roundProfile ?? {})
      .map(Number)
      .sort((a, b) => a - b)) {
      const drawPositions: number[] = (roundProfile?.[roundNumber]?.drawPositions ?? []).filter(
        (drawPosition) => drawPosition && !seen.has(drawPosition),
      );
      drawPositions.forEach((drawPosition) => seen.add(drawPosition));
      if (roundNumber === 1 || drawPositions.length) entryPositionsByRound[roundNumber] = drawPositions;
    }
    entryPositionsByRound[1] ??= [];
  }

  const targets: QualifyingTarget[] = Object.entries(entryPositionsByRound)
    .map(([round, drawPositions]) => ({ roundNumber: Number(round), drawPositions }))
    .filter(({ roundNumber }) => !loserFedRounds.has(roundNumber))
    .map(({ roundNumber, drawPositions }) => {
      const feedingLinks = inbound.filter(
        (link) =>
          link.linkType !== LOSER &&
          (link.target.roundNumber ?? 1) === roundNumber &&
          findStructure({ drawDefinition, structureId: link.source.structureId }).structure?.stage === QUALIFYING,
      );
      const feedingStructures = feedingLinks.map((link) => {
        const source = findStructure({ drawDefinition, structureId: link.source.structureId }).structure;
        return {
          qualifiersCount: getLinkQualifiersCount({ drawDefinition, link }),
          structureName: source?.structureName,
          structureId: link.source.structureId,
          placeholder: link.source.roundNumber === 0,
        };
      });
      const promisedQualifiers = feedingStructures
        .filter((f) => !f.placeholder)
        .reduce((sum, f) => sum + f.qualifiersCount, 0);
      const reservedQualifiers = feedingStructures
        .filter((f) => f.placeholder)
        .reduce((sum, f) => sum + f.qualifiersCount, 0);
      const unfilledPositionsCount = unfilled(drawPositions);
      const unplaced = roundNumber === 1 ? unplacedDirectEntriesCount : 0;
      return {
        remainingCapacity: Math.max(0, unfilledPositionsCount - promisedQualifiers - unplaced),
        structuralCapacity: Math.max(0, drawPositions.length - promisedQualifiers),
        qualifierPositionsCount: qualifierMarked(drawPositions),
        unplacedDirectEntriesCount: unplaced,
        drawPositionsCount: drawPositions.length,
        unfilledPositionsCount,
        promisedQualifiers,
        reservedQualifiers,
        feedingStructures,
        roundNumber,
      };
    });

  return { valid, targets };
}
