import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { CONTRADICTORY_POSITION_ACTION } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, MatchUp, Structure } from '@Types/tournamentTypes';
import { FIRST_MATCHUP, LOSER, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import {
  completedMatchUpStatuses,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  DEAD_RUBBER,
  CANCELLED,
  ABANDONED,
  BYE,
} from '@Constants/matchUpStatusConstants';

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
export const LOSER_DUE = 'LOSER_DUE';
export const WINNER_DUE = 'WINNER_DUE';
export const BYE_ADVANCEMENT_PLAYED = 'BYE_ADVANCEMENT_PLAYED';
export const PARTICIPANT_DUE = 'PARTICIPANT_DUE';
export const ARRIVED_FROM_RESULT = 'ARRIVED_FROM_RESULT';
export const DECLINED_CONSOLATION = 'DECLINED_CONSOLATION';

export type MustClearItem = {
  reason: string;
  structureId: string;
  matchUpId?: string;
  roundNumber?: number;
  roundPosition?: number;
  drawPosition?: number;
  participantId?: string;
};

/** a matchUp, stored or hydrated, that holds a result: a winner, a completed status, or a score */
export function hasResult(matchUp: HydratedMatchUp | MatchUp): boolean {
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

/** the stored matchUps of a structure, a round robin's groups included */
function storedMatchUpsOf(structure?: Structure): MatchUp[] {
  return matchUpsOf(structure) ?? (structuresOf(structure) ?? []).flatMap((group) => matchUpsOf(group) ?? []);
}

function inStructure(matchUp: HydratedMatchUp, structureId: string) {
  return matchUp.structureId === structureId || matchUp.containerStructureId === structureId;
}

function refusal(context: { mustClear: MustClearItem[]; reservedFor?: MustClearItem[] }, stack: string): ResultType {
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
  // every refusal below starts from a result in this structure: with none, there is nothing to walk
  if (!storedMatchUpsOf(structure).some(hasResult)) return undefined;

  const reasons = new Map<string, string>();
  const placements = carriedAcrossLinks({ inContextDrawMatchUps, drawDefinition, structure, occupied, reasons });

  // 2. results moved onto a seat that holds nobody
  const vacant = assignments.some((assignment) => !assignment.participantId && !assignment.bye);
  if (vacant && occupied.length === 1) {
    const seat = { structureId: structure.structureId, drawPosition: occupied[0].drawPosition };
    addSeatResults({ inContextDrawMatchUps, ...seat, reasons, reason: RESULT_ON_POSITION });
  }

  // 3. a BYE swapped away from a seat whose opponent has played on through it: their later results lose the BYE
  if (occupied.length === 1) {
    for (const bye of assignments.filter((assignment) => assignment.bye)) {
      const first = seatMatchUp(inContextDrawMatchUps, structure.structureId, bye.drawPosition);
      const partner = first?.drawPositions?.find((position) => position && position !== bye.drawPosition);
      if (!first || !partner) continue;
      for (const matchUp of inContextDrawMatchUps) {
        if (!inStructure(matchUp, structure.structureId) || (matchUp.roundNumber ?? 0) <= (first.roundNumber ?? 0))
          continue;
        if (matchUp.drawPositions?.includes(partner) && hasResult(matchUp) && !reasons.has(matchUp.matchUpId))
          reasons.set(matchUp.matchUpId, BYE_ADVANCEMENT_PLAYED);
      }
    }
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

const NOT_PENDING: string[] = [BYE, DOUBLE_WALKOVER, DOUBLE_DEFAULT, CANCELLED, ABANDONED, DEAD_RUBBER];

type Feeder = { matchUp: HydratedMatchUp; link: DrawLink; seat?: number; fmlc: boolean };

/** links into `structureId` that direct a loser or winner by round; a qualifier is placed by its own action */
function feedingLinks(drawDefinition: DrawDefinition, structureId: string): DrawLink[] {
  return (drawDefinition.links ?? []).filter((link) => {
    if (link?.target?.structureId !== structureId || !link.source?.roundNumber) return false;
    if (![LOSER, WINNER].includes(link.linkType)) return false;
    return findStructure({ drawDefinition, structureId: link.source.structureId }).structure?.stage !== QUALIFYING;
  });
}

/**
 * The matchUps not yet decided whose loser (or winner) a link sends into `target`, with the seat each is sent to. A
 * FIRST_MATCHUP link owes nothing when neither side could be eligible to feed it.
 */
function pendingFeeders({
  inContextDrawMatchUps,
  drawDefinition,
  target,
  links,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  target: HydratedMatchUp;
  links: DrawLink[];
}): Feeder[] {
  const feeders: Feeder[] = [];
  for (const link of links) {
    const sourceMatchUps = inContextDrawMatchUps.filter(
      (matchUp) => inStructure(matchUp, link.source.structureId) && !matchUp.collectionId,
    );
    for (const matchUp of sourceMatchUps) {
      if (matchUp.roundNumber !== link.source.roundNumber || matchUp.winningSide) continue;
      if (NOT_PENDING.includes(matchUp.matchUpStatus as string) || matchUp.sides?.some((side) => side?.bye)) continue;
      const targets = positionTargets({
        matchUpId: matchUp.matchUpId,
        inContextDrawMatchUps,
        drawDefinition,
      }).targetMatchUps;
      const isLoser = link.linkType === LOSER;
      const targetMatchUp = isLoser ? targets?.loserMatchUp : targets?.winnerMatchUp;
      if (targetMatchUp?.matchUpId !== target.matchUpId) continue;
      const fmlc = isLoser && link.linkCondition === FIRST_MATCHUP;
      const drawPositions = (matchUp.drawPositions ?? []).filter(Boolean) as number[];
      if (
        fmlc &&
        drawPositions.length === 2 &&
        !drawPositions.some((loserDrawPosition) =>
          isFedLoserEligible({ sourceMatchUps, loserDrawPosition, loserTargetLink: link }),
        )
      )
        continue;
      const seat = isLoser ? targets?.loserTargetDrawPosition : targets?.winnerTargetDrawPosition;
      feeders.push({ matchUp, link, seat, fmlc: fmlc && target.roundNumber === 2 });
    }
  }
  return feeders;
}

function reservation({ matchUp, link }: Feeder): MustClearItem {
  return {
    reason: link.linkType === LOSER ? LOSER_DUE : WINNER_DUE,
    structureId: matchUp.structureId,
    matchUpId: matchUp.matchUpId,
    roundNumber: matchUp.roundNumber,
    roundPosition: matchUp.roundPosition,
  };
}

/**
 * True when the stored `loserMatchUpId` / `winnerMatchUpId` edges show that every source matchUp a link sends into the
 * seat's matchUp is decided (or a BYE, or a double exit). False when it cannot tell (edges not stored) or one is pending.
 */
function feedersDecidedByStoredEdges({
  drawDefinition,
  drawPosition,
  structure,
  links,
}: {
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structure?: Structure;
  links: DrawLink[];
}): boolean {
  const target = storedMatchUpsOf(structure)
    .filter((matchUp) => matchUp.drawPositions?.includes(drawPosition))
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))[0];
  if (!target) return false;
  for (const link of links) {
    const source = findStructure({ drawDefinition, structureId: link.source.structureId }).structure;
    for (const matchUp of storedMatchUpsOf(source)) {
      if (matchUp.roundNumber !== link.source.roundNumber || matchUp.collectionId) continue;
      const edge = link.linkType === LOSER ? matchUp.loserMatchUpId : matchUp.winnerMatchUpId;
      if (!edge) return false; // not stored: hydrate and ask
      if (edge !== target.matchUpId) continue;
      if (!matchUp.winningSide && !NOT_PENDING.includes(matchUp.matchUpStatus as string)) return false;
    }
  }
  return true;
}

/** the earliest matchUp of `structureId` holding `drawPosition`: the one a feed fills it for */
function seatMatchUp(inContextDrawMatchUps: HydratedMatchUp[], structureId: string, drawPosition: number) {
  return inContextDrawMatchUps
    .filter((matchUp) => inStructure(matchUp, structureId) && matchUp.drawPositions?.includes(drawPosition))
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))[0];
}

