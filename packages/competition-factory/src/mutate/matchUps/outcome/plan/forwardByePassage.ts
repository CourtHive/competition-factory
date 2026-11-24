import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { accountsForAssignment, crossStructurePosition, holdsPosition } from './placementClaims';
import {
  passageDepth,
  passageGraph,
  PassageAbstention,
  proveHeldSlot,
  requirePassage,
  type PassageGraph,
} from './forwardByeEntitlement';
import { arrivalOps, arrivalReturnOps } from './directionOps';
import { bareResultRequest, positionsOf, structureStamps } from './planShared';
import { tiebreakPointsWarnings } from '@Scoring/analysis/validateScore';
import { writeLegacyEnabled } from '@Global/state/globalState';
import { isDoubleExit } from '@Validators/isExit';
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { resultOps } from './resultOps';
import type { PositionTargets } from '@Query/matchUp/positionTargets';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';
import type { PlanArgs } from '../types';

type Prediction =
  | { ops: OutcomeOp[]; shape: 'direction'; abstain?: undefined }
  | { abstain: string; ops?: undefined; shape?: undefined };
type Step = { match: HydratedMatchUp; position: number; positions: number[]; added: boolean; announce: boolean };

/** Constant-time screen over facts already read for the ordinary winner direction. */
export function hasForwardByeArrival({ route, view, write }: PlanArgs): boolean {
  return (
    route === 'winner' &&
    write?.matchUpStatus === COMPLETED &&
    view.existing.matchUpStatus === TO_BE_PLAYED &&
    !view.existing.winningSide &&
    (view.targets.winner?.matchUpStatus === BYE || view.targets.loserMatchUpStatus === BYE)
  );
}

/** Candidate hook at planCall's pre-write boundary. The differential can fold and certify the
 * returned ops with the normal executor. No recording, clock capture or routing takes place here. */
export function predictForwardByePassage(args: PlanArgs): Prediction {
  if (!hasForwardByeArrival(args)) return { abstain: 'no forward BYE arrival' };
  try {
    return predict(args);
  } catch (error) {
    if (error instanceof PassageAbstention) return { abstain: error.message };
    throw error;
  }
}

