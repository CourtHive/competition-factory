import { positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { CONTRADICTORY_POSITION_ACTION } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';
import { LOSER, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';

/**
 * A POSITIONAL ACTION IS REFUSED, BEFORE ANY WRITE, WHEN IT WOULD LEAVE THE DRAW CONTRADICTING ITSELF.
 *
 * A structure records results against drawPositions, but a participant sent on across a link (a loser to a
 * consolation, a winner to a playoff, a qualifier to the main draw) is recorded in the target structure by WHO they
 * are. So a positional action that changes who stands at a drawPosition relabels the results in that structure and
 * leaves the target holding the old occupant: the draw then says one participant lost a match another participant
 * holds the consolation seat for, and the next result that touches either seat is refused
 * (`ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`, `ERR_OCCUPIED_DRAW_POSITION`).
 *
 * The refusal is `CONTRADICTORY_POSITION_ACTION`, and its `context.mustClear` lists what the director clears first, in
 * the order it can be cleared (a result before the result it depends on):
 * - `{ matchUpId, structureId, roundNumber, roundPosition, reason }`: a result to clear;
 * - `{ structureId, drawPosition, participantId, reason }`: a placement to remove (a qualifier in the main draw, a
 *   finisher in a playoff), which clearing a result does not undo.
 *
 * Swaps that relabel nothing outside the structure are not refused: a swap before any result, a swap of positions
 * whose results stay inside the structure (single elimination), and a swap of seats in a consolation or playoff that
 * no result has sent on from (the swap disables those seats' links, `conditionallyDisableLinkPositioning`).
 */

export const LOSER_DIRECTED = 'LOSER_DIRECTED';
export const WINNER_DIRECTED = 'WINNER_DIRECTED';
export const DEPENDS_ON_RESULT = 'DEPENDS_ON_RESULT';
export const RESULT_ON_POSITION = 'RESULT_ON_POSITION';
export const PLACED_ACROSS_LINK = 'PLACED_ACROSS_LINK';

export type MustClearItem = {
  reason: string;
  structureId: string;
  matchUpId?: string;
  roundNumber?: number;
  roundPosition?: number;
  drawPosition?: number;
  participantId?: string;
};

/** a matchUp that holds a result: a winner, a completed status, or a score */
export function hasResult(matchUp: HydratedMatchUp): boolean {
  if (matchUp.matchUpStatus === BYE) return false;
  return (
    !!matchUp.winningSide ||
    completedMatchUpStatuses.includes(matchUp.matchUpStatus as any) ||
    !!matchUp.score?.scoreStringSide1 ||
    !!matchUp.score?.scoreStringSide2
  );
}

function assignmentsOf(structure?: Structure) {
  return (
    positionAssignmentsOf(structure) ??
    (structuresOf(structure) ?? []).flatMap((group) => positionAssignmentsOf(group) ?? [])
  );
}

function inStructure(matchUp: HydratedMatchUp, structureId: string) {
  return matchUp.structureId === structureId || matchUp.containerStructureId === structureId;
}

function refusal(context: { mustClear: MustClearItem[] }, stack: string): ResultType {
  return decorateResult({ result: { error: CONTRADICTORY_POSITION_ACTION }, context, stack });
}

/**
 * What a swap of `drawPositions` in `structure` would contradict, or undefined.
 *
 * 1. A swapped seat's occupant was sent across a link out of `structure` by a decided result there (or placed in a
 *    link's target, for a qualifier or playoff link): the swap would relabel the result and leave the target holding
 *    the old occupant.
 * 2. A seat holding results is swapped with a seat holding nobody: the results would stay on a drawPosition with no
 *    participant.
 */
export function swapRefusal({
  inContextDrawMatchUps,
  drawDefinition,
  drawPositions,
  structure,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  drawPositions: number[];
  structure: Structure;
}): ResultType | undefined {
  const assignments = assignmentsOf(structure).filter((assignment) => drawPositions.includes(assignment.drawPosition));
  const occupied = assignments.filter((assignment) => assignment.participantId);
  if (!occupied.length) return undefined;

  const reasons = new Map<string, string>();
  const placements = carriedAcrossLinks({ inContextDrawMatchUps, drawDefinition, structure, occupied, reasons });

  // 2. results moved onto a seat that holds nobody
  const vacant = assignments.some((assignment) => !assignment.participantId && !assignment.bye);
  if (vacant && occupied.length === 1) {
    const seat = { structureId: structure.structureId, drawPosition: occupied[0].drawPosition };
    addSeatResults({ inContextDrawMatchUps, ...seat, reasons, reason: RESULT_ON_POSITION });
  }

  if (!reasons.size && !placements.length) return undefined;

  return refusal(
    { mustClear: [...clearingOrder({ inContextDrawMatchUps, drawDefinition, reasons }), ...placements] },
    'swapDrawPositionAssignments',
  );
}

/**
 * 1. The occupants among `occupied` that a link out of `structure` has carried on. A result that sent one across is
 * added to `reasons`; a placement no result here undoes (a qualifier in the main draw, a finisher placed in a playoff)
 * is returned, to be removed first.
 */
function carriedAcrossLinks({
  inContextDrawMatchUps,
  drawDefinition,
  structure,
  occupied,
  reasons,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  structure: Structure;
  occupied: { drawPosition: number; participantId?: string }[];
  reasons: Map<string, string>;
}): MustClearItem[] {
  const structureId = structure.structureId;
  const placements: MustClearItem[] = [];
  const links = (drawDefinition.links ?? []).filter((link) => link?.source?.structureId === structureId);
  for (const link of links) {
    const target = findStructure({ drawDefinition, structureId: link.target?.structureId }).structure;
    const targetAssignments = target ? assignmentsOf(target) : [];
    for (const { drawPosition, participantId } of occupied) {
      const placed = targetAssignments.find((assignment) => assignment.participantId === participantId);
      if (!placed) continue;
      const placedOnly = structure.stage === QUALIFYING || !link.source?.roundNumber;
      const source = !placedOnly && carryingResult({ inContextDrawMatchUps, structureId, drawPosition, link });
      if (source) {
        reasons.set(source.matchUpId, link.linkType === WINNER ? WINNER_DIRECTED : LOSER_DIRECTED);
      } else if (placedOnly) {
        // the placed seat's own results come off first: an active seat cannot be emptied
        const seat = { structureId: (target as Structure).structureId, drawPosition: placed.drawPosition };
        addSeatResults({ inContextDrawMatchUps, ...seat, reasons, reason: DEPENDS_ON_RESULT });
        placements.push({
          structureId: (target as Structure).structureId,
          drawPosition: placed.drawPosition,
          reason: PLACED_ACROSS_LINK,
          participantId,
        });
      }
    }
  }
  return placements;
}

/** every matchUp of `structureId` holding a result on `drawPosition`, added to `reasons` unless already there */
function addSeatResults({
  inContextDrawMatchUps,
  drawPosition,
  structureId,
  reasons,
  reason,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawPosition: number;
  structureId: string;
  reasons: Map<string, string>;
  reason: string;
}) {
  for (const matchUp of inContextDrawMatchUps) {
    if (!inStructure(matchUp, structureId) || !matchUp.drawPositions?.includes(drawPosition)) continue;
    if (hasResult(matchUp) && !reasons.has(matchUp.matchUpId)) reasons.set(matchUp.matchUpId, reason);
  }
}

/** the decided matchUp of `structureId` at `link`'s source round in which `drawPosition` was sent across `link` */
function carryingResult({
  inContextDrawMatchUps,
  structureId,
  drawPosition,
  link,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  structureId: string;
  drawPosition: number;
  link: DrawLink;
}): HydratedMatchUp | undefined {
  if (!link.source?.roundNumber || ![LOSER, WINNER].includes(link.linkType)) return undefined;
  return inContextDrawMatchUps.find((matchUp) => {
    if (!inStructure(matchUp, structureId) || matchUp.roundNumber !== link.source.roundNumber) return false;
    if (!matchUp.winningSide || matchUp.collectionId) return false;
    const side = matchUp.sides?.find((side) => side?.drawPosition === drawPosition);
    if (!side) return false;
    const won = side.sideNumber === matchUp.winningSide;
    return link.linkType === WINNER ? won : !won;
  });
}

/**
 * The given results and every result that depends on them, ordered so each can be cleared in turn: a result comes
 * before the result it depends on (a consolation match before the main result that sent its player there).
 */
function clearingOrder({
  inContextDrawMatchUps,
  drawDefinition,
  reasons,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  reasons: Map<string, string>;
}): MustClearItem[] {
  const byId = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const ordered: HydratedMatchUp[] = [];
  const visited = new Set<string>();
  const visit = (matchUpId?: string) => {
    if (!matchUpId || visited.has(matchUpId)) return;
    visited.add(matchUpId);
    const matchUp = byId.get(matchUpId);
    if (!matchUp) return;
    const targets = positionTargets({ matchUpId, inContextDrawMatchUps, drawDefinition }).targetMatchUps;
    visit(targets?.winnerMatchUp?.matchUpId);
    visit(targets?.loserMatchUp?.matchUpId);
    if (hasResult(matchUp)) ordered.push(matchUp);
  };
  for (const matchUpId of reasons.keys()) visit(matchUpId);
  return ordered.map((matchUp) => ({
    reason: reasons.get(matchUp.matchUpId) ?? DEPENDS_ON_RESULT,
    structureId: matchUp.structureId,
    matchUpId: matchUp.matchUpId,
    roundNumber: matchUp.roundNumber,
    roundPosition: matchUp.roundPosition,
  }));
}