/**
 * Whether a hand placement (a BYE, or a participant) on `drawPosition` of `structureId` would take a seat that a
 * matchUp not yet decided still owes a loser or winner, so that its result could not be entered. It asks what the
 * arrival would do (`directLoser`): an arrival takes any open seat of its target matchUp, so the placement is refused
 * only when the target matchUp would be left with fewer open seats than the arrivals owed to it. A FIRST_MATCHUP
 * round-two arrival (FIRST_MATCH_LOSER_CONSOLATION) takes the lowest seat and replaces a BYE there, so a hand-placed
 * BYE never blocks it. `disablesSeat`: the placement disables the seat's links (an alternate or a lucky loser), so no
 * arrival is sent to the seat itself. `vacating`: the seat's occupant is removed first (a removal replaced with a BYE).
 */
export function reservedSeatRefusal({
  inContextDrawMatchUps,
  drawDefinition,
  drawPosition,
  disablesSeat,
  structureId,
  vacating,
  placing,
  stack,
}: {
  inContextDrawMatchUps: () => HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  placing: 'BYE' | 'PARTICIPANT';
  drawPosition: number;
  disablesSeat?: boolean;
  vacating?: boolean;
  structureId: string;
  stack: string;
}): ResultType | undefined {
  const links = feedingLinks(drawDefinition, structureId);
  if (!links.length) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId });
  const assignments = assignmentsOf(structure);
  const seatAssignment = assignments.find((assignment) => assignment.drawPosition === drawPosition);
  if (!vacating && (seatAssignment?.participantId || (placing === 'BYE' && seatAssignment?.bye))) return undefined;

  // stored edges answer without hydrating when every matchUp sent into the seat's matchUp is decided
  if (feedersDecidedByStoredEdges({ drawDefinition, structure, drawPosition, links })) return undefined;

  const matchUps = inContextDrawMatchUps();
  const target = seatMatchUp(matchUps, structureId, drawPosition);
  if (!target) return undefined;
  const lowest = Math.min(...((target.drawPositions ?? []).filter(Boolean) as number[]));
  const blocking = pendingFeeders({ inContextDrawMatchUps: matchUps, drawDefinition, target, links }).filter(
    (feeder) => {
      if (disablesSeat && feeder.seat === drawPosition) return false; // the seat's links are disabled: not sent here
      // the FIRST_MATCHUP round-two arrival takes the lowest seat, replacing a BYE but not a participant
      if (feeder.fmlc) return placing === 'PARTICIPANT' && drawPosition === lowest;
      return true;
    },
  );
  if (!blocking.length) return undefined;

  const general = blocking.filter((feeder) => !feeder.fmlc);
  const open = ((target.drawPositions ?? []).filter(Boolean) as number[]).filter((position) => {
    if (position === drawPosition) return false;
    const assignment = assignments.find((candidate) => candidate.drawPosition === position);
    return (
      !assignment?.participantId && !assignment?.qualifier && (!assignment?.bye || !!assignment.byeFromPropagation)
    );
  }).length;
  const refused = blocking.some((feeder) => feeder.fmlc) || general.length > open;
  if (!refused) return undefined;
  return refusal({ mustClear: [], reservedFor: blocking.map(reservation) }, stack);
}

