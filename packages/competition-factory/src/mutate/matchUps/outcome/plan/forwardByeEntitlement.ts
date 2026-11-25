import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import type { MatchUpsMap } from '@Types/factoryTypes';
import type { RecordCopy } from '../types';
import { feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { buildTargetIndex } from '@Query/matchUp/targetIndex';
import { positionTargets, type PositionTargets } from '@Query/matchUp/positionTargets';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { BYE, COMPLETED, DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { type ClaimDraw } from './placementClaims';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { MatchUp, PositionAssignment } from '@Types/tournamentTypes';

export class PassageAbstention extends Error {}
export function requirePassage(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new PassageAbstention(reason);
}

export const passageDepth = 3;
type Donor = { feeder: HydratedMatchUp; home: HydratedMatchUp; edge: PositionTargets };
type Slot = PositionAssignment;
type Held = { holder: HydratedMatchUp; position: number };

/** Bind stored seats, resolved links and the index once for this call. A missing donor is meaningful
 * only after all possible loser links have been resolved, including links omitted from an index. */
export function passageGraph(draw: ClaimDraw, matchUpsMap?: MatchUpsMap) {
  const index = buildTargetIndex(draw.inContextDrawMatchUps);
  const stored = new Map<string, MatchUp>();
  const seats = new Map<string, Map<number, Slot>>();
  const edges = new Map<string, PositionTargets>();
  const donorsBySeat = new Map<Slot, Donor[]>();
  requirePassage(index.byMatchUpId.size === draw.inContextDrawMatchUps.length, 'duplicate indexed match');
  for (const structure of draw.drawDefinition.structures ?? []) {
    const id = structure.structureId;
    const assignments = positionAssignmentsOf(structure);
    requirePassage(!seats.has(id) && !structuresOf(structure)?.length && assignments, 'unresolved owning structure');
    const positions = new Map(assignments.map((a) => [a.drawPosition, a]));
    requirePassage(positions.size === assignments.length, 'duplicate assignment');
    seats.set(id, positions);
    const matchUps = matchUpsOf(structure);
    if (matchUpsMap) {
      requirePassage(!structuresOf(structure), 'nested structure index');
      matchUpsMap.mappedMatchUps[id] = { matchUps, itemStructureIds: [] };
    }
    for (const m of matchUps ?? []) {
      const idx = index.byMatchUpId.get(m.matchUpId);
      requirePassage(
        !stored.has(m.matchUpId) && idx?.structureId === id && !m.tieMatchUps?.length,
        'inconsistent indexed owner',
      );
      requirePassage(
        idx.winnerMatchUpId === m.winnerMatchUpId &&
          idx.loserMatchUpId === m.loserMatchUpId &&
          idx.matchUpStatus === m.matchUpStatus &&
          idx.winningSide === m.winningSide,
        'inconsistent indexed outcome or links',
      );
      requirePassage(
        (m.drawPositions ?? []).every((p) => !p || positions.has(p)),
        'missing position assignment',
      );
      stored.set(m.matchUpId, m);
      matchUpsMap?.drawMatchUps.push(m);
    }
  }
  requirePassage(stored.size === index.byMatchUpId.size, 'missing stored match');
  const seat = (match: HydratedMatchUp, p: number) => seats.get(match.structureId!)?.get(p);
  for (const feeder of draw.inContextDrawMatchUps) {
    const edge = positionTargets({
      ...draw,
      matchUpId: feeder.matchUpId,
      inContextMatchUp: feeder,
      asReferences: true,
      targetIndex: index,
    });
    requirePassage(
      edge.targetMatchUps &&
        edge.targetMatchUps.winnerMatchUp?.matchUpId === feeder.winnerMatchUpId &&
        edge.targetMatchUps.loserMatchUp?.matchUpId === feeder.loserMatchUpId,
      'unresolved target link',
    );
    edges.set(feeder.matchUpId, edge);
    const home = edge.targetMatchUps.loserMatchUp;
    if (!home) continue;
    const slot = seat(home, edge.targetMatchUps.loserTargetDrawPosition!);
    requirePassage(slot && edge.targetLinks.loserTargetLink, 'unmapped loser seat');
    const candidates = donorsBySeat.get(slot) ?? [];
    candidates.push({ feeder, home, edge });
    donorsBySeat.set(slot, candidates);
  }
  return { draw, index, stored, seat, edges, donorsBySeat };
}
export type PassageGraph = ReturnType<typeof passageGraph>;

/** Reuse the proof's stored-member traversal to bind the map on the fresh recorder copy. */
export function passageOnCopy(copy: RecordCopy) {
  const index = buildStructuralIndex(copy);
  if (index.unsupported) return undefined;
  const matchUpsMap: MatchUpsMap = { drawMatchUps: [], mappedMatchUps: {} };
  try {
    const graph = passageGraph(
      { drawDefinition: copy.drawDefinition, inContextDrawMatchUps: index.matchUps },
      matchUpsMap,
    );
    return { graph, matchUpsMap };
  } catch (error) {
    if (error instanceof PassageAbstention) return undefined;
    throw error;
  }
}

function directDouble(graph: PassageGraph, donor: HydratedMatchUp, incoming: Set<string>) {
  const record = graph.stored.get(donor.matchUpId)!;
  return (
    !incoming.has(donor.matchUpId) &&
    isDoubleExit(record.matchUpStatus) &&
    !record.winningSide &&
    !Object.values(record.sideExitProvenance ?? {}).some((mark) => isAnyExit(mark?.matchUpStatus))
  );
}

function producedByDirectDouble(graph: PassageGraph, donor: HydratedMatchUp, incoming: Set<string>) {
  const record = graph.stored.get(donor.matchUpId)!;
  requirePassage(record.winningSide === 1 || record.winningSide === 2, 'produced exit has no winner');
  const side = 3 - record.winningSide;
  const mark = record.sideExitProvenance?.[side];
  const origin = mark?.sourceMatchUpId && graph.index.byMatchUpId.get(mark.sourceMatchUpId);
  requirePassage(
    origin && directDouble(graph, origin, incoming),
    'named origin is not an independent direct double exit',
  );
  requirePassage(
    origin.structureId === donor.structureId &&
      origin.winnerMatchUpId === donor.matchUpId &&
      origin.roundNumber! + 1 === donor.roundNumber,
    'wrong produced-exit origin edge',
  );
  const parents = graph.index.roundsByStructureId
    .get(donor.structureId)
    ?.get(origin.roundNumber)
    ?.filter((p) => p.winnerMatchUpId === donor.matchUpId);
  const last = 2 * donor.roundPosition!;
  requirePassage(
    parents?.length === 2 &&
      [last - 1, last].every((n) => parents.some((p) => p.roundPosition === n)) &&
      2 - (origin.roundPosition! % 2) === side,
    'unresolved produced-exit origin side',
  );
  requirePassage(
    mark.previousMatchUpStatus === origin.matchUpStatus &&
      mark.matchUpStatus === record.matchUpStatus &&
      mark.matchUpStatus === (origin.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER),
    'carried status mismatch',
  );
}

function excludedLoserWon(graph: PassageGraph, donor: HydratedMatchUp, incoming: Set<string>) {
  const loser = donor.sides?.find((s) => s.sideNumber === 3 - donor.winningSide!);
  if (
    !loser?.participantId ||
    !loser.drawPosition ||
    graph.seat(donor, loser.drawPosition)?.participantId !== loser.participantId
  )
    return false;
  return graph.draw.inContextDrawMatchUps.some((m) => {
    const score = graph.stored.get(m.matchUpId)?.score;
    return (
      !incoming.has(m.matchUpId) &&
      m.structureId === donor.structureId &&
      m.roundNumber! < donor.roundNumber! &&
      m.matchUpStatus === COMPLETED &&
      !!(score?.sets?.length || score?.scoreStringSide1 || score?.scoreStringSide2) &&
      m.sides?.some(
        (s) =>
          s.sideNumber === m.winningSide &&
          s.drawPosition === loser.drawPosition &&
          s.participantId === loser.participantId,
      )
    );
  });
}

function homeReaches(graph: PassageGraph, { home }: Donor, { holder, position }: Held) {
  let here: HydratedMatchUp | undefined = home;
  for (let i = 0; here && i <= passageDepth; i++) {
    if (
      here.structureId !== holder.structureId ||
      here.matchUpStatus !== BYE ||
      !here.drawPositions?.includes(position)
    )
      return false;
    if (here.matchUpId === holder.matchUpId) return true;
    here = graph.edges.get(here.matchUpId)?.targetMatchUps.winnerMatchUp;
  }
  return false;
}

/** An unmarked structural seat can itself have been fed by a structural BYE. Follow an unmarked
 * input to ground so erasing a reservation marker cannot turn an exit-fed seat into a structural one. */
function structuralSlot(graph: PassageGraph, held: Held, ancestors: Slot[]): boolean {
  const slot = graph.seat(held.holder, held.position);
  if (!slot?.bye || slot.participantId || slot.qualifier || slot.byeFromPropagation || ancestors.includes(slot))
    return false;
  const donors = graph.donorsBySeat.get(slot);
  if (!donors) return true;
  const [donor] = donors;
  if (
    ancestors.length >= passageDepth ||
    donors.length !== 1 ||
    donor.feeder.matchUpStatus !== BYE ||
    !homeReaches(graph, donor, held)
  )
    return false;
  return (donor.feeder.drawPositions ?? []).some(
    (p) => !!p && structuralSlot(graph, { holder: donor.feeder, position: p }, [...ancestors, slot]),
  );
}

export function proveHeldSlot(
  graph: PassageGraph,
  held: Held,
  incoming: Set<string>,
  policy: boolean | undefined,
  ancestors: Slot[] = [],
) {
  const { holder, position } = held;
  const slot = graph.seat(holder, position);
  requirePassage(slot?.bye && !slot.participantId && !slot.qualifier, 'held BYE is occupied or absent');
  if (!slot.byeFromPropagation) {
    requirePassage(structuralSlot(graph, held, []), 'unmarked seat lacks structural BYE origin');
    return;
  }
  requirePassage(!ancestors.includes(slot) && ancestors.length < passageDepth, 'support cycle or depth');
  const donors = graph.donorsBySeat.get(slot);
  requirePassage(donors?.length === 1, 'no unique mapped donor');
  const [donor] = donors;
  const { feeder, home, edge } = donor;
  requirePassage(
    !incoming.has(feeder.matchUpId) &&
      feeder.structureId !== holder.structureId &&
      feeder.winnerMatchUpId !== home.matchUpId &&
      homeReaches(graph, donor, held),
    'donor overlaps arrival or misses held BYE',
  );
  const loserTargetLink = edge.targetLinks.loserTargetLink;
  const reason = feederSendsNobody({ ...graph.draw, feeder, loserTargetLink });
  switch (reason) {
    case 'DOUBLE_EXIT':
      requirePassage(
        directDouble(graph, feeder, incoming) && (policy || home.hasFedDrawPosition),
        'double exit or policy unresolved',
      );
      return;
    case 'NOBODY_LOST':
      producedByDirectDouble(graph, feeder, incoming);
      return;
    case 'LINK_EXCLUDES':
      requirePassage(
        loserTargetLink?.linkCondition === FIRST_MATCHUP && excludedLoserWon(graph, feeder, incoming),
        'excluded loser has no independently verified scored win',
      );
      return;
    case 'FEEDER_HOLDS_BYE': {
      const byes = (feeder.drawPositions ?? []).filter((p): p is number => !!p && !!graph.seat(feeder, p)?.bye);
      requirePassage(feeder.matchUpStatus === BYE && byes.length, 'feeder holds no BYE');
      for (const p of byes)
        proveHeldSlot(graph, { holder: feeder, position: p }, incoming, policy, [...ancestors, slot]);
      return;
    }
    default:
      throw new PassageAbstention('unsupported feeder reason');
  }
}