function predict(args: PlanArgs): Prediction {
  const { drawDefinition, view, request, write, direction } = args;
  const { existing, targets, inContextDrawMatchUps } = view;
  const side = request.winningSide;
  const sourceId = request.matchUpId;
  requirePassage(
    args.route === 'winner' &&
      sourceId &&
      (side === 1 || side === 2) &&
      write?.winningSide === side &&
      write.matchUpStatus === COMPLETED &&
      (!request.matchUpStatus || request.matchUpStatus === COMPLETED),
    'requires a completed winner directive',
  );
  requirePassage(
    drawDefinition &&
      inContextDrawMatchUps &&
      view.draw.storesEdges &&
      !writeLegacyEnabled() &&
      !view.draw.perMatchUpCompetition &&
      !view.draw.tallied &&
      !view.draw.luckyBased &&
      !view.draw.isAdHoc &&
      !view.isTeam &&
      !view.line &&
      !view.group &&
      !view.isDeciderMatchUp &&
      !args.dual &&
      !args.asDual,
    'unsupported draw, team or write mode',
  );
  requirePassage(
    !request.flags.propagatingExit &&
      view.formatRecognized &&
      bareResultRequest({ ...request, score: undefined, matchUpFormat: undefined }) &&
      !tiebreakPointsWarnings(request.score?.sets, request.matchUpFormat ?? existing.matchUpFormat).length,
    'additional request effects or score warning',
  );
  requirePassage(
    existing.matchUpStatus === TO_BE_PLAYED &&
      !existing.winningSide &&
      !existing.scoreHasValue &&
      !existing.hasSideExitProvenance &&
      !existing.carriedExit &&
      !view.activeDownstream,
    'source already active or carries an exit',
  );
  const reservation = targets.reservations?.[side];
  requirePassage(
    !targets.winnerLink &&
      !targets.byeTarget &&
      (!reservation || reservation.kind === 'none') &&
      !direction?.decider &&
      !direction?.produced &&
      !direction?.converged &&
      direction?.winner,
    'additional source direction',
  );
  const graph = passageGraph({ drawDefinition, inContextDrawMatchUps });
  const source = graph.index.byMatchUpId.get(sourceId);
  requirePassage(
    source?.matchUpType === 'SINGLES' && source.structureId && source.structureId === targets.source.structureId,
    'source match or structure unresolved',
  );
  const loserSide = (3 - side) as 1 | 2;
  const sourceSeat = (s: 1 | 2) => {
    const position = targets.sideDrawPositions[s],
      participant = targets.sideParticipantIds[s];
    requirePassage(
      position &&
        participant &&
        holdsPosition(source, participant, position) &&
        graph.seat(source, position)?.participantId === participant,
      'source participant or assignment mismatch',
    );
    return { position, participant };
  };
  const win = sourceSeat(side),
    loss = sourceSeat(loserSide);
  const edge = graph.edges.get(sourceId)!.targetMatchUps;
  const first = edge.winnerMatchUp;
  requirePassage(
    first &&
      first.structureId === source.structureId &&
      first.matchUpId === targets.winnerMatchUpId &&
      first.matchUpId === direction.winner.matchUpId &&
      direction.winner.participantId === win.participant &&
      loss.participant !== win.participant &&
      loss.position !== win.position,
    'source winner link or participant mismatch',
  );
  const incoming = new Set([sourceId]);
  const winnerPath = passagePath(graph, first, win.position, win.participant, incoming, false);
  const loserPath = loserPassage(args, graph, incoming, loss.participant);
  const holders = [...winnerPath, ...loserPath].filter((s) => s.match.matchUpStatus === BYE);
  requirePassage(holders.length, 'no BYE on either arrival');
  for (const { match } of holders) {
    for (const position of positionsOf(match)) {
      if (graph.seat(match, position)?.bye)
        proveHeldSlot(graph, { holder: match, position }, incoming, view.draw.propagatesByeOnDoubleExit);
    }
  }
  const assignment = arrivalOps(view, direction.loser);
  const placements = [
    ...placementOps(winnerPath),
    ...assignment,
    ...placementOps(loserPath),
    ...arrivalReturnOps(assignment),
  ];
  return {
    shape: 'direction',
    ops: [
      ...resultOps(request, write, sourceId),
      ...placements,
      ...structureStamps(placements, source.structureId, drawDefinition),
      { op: 'stampUpdatedAt', entity: 'structure', id: source.structureId },
      { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
    ],
  };
}

function loserPassage(args: PlanArgs, graph: PassageGraph, incoming: Set<string>, participant: string) {
  const { targets } = args.view;
  const entrant = args.direction?.loser;
  const edge = graph.edges.get(args.request.matchUpId!)!.targetMatchUps;
  const first = edge.loserMatchUp,
    position = edge.loserTargetDrawPosition;
  if (!first && !targets.loserMatchUpId && !entrant) return [];
  requirePassage(
    first &&
      entrant?.arrives &&
      first.matchUpId === entrant.matchUpId &&
      first.matchUpId === targets.loserMatchUpId &&
      first.structureId === targets.loserStructureId &&
      first.structureId !== targets.source.structureId &&
      position &&
      position === targets.loserTargetDrawPosition &&
      participant === entrant.participantId,
    'unresolved linked loser landing',
  );
  requirePassage(
    !entrant.bye &&
      !entrant.exit &&
      !entrant.converged &&
      !entrant.carriedPast &&
      !entrant.retainedCarry &&
      !entrant.withdrawn,
    'loser carries another obligation',
  );
  const slot = graph.seat(first, position);
  requirePassage(
    slot && !slot.bye && !slot.qualifier && !slot.participantId && targets.loserTargetSeat?.free,
    'linked loser seat is occupied',
  );
  requirePassage(
    graph.draw.drawDefinition.entries?.some((e) => e.participantId === participant) &&
      !graph.draw.drawDefinition.structures?.some((st) =>
        st.seedAssignments?.some((a) => a.participantId === participant),
      ),
    'draw entry or seed assignment owed',
  );
  requirePassage(first.drawPositions?.includes(position), 'linked seat missing from initial match');
  const path = passagePath(graph, first, position, participant, incoming, true);
  requirePassage(
    accountsForAssignment(graph.draw, path, first, position, participant),
    'assignment reaches independent match',
  );
  return path;
}

function passagePath(
  graph: PassageGraph,
  first: HydratedMatchUp,
  position: number,
  participant: string,
  incoming: Set<string>,
  linked: boolean,
): Step[] {
  const path: Step[] = [];
  let match: HydratedMatchUp | undefined = first;
  for (let hop = 0; match && hop <= passageDepth; hop++) {
    requirePassage(!incoming.has(match.matchUpId), 'arrival paths intersect');
    incoming.add(match.matchUpId);
    const slot = graph.seat(match, position);
    requirePassage(
      slot && !slot.bye && !slot.qualifier && (linked ? !slot.participantId : slot.participantId === participant),
      'arrival overlaps occupant or lacks assignment',
    );
    const raw = graph.stored.get(match.matchUpId)!;
    requirePassage(
      !raw.winningSide &&
        !raw.sideExitProvenance &&
        !raw.score?.sets?.length &&
        !raw.score?.scoreStringSide1 &&
        !raw.score?.scoreStringSide2 &&
        !match.collectionId &&
        match.matchUpType === 'SINGLES',
      'receiver holds a result or provenance',
    );
    const current = positionsOf(match);
    requirePassage(
      current.length <= 2 &&
        new Set(current).size === current.length &&
        (raw.drawPositions ?? []).filter(Boolean).join() === current.join(),
      'inconsistent stored draw positions',
    );
    const update = getUpdatedDrawPositions({ drawPositions: raw.drawPositions ?? [], drawPosition: position });
    requirePassage(update.positionAssigned, 'arrival requires releasing a prior position');
    const { positionAdded: added, updatedDrawPositions: positions } = update;
    const hasBye = positions.some((p) => graph.seat(match!, p)?.bye);
    requirePassage(hasBye === (raw.matchUpStatus === BYE), 'BYE status disagrees with held seat');
    path.push({
      match,
      position,
      positions,
      added,
      announce: added || (linked && match.roundNumber! > first.roundNumber!),
    });
    const edge: PositionTargets = graph.edges.get(match.matchUpId)!;
    const next: HydratedMatchUp | undefined = edge.targetMatchUps.winnerMatchUp;
    if (!hasBye) {
      requirePassage(raw.matchUpStatus === TO_BE_PLAYED, 'arrival reaches a standing result');
      requirePassage(
        edge.targetLinks.loserTargetLink?.linkCondition !== FIRST_MATCHUP || positions.length < 2,
        'arrival owes first-match reservation check',
      );
      const previous = graph.index.roundsByStructureId.get(match.structureId)?.get(match.roundNumber! - 1);
      requirePassage(
        !next ||
          match.feedRound ||
          !previous?.some(
            (m) =>
              isDoubleExit(m.matchUpStatus) &&
              (m.winnerMatchUpId === match!.matchUpId || m.loserMatchUpId === match!.matchUpId),
          ),
        'paired double exit may advance beyond arrival',
      );
      return path;
    }
    checkByeLoserSeat(graph, match, edge);
    if (!next) return path;
    requirePassage(!incoming.has(next.matchUpId), 'arrival paths intersect');
    if (next.structureId !== match.structureId) {
      const mapped = edge.targetLinks.winnerTargetLink && crossStructurePosition(graph.draw, match, next, participant);
      requirePassage(!linked && mapped, 'cross-structure winner has no unique existing target position');
      position = mapped;
    } else {
      requirePassage(
        !edge.targetLinks.winnerTargetLink && next.roundNumber === match.roundNumber! + 1,
        'unresolved onward round',
      );
      requirePassage(
        next.drawPositions?.includes(position) || !positionsOf(next).some((p) => current.includes(p)),
        'passage would replace an earlier advance',
      );
    }
    match = next;
  }
  throw new PassageAbstention('arrival exceeds three onward hops');
}

function checkByeLoserSeat(graph: PassageGraph, holder: HydratedMatchUp, edge: PositionTargets) {
  const { loserMatchUp: home, loserTargetDrawPosition: p } = edge.targetMatchUps;
  if (
    !home ||
    home.structureId === holder.structureId ||
    home.matchUpId === holder.winnerMatchUpId ||
    !positionsOf(holder).some((pos) => graph.seat(holder, pos)?.byeFromPropagation)
  )
    return;
  const seat = p && graph.seat(home, p);
  requirePassage(seat && (seat.bye || seat.participantId), 'propagated holder owes its loser seat a BYE');
}

function placementOps(steps: Step[]): OutcomeOp[] {
  return steps.flatMap(({ match, position, positions, added, announce }): OutcomeOp[] =>
    announce
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: match.matchUpId,
            placedDrawPosition: position,
            drawPositions: positions,
            ...(!added && { noticesOccupiedPosition: true as const }),
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: match.matchUpId },
        ]
      : [],
  );
}