/**
 * A swap of seats in a structure links feed (not a first-stage MAIN or QUALIFYING structure) disables both seats'
 * links. It is refused when a matchUp not yet decided still owes either seat: that arrival would be sent nowhere.
 */
export function swapOfReservedSeatRefusal({
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
  const links = feedingLinks(drawDefinition, structure.structureId);
  if (!links.length) return undefined;
  const reservedFor: MustClearItem[] = [];
  const asked = new Set<string>();
  for (const drawPosition of drawPositions) {
    const target = seatMatchUp(inContextDrawMatchUps, structure.structureId, drawPosition);
    if (!target || asked.has(target.matchUpId)) continue;
    asked.add(target.matchUpId);
    for (const feeder of pendingFeeders({ inContextDrawMatchUps, drawDefinition, target, links }))
      if (feeder.seat !== undefined && drawPositions.includes(feeder.seat)) reservedFor.push(reservation(feeder));
  }
  if (!reservedFor.length) return undefined;
  return refusal({ mustClear: [], reservedFor }, 'swapDrawPositionAssignments');
}

/**
 * Whether a hand placement of `participantId` in `structureId` would place a participant who is still playing in a
 * structure linked with it: that structure's next result for them would send them here (or back) a second time, and be
 * refused (`ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`). A participant whose matchUps there are all decided is
 * not due anywhere: placing them (a lucky loser, a qualifier who lost) is unchanged.
 */
export function dueParticipantRefusal({
  inContextDrawMatchUps,
  drawDefinition,
  participantId,
  structureId,
  stack,
}: {
  inContextDrawMatchUps: () => HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  participantId?: string;
  structureId: string;
  stack: string;
}): ResultType | undefined {
  if (!participantId) return undefined;
  const linked = new Set<string>();
  for (const link of drawDefinition.links ?? []) {
    if (link?.target?.structureId === structureId && link.source?.structureId) linked.add(link.source.structureId);
    if (link?.source?.structureId === structureId && link.target?.structureId) linked.add(link.target.structureId);
  }
  linked.delete(structureId);
  if (!linked.size) return undefined;
  const holds = [...linked].some((linkedId) => {
    const linkedStructure = findStructure({ drawDefinition, structureId: linkedId }).structure;
    return assignmentsOf(linkedStructure).some((assignment) => assignment.participantId === participantId);
  });
  if (!holds) return undefined;
  const pending = inContextDrawMatchUps().filter(
    (matchUp) =>
      [...linked].some((linkedId) => inStructure(matchUp, linkedId)) &&
      !matchUp.winningSide &&
      !NOT_PENDING.includes(matchUp.matchUpStatus as string) &&
      matchUp.sides?.some((side) => side?.participantId === participantId),
  );
  if (!pending.length) return undefined;
  const reservedFor = pending.map((matchUp) => ({
    reason: PARTICIPANT_DUE,
    structureId: matchUp.structureId,
    matchUpId: matchUp.matchUpId,
    roundNumber: matchUp.roundNumber,
    roundPosition: matchUp.roundPosition,
    participantId,
  }));
  return refusal({ mustClear: [], reservedFor }, stack);
}

/**
 * Whether removing or swapping the participants on `drawPositions` of `structure` (a consolation or playoff) would move
 * one who arrived there from a result that still stands. That result still says they were sent to this seat, so
 * reversing it later finds someone else there and is refused. `mustClear` names the feeding result, with anything that
 * depends on it first; once it is cleared, the participant is no longer there by a result and may be moved.
 */
export function arrivedParticipantRefusal({
  inContextDrawMatchUps,
  drawDefinition,
  drawPositions,
  structure,
  stack,
}: {
  inContextDrawMatchUps: () => HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  drawPositions: number[];
  structure: Structure;
  stack: string;
}): ResultType | undefined {
  const links = feedingLinks(drawDefinition, structure.structureId);
  if (!links.length) return undefined;
  const occupied = assignmentsOf(structure).filter(
    (assignment) => drawPositions.includes(assignment.drawPosition) && assignment.participantId,
  );
  if (!occupied.length) return undefined;
  // nobody arrives without a decided source matchUp: with none stored, there is nothing to hydrate for
  const decidedSource = links.some((link) =>
    storedMatchUpsOf(findStructure({ drawDefinition, structureId: link.source.structureId }).structure).some(
      (matchUp) => matchUp.roundNumber === link.source.roundNumber && !!matchUp.winningSide,
    ),
  );
  if (!decidedSource) return undefined;

  const matchUps = inContextDrawMatchUps();
  const reasons = new Map<string, string>();
  for (const { participantId } of occupied) {
    const source = arrivalSource({ matchUps, links, participantId });
    if (source) reasons.set(source.matchUpId, ARRIVED_FROM_RESULT);
  }
  if (!reasons.size) return undefined;
  return refusal({ mustClear: clearingOrder({ inContextDrawMatchUps: matchUps, drawDefinition, reasons }) }, stack);
}

/** the decided source matchUp whose result sent `participantId` across one of `links` (into the links' target) */
function arrivalSource({
  participantId,
  matchUps,
  links,
}: {
  participantId?: string;
  matchUps: HydratedMatchUp[];
  links: DrawLink[];
}): HydratedMatchUp | undefined {
  if (!participantId) return undefined;
  for (const link of links) {
    {
      const source = matchUps.find(
        (matchUp) =>
          inStructure(matchUp, link.source.structureId) &&
          matchUp.roundNumber === link.source.roundNumber &&
          !!matchUp.winningSide &&
          !matchUp.collectionId &&
          matchUp.sides?.some(
            (side) =>
              side?.participantId === participantId &&
              (link.linkType === LOSER
                ? side.sideNumber !== matchUp.winningSide
                : side.sideNumber === matchUp.winningSide),
          ),
      );
      if (source) return source;
    }
  }
  return undefined;
}

/**
 * The result a removal of `drawPosition` in `structure` would record as a declined consolation: the decided matchUp
 * whose result sent the seat's participant there. Undefined for a seat no result filled.
 */
export function declineSource({
  inContextDrawMatchUps,
  drawDefinition,
  drawPosition,
  structure,
}: {
  inContextDrawMatchUps: () => HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structure: Structure;
}): { matchUpId: string; participantId: string } | undefined {
  const links = feedingLinks(drawDefinition, structure.structureId);
  const participantId = assignmentsOf(structure).find((a) => a.drawPosition === drawPosition)?.participantId;
  if (!links.length || !participantId) return undefined;
  const source = arrivalSource({ matchUps: inContextDrawMatchUps(), links, participantId });
  return source ? { matchUpId: source.matchUpId, participantId } : undefined;
}

export type DeclinedSeat = {
  structureId: string;
  drawPosition: number;
  participantId: string;
  matchUpId: string;
};

/**
 * The declined consolations of the draw: seats a participant who arrived from a result left, replaced with a BYE whose
 * links are disabled. A seat records its decline (`declinedParticipantId`, `declinedMatchUpId`). A record written
 * before 8.0.0 carries no such marker, and the decline is inferred from the stored draw where it is unambiguous: the
 * seat holds a hand-placed BYE with disabled links, exactly one decided matchUp sends its loser to the seat's matchUp
 * (its stored loser edge), and that loser is not in the structure. Anything else is a BYE closed before play.
 * `sourceStructureIds` limits the answer to declines of results in those structures.
 */
export function getDeclinedSeats(drawDefinition: DrawDefinition, sourceStructureIds?: string[]): DeclinedSeat[] {
  const seats: DeclinedSeat[] = [];
  // built only once a candidate seat is found: a draw with no hand-placed BYE pays one pass over its assignments
  let all: { matchUp: MatchUp; structure: Structure }[] | undefined;
  let byId: Map<string, { matchUp: MatchUp; structure: Structure }> | undefined;
  for (const structure of drawDefinition.structures ?? []) {
    const assignments = assignmentsOf(structure);
    for (const assignment of assignments) {
      if (!assignment.bye || assignment.byeFromPropagation || !assignment.disableLinks) continue;
      all ??= (drawDefinition.structures ?? []).flatMap((member) =>
        storedMatchUpsOf(member).map((matchUp) => ({ matchUp, structure: member })),
      );
      byId ??= new Map(all.map((entry) => [entry.matchUp.matchUpId, entry]));
      let matchUpId = assignment.declinedMatchUpId;
      let participantId = assignment.declinedParticipantId;
      if (!matchUpId) {
        const seatMatch = storedMatchUpsOf(structure)
          .filter((m) => m.drawPositions?.includes(assignment.drawPosition))
          .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))[0];
        const absent = seatMatch
          ? (all ?? []).filter(({ matchUp, structure: source }) => {
              if (matchUp.loserMatchUpId !== seatMatch.matchUpId || !matchUp.winningSide) return false;
              const positions = [...(matchUp.drawPositions ?? [])]
                .filter(Boolean)
                .sort((a, b) => (a as number) - (b as number));
              const loserPosition = positions[matchUp.winningSide === 1 ? 1 : 0];
              const loser = assignmentsOf(source).find((a) => a.drawPosition === loserPosition)?.participantId;
              return !!loser && !assignments.some((a) => a.participantId === loser);
            })
          : [];
        if (absent.length !== 1) continue; // not a decline that can be read off the draw: closed before play
        matchUpId = absent[0].matchUp.matchUpId;
        const positions = [...(absent[0].matchUp.drawPositions ?? [])]
          .filter(Boolean)
          .sort((a, b) => (a as number) - (b as number));
        const loserPosition = positions[absent[0].matchUp.winningSide === 1 ? 1 : 0];
        participantId = assignmentsOf(absent[0].structure).find((a) => a.drawPosition === loserPosition)?.participantId;
      }
      const source = byId?.get(matchUpId);
      if (!source || !participantId) continue;
      if (sourceStructureIds && !sourceStructureIds.includes(source.structure.structureId)) continue;
      seats.push({
        structureId: structure.structureId,
        drawPosition: assignment.drawPosition,
        participantId,
        matchUpId,
      });
    }
  }
  return seats;
}

/**
 * Whether entering `winningSide` on `matchUpId` (another winner, or none: a cleared result) would reverse a result whose
 * loser declined the consolation: replaced, in the seat that result sent them to, with a BYE whose links are disabled
 * (`removeDrawPositionAssignment` with `replaceWithBye`). The reversed result would name a new loser the declined seat no
 * longer takes, so the reversal is refused; `mustClear` names the declined seat. Once the decline is undone (the BYE
 * removed), the reversal is accepted.
 *
 * Read from the call's map of stored matchUps: it returns after one lookup for a matchUp with no winner, an unchanged
 * winner, or no stored loser edge; only a decided result that sends its loser on and changes winner reads further.
 */
export function declinedSeatRefusal({
  drawDefinition,
  matchUpsMap,
  winningSide,
  matchUpId,
}: {
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  winningSide?: number;
  matchUpId: string;
}): ResultType | undefined {
  const matchUp = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
  // only a decided result whose winner changes, and which sends its loser on, can reverse a decline
  if (!matchUp?.winningSide || winningSide === matchUp.winningSide || !matchUp.loserMatchUpId) return undefined;
  const declined = getDeclinedSeats(drawDefinition).filter((seat) => seat.matchUpId === matchUpId);
  if (!declined.length) return undefined;
  return refusal(
    {
      mustClear: declined.map(({ structureId, drawPosition, participantId }) => ({
        reason: DECLINED_CONSOLATION,
        structureId,
        drawPosition,
        participantId,
      })),
    },
    'setMatchUpStatus',
  );
}
