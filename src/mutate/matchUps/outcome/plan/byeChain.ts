import { buildCarriedExitProvenance, buildSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { carriedExitStatus, arrivedByResult, getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getDrawPositionSideNumber, getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { indexed, lowerFirst, onwardFrom, sideOf } from './planShared';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { findStructure } from '@Acquire/findStructure';
import { carriedByeReplay } from './carriedByeSeat';
import { currentLinkedSeat } from '../view';

// constants and types
import { BYE, DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONTAINER, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { SeatFrame } from './carriedContinuation';
import { TEAM } from '@Constants/matchUpTypes';
import type { WorkingView } from '../overlay';
import type { OutcomeOp } from '../ops';
import type {
  ByeWalk,
  CarryLevel,
  DirectionPlan,
  OutcomeRequest,
  OutcomeView,
  ProjectOutcome,
  WinnerLoserSeat,
} from '../types';

/**
 * The BYEs a double exit with loser links places and what they send on (S5, S6, S7): the chain from a seat, double
 * BYEs, the walk of v1's recursion, held losers under `doubleExitPropagateBye: false`, and the produced loser on its
 * structure's final.
 */

type Seat = { structureId: string; drawPosition: number; matchUpId: string };

/**
 * A BYE placed on a seat and what it sends on (`assignDrawPositionBye`): the seat's matchUp becomes a BYE, the position
 * opposite goes on into the next matchUp where there is one, and, the BYE being that matchUp's loser, its loser seat takes
 * a BYE in turn (`advanceDrawPosition`), level by level. `assigns` are the seats deepest first, the order v1 announces the
 * structures' assignments in (each nested placement announces its own before the one that sent it); `writes` are the
 * matchUps in the order v1 writes them.
 */
export type ByeChain = {
  assigns: OutcomeOp[];
  writes: OutcomeOp[];
  matchUpIds: string[];
  /** where the first seat's matchUp sends the position opposite its BYE, and what that matchUp holds after */
  onward?: { matchUpId: string; drawPositions: number[] };
};

/** A BYE service keeps entry evidence separate from the mutable cursor. Assignments fold before
 * descendants; their notices are appended on return. Every child reads the preceding actual writes. */
function byeService(
  view: OutcomeView,
  working: WorkingView,
  seat: Seat,
  named: boolean,
  seen = new Set<string>(),
): ByeChain | undefined {
  const key = `${seat.structureId}/${seat.drawPosition}`;
  if (seen.has(key) || seen.size >= 8) return undefined;
  seen.add(key);
  const { structure } = findStructure({ drawDefinition: working.drawDefinition, structureId: seat.structureId });
  const assignment = positionAssignmentsOf(structure)?.find((entry) => entry.drawPosition === seat.drawPosition);
  if (!structure || !assignment) return undefined;
  if (assignment.bye) return { assigns: [], writes: [], matchUpIds: [] };
  // Container services and lucky BYE limits/pre-feed rounds require their distinct v1 dispatch.
  if (structure.structureType === CONTAINER || isLuckyBasedDraw(working.drawDefinition.drawType)) return undefined;
  const holders = (matchUpsOf(structure) ?? []).filter((entry) => entry.drawPositions?.includes(seat.drawPosition));
  const round = Math.max(...holders.map((entry) => entry.roundNumber ?? 0));
  const furthest = holders.find((entry) => entry.roundNumber === round);
  if (!furthest) return undefined;
  const currentView = () => ({ ...view, inContextDrawMatchUps: working.inContextDrawMatchUps });
  const entry = indexed(currentView(), furthest.matchUpId);
  if (!entry) return undefined;
  const quiet = named ? {} : { announcesEvent: false as const };
  const writes: OutcomeOp[] = [];
  const emit = (ops: OutcomeOp[]) => {
    if (working.apply(ops).error) return false;
    writes.push(...ops);
    return true;
  };
  // Entry facts precede assignBye, which clears the participant and changes every hydrated side.
  const withdrawals = assignment.participantId ? displacedByeOps(working, holders, seat, named) : [];
  const lineUps = assignment.participantId ? displacedByeLineUps(working, seat, named) : [];
  const corrected = holders.filter(
    (held) =>
      held.matchUpId !== furthest.matchUpId &&
      held.winningSide &&
      sideOf(indexed(currentView(), held.matchUpId), seat.drawPosition) === held.winningSide,
  );
  const initial: OutcomeOp[] = [
    { op: 'assignBye', ...seat, byeFromPropagation: true, announcesAssignments: false, ...quiet },
    ...lineUps,
    ...withdrawals,
  ];
  if (!emit(initial)) return undefined;
  for (const held of [furthest, ...corrected]) {
    const stored = working.matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === held.matchUpId);
    if (!stored || !emit(byeResultOps(stored, quiet))) return undefined;
  }
  const updated = indexed(currentView(), furthest.matchUpId);
  const opposite =
    updated?.drawPositions?.filter((position): position is number => !!position && position !== seat.drawPosition) ??
    [];
  if (!updated || opposite.length > 1) return undefined;
  const advance = byeServiceAdvance(currentView(), updated, seat, opposite);
  if (!advance || !emit(advance.ops)) return undefined;
  const child = byeServiceChild(currentView(), working, updated, holders, opposite.length > 0, named, seen);
  if (!child) return undefined;
  writes.push(...child.writes);
  if (!emit([{ op: 'announcePositionAssignments', structureId: seat.structureId, ...quiet }])) return undefined;
  return {
    assigns: [],
    writes,
    onward: advance.onward,
    matchUpIds: [...new Set(writes.flatMap((op) => ('matchUpId' in op && op.matchUpId ? [op.matchUpId] : [])))],
  };
}

/** Certify the ordinary advance branch; releases and immediate carry arrivals remain explicit obligations. */
function byeServiceAdvance(
  view: OutcomeView,
  entry: HydratedMatchUp,
  seat: Seat,
  opposite: number[],
): { ops: OutcomeOp[]; onward?: ByeChain['onward'] } | undefined {
  const winner = indexed(view, entry.winnerMatchUpId);
  if (entry.winnerMatchUpId && !winner) return undefined;
  if (!opposite.length || winner?.structureId !== entry.structureId) return { ops: [] };
  const advancing = entry.sides?.find((side) => side.drawPosition === opposite[0]);
  if (advancing?.bye || winner.drawPositions?.includes(seat.drawPosition)) return undefined;
  const onward = onwardFrom(view, entry, opposite[0], { standing: true });
  const passed = !onward ? throughHeldBye(view, entry, opposite[0]) : undefined;
  if (!onward && !passed) return undefined;
  // A carrier entering a BYE records its provenance immediately, before deferred replay.
  if (passed && advancing?.sideNumber && carriedExitStatus(entry.sideExitProvenance?.[advancing.sideNumber]))
    return undefined;
  return { ops: (passed ?? [onward!]).flatMap(throughByeOps), onward };
}

function byeServiceChild(
  view: OutcomeView,
  working: WorkingView,
  entry: HydratedMatchUp,
  holders: MatchUp[],
  opposed: boolean,
  named: boolean,
  seen: Set<string>,
): ByeChain | undefined {
  if (!entry.loserMatchUpId) return { assigns: [], writes: [], matchUpIds: [] };
  // A lone initial seat sends no loser; a position alone after an earlier BYE does.
  const initialRound = Math.min(...holders.map((held) => held.roundNumber ?? 0));
  if (!opposed && (entry.roundNumber ?? 0) <= initialRound) return undefined;
  const target = positionTargets({ ...working, matchUpId: entry.matchUpId });
  const child = target.targetMatchUps?.loserMatchUp;
  const link = target.targetLinks?.loserTargetLink;
  const lonePosition =
    child && link && entry.roundPosition
      ? getSideDrawPosition({
          structureId: link.target.structureId,
          sideNumber: 2 - (entry.roundPosition % 2),
          matchUp: child,
          drawDefinition: working.drawDefinition,
        })
      : undefined;
  const drawPosition = opposed ? target.targetMatchUps?.loserTargetDrawPosition : lonePosition;
  if (target.error || !child?.structureId || !drawPosition || child.structureId === entry.structureId) return undefined;
  // Later-round fed placement has its own immediate release semantics, not this service yet.
  if (child.roundNumber !== 1) return undefined;
  return byeService(
    view,
    working,
    { structureId: child.structureId, matchUpId: child.matchUpId, drawPosition },
    // A lone advanced seat calls assignByeToLoserTarget with its event. The opposed advance drops that context.
    named && !opposed,
    seen,
  );
}

function displacedByeOps(working: WorkingView, holders: MatchUp[], seat: Seat, named: boolean): OutcomeOp[] {
  return holders.flatMap((held): OutcomeOp[] => {
    const side = getDrawPositionSideNumber({
      matchUp: { ...held, sides: undefined },
      drawDefinition: working.drawDefinition,
      structureId: seat.structureId,
      drawPosition: seat.drawPosition,
    });
    if (side !== 1 && side !== 2) return [];
    const provenance = getSideExitProvenance({ matchUp: held });
    if (!carriedExitStatus(provenance?.[side])) return [];
    const kept = { ...provenance };
    delete kept[side];
    const other = kept[3 - side];
    if (other?.matchUpStatus === BYE && other.previousMatchUpStatus === BYE) delete kept[3 - side];
    return [
      {
        op: 'setSideExitProvenance',
        matchUpId: held.matchUpId,
        provenance: kept,
        blankExitSide: side,
        announcedAs: 'withdrawDisplacedCarry',
        ...(named ? {} : { announcesEvent: false }),
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: held.matchUpId },
    ];
  });
}

function displacedByeLineUps(working: WorkingView, seat: Seat, named: boolean): OutcomeOp[] {
  return working.inContextDrawMatchUps.flatMap((entry): OutcomeOp[] => {
    if (entry.structureId !== seat.structureId || entry.matchUpType !== TEAM) return [];
    const side = sideOf(entry, seat.drawPosition);
    const stored = working.matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === entry.matchUpId);
    if (!side || !stored?.sides?.find((candidate) => candidate.sideNumber === side)?.lineUp) return [];
    return [
      {
        op: 'setSideLineUp',
        matchUpId: entry.matchUpId,
        sideNumber: side,
        lineUp: undefined,
        clearsLineUp: true,
        announcedAs: 'assignDrawPositionBye-TEAM',
        ...(named ? {} : { announcesEvent: false }),
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ];
  });
}

function byeResultOps(entry: MatchUp, quiet: { announcesEvent?: false }): OutcomeOp[] {
  const provenance = getSideExitProvenance({ matchUp: entry });
  const arrivals = ([1, 2] as const).filter((side) => arrivedByResult(provenance?.[side]));
  const kept = { ...provenance };
  for (const side of arrivals) delete kept[side];
  return [
    ...(arrivals.length
      ? [{ op: 'setSideExitProvenance' as const, matchUpId: entry.matchUpId, provenance: kept }]
      : []),
    { op: 'setMatchUpBye', matchUpId: entry.matchUpId, preservesOrderOfFinish: true, ...quiet },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
  ];
}

/**
 * The chain from `first`, planned where every step is clean: the seat's matchUp holding at most one other position, that
 * position going on into a clean matchUp with room (or nowhere, a final), and each further seat (`levels`, read before the
 * call) behind a link with no condition, in a first round, free with nobody and no BYE beside it, its matchUp to be played
 * holding no result, exit, codes or provenance. A matchUp holding no other position that links its loser on, and a walk
 * that reached v1's bound (F9), are v1's. `announced`: whether v1 names the event for the first seat (deeper seats are
 * placed with none)
 */
function byeChain(...args: Parameters<typeof byeChainProgram>): ReturnType<typeof byeChainProgram> {
  const chain = byeChainProgram(...args);
  if (!chain) return undefined;
  return assignmentReturns(chain);
}

/** assignDrawPositionBye announces on return: deepest child first, after the chain's matchUp writes. */
function assignmentReturns(chain: ByeChain): ByeChain {
  return {
    ...chain,
    assigns: chain.assigns.map((op): OutcomeOp =>
      op.op === 'assignBye' ? { ...op, announcesAssignments: false } : op,
    ),
    writes: [
      ...chain.writes,
      ...chain.assigns.flatMap((op): OutcomeOp[] =>
        op.op === 'assignBye'
          ? [{ op: 'announcePositionAssignments', structureId: op.structureId, announcesEvent: op.announcesEvent }]
          : [],
      ),
    ],
  };
}

function byeChainProgram(
  view: OutcomeView,
  first: Seat,
  chain: { levels: CarryLevel[]; bounded: boolean } | undefined,
  announced: boolean,
  doubled?: boolean,
): ByeChain | undefined {
  const planned: ByeChain = { assigns: [], writes: [], matchUpIds: [] };
  let seat = first;
  let beside = !!doubled;
  for (let index = 0; ; index += 1) {
    // The supplied view is the state at this seat's phase; deeper seats are placed with no event.
    const step = byeStep(view, seat, {
      namesEvent: index === 0 && announced,
      besideBye: beside,
    });
    if (!step) return undefined;
    planned.assigns.unshift(step.assign);
    planned.writes.push(...step.writes);
    planned.matchUpIds.push(...step.matchUpIds);
    if (index === 0 && step.onward) planned.onward = step.onward;
    // a double BYE's matchUp was a BYE already, and sent its BYE across its loser link when it became one: v1 places
    // nothing more there (measured: every such seat the view reads holds that BYE), and the chain ends (S7)
    if (!step.entry.loserMatchUpId || beside) return planned;
    const level = chain?.levels[index];
    if (!step.opposed || !chain || chain.bounded || level?.fromMatchUpId !== step.entry.matchUpId) return undefined;
    // the seat beyond holds a BYE already: v1 places nothing there, and the chain ends (S6 tail, the BYE chain)
    if (level.seat?.bye) return planned;
    const clean = cleanByeLevel(view, level);
    if (!clean) return undefined;
    beside = clean === 'doubled';
    seat = { structureId: level.structureId, drawPosition: level.drawPosition, matchUpId: level.matchUpId };
  }
}

/**
 * One BYE of a chain: the seat's BYE, its matchUp a BYE, and the position opposite sent on where there is a next
 * matchUp (into a clean one only); for a double BYE (`besideBye`, a BYE opposite the seat) the matchUp is left as it stands
 * and the BYE goes on as `byeAdvanced` plans it. Undefined where a step is not clean
 */
function byeStep(
  view: OutcomeView,
  seat: Seat,
  {
    namesEvent,
    besideBye,
  }: {
    namesEvent: boolean;
    besideBye: boolean;
  },
) {
  const entry = indexed(view, seat.matchUpId);
  const opposite = (entry?.drawPositions ?? []).filter(
    (position): position is number => !!position && position !== seat.drawPosition,
  );
  if (!entry || opposite.length > 1) return undefined;
  const winner = indexed(view, entry.winnerMatchUpId);
  if (entry.winnerMatchUpId && !winner) return undefined;
  // assignDrawPositionBye advances through a winner only within this structure; a winner link sends nothing.
  const sends = !!opposite.length && winner?.structureId === entry.structureId && !besideBye;
  const direct = sends ? onwardFrom(view, entry, opposite[0]) : undefined;
  // a next matchUp a BYE already: the position goes into it and through it; no `onward` is named for it, so a later
  // chain touching either matchUp is refused as an overlap
  const passed = sends && !direct ? throughHeldBye(view, entry, opposite[0]) : undefined;
  const onward = direct;
  const quiet = namesEvent ? {} : { announcesEvent: false as const };
  const byeOnward = besideBye ? byeAdvanced(view, entry, seat.drawPosition, quiet) : undefined;
  if ((sends && !onward && !passed) || (besideBye && !byeOnward)) return undefined;
  const assign: OutcomeOp = { op: 'assignBye', ...seat, byeFromPropagation: true, ...quiet };
  // a matchUp a BYE already (the double BYE's) is left as it stands: v1 neither rewrites nor announces it
  const bye: OutcomeOp[] = besideBye
    ? []
    : [
        { op: 'setMatchUpBye', matchUpId: seat.matchUpId, ...quiet },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: seat.matchUpId },
      ];
  return {
    entry,
    assign,
    onward,
    opposed: !!opposite.length,
    writes: [...bye, ...(passed ?? (onward ? [onward] : [])).flatMap(throughByeOps), ...(byeOnward?.ops ?? [])],
    matchUpIds: [
      seat.matchUpId,
      ...(passed ?? (onward ? [onward] : [])).map(({ matchUpId }) => matchUpId),
      ...(byeOnward?.matchUpIds ?? []),
    ],
  };
}

/**
 * A double BYE (`assignDrawPositionBye` beside a BYE): the seat's position already stands in the next matchUp, advanced
 * there by the BYE opposite, and is now a BYE, so that matchUp becomes a BYE and the one other position it holds goes
 * on into the matchUp after it, which must be clean. Planned where the next matchUp is to be played holding that position
 * and one other, no result or provenance, and links no loser on. Undefined otherwise
 */
function byeAdvanced(
  view: OutcomeView,
  entry: HydratedMatchUp,
  seatPosition: number,
  quiet: { announcesEvent?: false },
): { ops: OutcomeOp[]; matchUpIds: string[] } | undefined {
  // a final: the BYE goes nowhere; v1 writes the matchUp, a BYE already, as a BYE again
  if (!entry.winnerMatchUpId)
    return {
      ops: [
        { op: 'setMatchUpBye', matchUpId: entry.matchUpId, ...quiet },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
      ],
      matchUpIds: [],
    };
  const onward = indexed(view, entry.winnerMatchUpId);
  const held = (onward?.drawPositions ?? []).filter((position): position is number => !!position);
  const others = held.filter((position) => position !== seatPosition);
  if (!onward || onward.structureId !== entry.structureId || onward.loserMatchUpId) return undefined;
  // a BYE the position passed through (a feed round's fed BYE included, S6 tail): left as it stands, the BYE going on
  // where the position stands
  if (onward.matchUpStatus === BYE && byeOpposite(onward, seatPosition))
    return byeAdvanced(view, onward, seatPosition, quiet);
  if (onward.matchUpStatus !== TO_BE_PLAYED || onward.winningSide || onward.score?.scoreStringSide1) return undefined;
  if (Object.keys(onward.sideExitProvenance ?? {}).length || onward.sides?.some((side) => side.bye)) return undefined;
  if (!held.includes(seatPosition) || others.length > 1) return undefined;
  const bye: OutcomeOp[] = [
    { op: 'setMatchUpBye', matchUpId: onward.matchUpId, ...quiet },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
  ];
  // nothing beside it, or the structure's last round: the position beside it goes nowhere (S6 tail, the BYE chain)
  if (!others.length || !onward.winnerMatchUpId) return { ops: bye, matchUpIds: [onward.matchUpId] };
  const next = onwardFrom(view, onward, others[0]);
  if (!next) return undefined;
  return {
    ops: [...bye, ...throughByeOps(next)],
    matchUpIds: [onward.matchUpId, next.matchUpId],
  };
}

/**
 * The next matchUp a BYE already, its other side the BYE alone: the position goes into it and on through it, into a
 * clean matchUp after it. Undefined otherwise
 */
function throughHeldBye(
  view: OutcomeView,
  entry: HydratedMatchUp,
  drawPosition: number,
): { matchUpId: string; drawPositions: number[] }[] | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  if (!next || next.structureId !== entry.structureId || next.matchUpStatus !== BYE || next.loserMatchUpId)
    return undefined;
  if (held.length !== 1 || held.includes(drawPosition) || !next.sides?.some((side) => side.bye)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || next.matchUpStatusCodes?.length) return undefined;
  const beyond = onwardFrom(view, next, drawPosition);
  if (!beyond) return undefined;
  const into = { matchUpId: next.matchUpId, drawPositions: [...held, drawPosition].sort((a, b) => a - b) };
  return [into, beyond];
}

/** a BYE matchUp holding the position and a BYE opposite it: a double BYE the position passed through */
function byeOpposite(matchUp: HydratedMatchUp, position: number): boolean {
  const seated = matchUp.sides?.find((side) => side.drawPosition === position);
  const other = matchUp.sides?.find((side) => side.drawPosition && side.drawPosition !== position);
  return !!seated && !seated.bye && !!other?.bye;
}

/**
 * A further level a BYE goes on to: a first-round seat, free, behind no condition, in a clean matchUp. Alone, its matchUp
 * to be played (`clean`); or opposite a BYE, its matchUp a BYE already (`doubled`, a double BYE as `byeAdvanced` plans it)
 */
function cleanByeLevel(view: OutcomeView, level: CarryLevel): 'clean' | 'doubled' | false {
  if (level.linkCondition || !level.seat?.free) return false;
  const doubled = level.seat.opponentBye;
  if (level.seat.opponentHeld && !doubled) return false;
  if (level.matchUpStatus !== (doubled ? BYE : TO_BE_PLAYED) || level.hasResult || level.carriesExit) return false;
  if (!level.record || level.record.provenance || level.record.matchUpStatusCodes?.length) return false;
  if (indexed(view, level.matchUpId)?.roundNumber !== 1) return false;
  return doubled ? 'doubled' : 'clean';
}

/** a position advanced through a BYE a double exit placed, announced as v1's `advanceWinner`, with no event */
const throughByeOps = (onward: { matchUpId: string; drawPositions: number[] }): OutcomeOp[] => [
  {
    op: 'setMatchUpDrawPositions',
    matchUpId: onward.matchUpId,
    drawPositions: onward.drawPositions,
    advancesThroughBye: true,
  },
  { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
];

type DoubleExitSeats = {
  /** this matchUp's loser seat across its link: a BYE there and what it sends on */
  own?: ByeChain;
  /** Deferred replay certified from the completed immediate state. */
  after?: OutcomeOp[];
  /** the seat the next matchUp's loser link feeds, which its produced exit leaves nobody to fill: a BYE and its chain */
  unfillable?: ByeChain;
  /** under `doubleExitPropagateBye: false`: the exit produced on this matchUp's loser matchUp, in place of `own` */
  producedLoser?: ProducedLoser;
  /** under `doubleExitPropagateBye: false`, a BYE opposite the loser seat: the exit recorded there and carried on */
  heldLoser?: HeldLoser;
  /** the held exit carried on past the unfillable seat's BYE: the matchUp it lands in and the position's advance there,
   * which v1 makes after the produced exit (S7) */
  heldBeyond?: { matchUpId: string; arrivalSide: 1 | 2; advanceOps: OutcomeOp[] };
};

type HeldLoser = {
  /** the loser matchUp, a BYE, which records the exit on the seat's side */
  byeMatchUpId: string;
  /** its structure, which v1's writes there stamp */
  structureId: string;
  seatSide: 1 | 2;
  /** the BYE-held matchUps past it the seat's position already stands in, each recording the exit on that side (S7) */
  relays: { matchUpId: string; sideNumber: 1 | 2 }[];
  /** the matchUp the seat's position stands in past the BYEs, which takes the exit pending; none in the last round */
  onward?: { matchUpId: string; arrivalSide: 1 | 2; awarded?: HeldAward };
};

/** a participant standing opposite the held exit's landing: the exit is theirs, and they go on (S7) */
type HeldAward = { next?: { matchUpId: string; drawPositions: number[] } };

type ProducedLoser = {
  matchUpId: string;
  /** the loser matchUp's structure, which v1's score write there stamps */
  structureId: string;
  /** the side the loser seat is on, which the exit's origin is recorded on; the exit is awarded to the other */
  seatSide: 1 | 2;
  /** the empty position opposite, advanced ahead of the arrival it awaits (a reservation); none from a final (S7) */
  onward?: { matchUpId: string; drawPositions: number[] };
  /** the loser matchUp's own loser seat, which nobody will lose into: a BYE placed with no event, and its chain */
  beyond?: ByeChain;
};

/**
 * The BYEs a double exit with loser links places (`doubleExitAdvancement`, `propagateUnfillableLoserBye`): nobody loses
 * this matchUp, so the seat its link feeds takes a propagated BYE, with all it sends on (`byeChain`); nobody will lose
 * the next matchUp either (its produced exit is pending, or awarded to the winner standing there), so the seat ITS link
 * feeds takes a BYE too, with its chain. Planned where each first seat is clean (a link with no condition, a free seat
 * with no BYE beside it, the matchUp to be played holding no result, exit, codes or provenance; a participant opposite
 * this matchUp's seat goes on through its BYE as an empty position does), each chain plans, and no matchUp is in two.
 */
function doubleExitSeats(
  view: OutcomeView,
  entry: HydratedMatchUp | undefined,
  frame: SeatFrame,
  project?: ProjectOutcome,
): DoubleExitSeats | undefined {
  const seats = serveSeats(view, entry, frame, project);
  if (seats === false) return undefined;
  if (seats || !frame.propagatesBye) return seats;
  // the chain's shapes refused: the seats as v1's `assignDrawPositionBye` recursion walks them (S6 tail, the BYE chain)
  return walkedSeats(view, entry);
}

/** The source adapter: the frame the double exit's own call serves, its seat read once from the entry view. */
export function sourceSeatFrame(
  view: OutcomeView,
  request: OutcomeRequest,
  prefix: OutcomeOp[] = [],
  following: OutcomeOp[] = [],
): SeatFrame {
  const { targets } = view;
  const { loserStructureId: structureId, loserTargetDrawPosition: drawPosition, loserMatchUpId: matchUpId } = targets;
  const originMatchUpId = request.matchUpId as string;
  const status = request.matchUpStatus as MatchUpStatusUnion;
  return {
    kind: 'seat',
    phase: 'source',
    originMatchUpId,
    cascadeStatus: status,
    lineage: { sourceMatchUpId: originMatchUpId, previousMatchUpStatus: status },
    snapshotAt: 0,
    prefix,
    following,
    propagatesBye: !!view.draw.doubleExitPropagatesBye,
    seat: {
      linked: !!targets.loserLink || !!targets.loserMatchUpId,
      ...(structureId && drawPosition && matchUpId ? { at: { structureId, drawPosition, matchUpId } } : {}),
      linkCondition: targets.loserLink?.linkCondition,
      // a fed seat (a feed round's) takes a BYE whatever `doubleExitPropagateBye` says (S7)
      fed: !!indexed(view, matchUpId)?.feedRound,
      opponentBye: !!targets.loserTargetSeat?.opponentBye,
    },
  };
}

/** The frame's case (§2.1): the BYE service, or under `doubleExitPropagateBye: false` the exit held beside a BYE, the
 * exit produced on the loser matchUp, or no seat of its own. */
type SeatCase = 'bye' | 'held' | 'produced' | 'unlinked';

function seatCase({ propagatesBye, seat }: SeatFrame): SeatCase {
  if (propagatesBye || (seat.fed && !seat.opponentBye)) return 'bye';
  if (seat.opponentBye) return 'held';
  return seat.linked ? 'produced' : 'unlinked';
}

type SeatCursor = { working: WorkingView; failed: boolean };

/** The stored state a frame reads: its prefix projected, a failed fold remembered (a refusal no walk replaces). */
function frameCursor(frame: SeatFrame, project?: ProjectOutcome): SeatCursor | undefined {
  const working = project?.(frame.prefix);
  if (!working) return undefined;
  const cursor = { working, failed: false };
  const apply = working.apply;
  working.apply = (ops) => {
    const result = apply(ops);
    cursor.failed ||= !!result.error;
    return result;
  };
  return cursor;
}

const atCursor = (view: OutcomeView, working: WorkingView) => ({
  ...view,
  inContextDrawMatchUps: working.inContextDrawMatchUps,
});

/** One service for a frame's seats: its own seat by its case's builder, then the seat the produced exit's link feeds,
 * then the case's certificate. The BYE service reads the cursor; held and produced exits read the entry view. */
function serveSeats(
  view: OutcomeView,
  entry: HydratedMatchUp | undefined,
  frame: SeatFrame,
  project?: ProjectOutcome,
): DoubleExitSeats | false | undefined {
  const service = seatCase(frame);
  const cursor = service === 'bye' ? frameCursor(frame, project) : undefined;
  if (service === 'bye' && !cursor) return false;
  const seats = ownSeat(view, frame, service, cursor);
  if (!seats) return seats;
  if (entry?.loserMatchUpId) {
    const unfillable = unfillableSeat(view, entry, frame, service, seats, cursor, project);
    if (!unfillable) return unfillable;
    seats.unfillable = unfillable;
    if (!joinHeldLanding(view, seats)) return undefined;
  }
  if (cursor) return servicedSeats(view, entry, frame, seats, cursor);
  if (service === 'held') return completeDeferredSeats(seats, entry);
  // Cross-phase overlap is read from the cursor. Internal repeated writes and changes to the produced target
  // still need their own dependency proof; an ordinary seat program does not certify either.
  return producedSeatsComplete(seats, entry) ? seats : undefined;
}

/** this matchUp's loser seat: a BYE and its chain on the cursor, or the exit held or produced in place of the BYE */
function ownSeat(
  view: OutcomeView,
  frame: SeatFrame,
  service: SeatCase,
  cursor?: SeatCursor,
): DoubleExitSeats | false | undefined {
  if (service === 'held') {
    const held = heldLoser(view);
    return held && { heldLoser: held };
  }
  if (service === 'produced') {
    const produced = producedLoser(view);
    return produced && { producedLoser: produced };
  }
  const { seat } = frame;
  if (!cursor || !seat.linked) return {};
  if (seat.linkCondition || !seat.at) return undefined;
  const own = byeService(atCursor(view, cursor.working), cursor.working, seat.at, true);
  if (own) return { own };
  return cursor.failed ? false : undefined;
}

/** the seat the produced exit's link feeds, which nobody will lose into: a BYE and its chain, as the case reads it */
function unfillableSeat(
  view: OutcomeView,
  entry: HydratedMatchUp,
  frame: SeatFrame,
  service: SeatCase,
  seats: DoubleExitSeats,
  cursor: SeatCursor | undefined,
  project?: ProjectOutcome,
): ByeChain | false | undefined {
  if (service === 'held') return unfillableByeChain(view, entry);
  if (!cursor) return projectedUnfillable(view, entry, seats, frame, project);
  const selected = view.targets.winnerLoserSeat;
  if (
    !selected ||
    selected.matchUpId !== entry.loserMatchUpId ||
    (selected.linkCondition && selected.linkCondition !== FIRST_MATCHUP)
  )
    return undefined;
  const unfillable = byeService(atCursor(view, cursor.working), cursor.working, selected, false);
  if (unfillable) return unfillable;
  return cursor.failed ? false : undefined;
}

/** Both immediate seats share one cursor. Deferred carry selection follows the produced write too. */
function servicedSeats(
  view: OutcomeView,
  entry: HydratedMatchUp | undefined,
  frame: SeatFrame,
  seats: DoubleExitSeats,
  cursor: SeatCursor,
): DoubleExitSeats | false | undefined {
  const { working } = cursor;
  if (
    [...(seats.own?.matchUpIds ?? []), ...(seats.unfillable?.matchUpIds ?? [])].some(
      (id) => id === frame.originMatchUpId || id === entry?.matchUpId,
    )
  )
    return undefined;
  if (working.apply(frame.following).error) return false;
  seats.after = carriedByeReplay(view, working);
  if (seats.after) return seats;
  return cursor.failed ? false : undefined;
}

/** the seats' BYEs as the view's walk of v1's recursion places them, each written as the chain's own ops are */
function walkedSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const { targets } = view;
  const walk = targets.byeWalk;
  const ownSeat = !!targets.loserLink || !!targets.loserMatchUpId;
  if (!walk || (ownSeat && !walk.own) || (entry?.loserMatchUpId && !walk.unfillable)) return undefined;
  return {
    ...(ownSeat && walk.own ? { own: walkChain(walk.own) } : {}),
    ...(entry?.loserMatchUpId && walk.unfillable ? { unfillable: walkChain(walk.unfillable) } : {}),
  };
}

export function walkChain(walk: ByeWalk): ByeChain {
  return assignmentReturns(walkChainProgram(walk));
}

function walkChainProgram(walk: ByeWalk): ByeChain {
  const quiet = (named: boolean) => (named ? {} : { announcesEvent: false as const });
  return {
    assigns: walk.assigns.map(({ structureId, drawPosition, matchUpId, named }) => ({
      op: 'assignBye' as const,
      byeFromPropagation: true as const,
      structureId,
      drawPosition,
      matchUpId,
      ...quiet(named),
    })),
    writes: walk.writes.flatMap((write, index): OutcomeOp[] => {
      if (write.kind === 'advance') return throughByeOps(write);
      // a displaced carrier's landing: the carry withdrawn, the matchUp a BYE, its `scoredTime` taken by the pass that
      // announces it (`withdrawDisplacedCarry`, `setMatchUpStatusBYE`, `reconcileScoredTimes`)
      if (write.kind === 'displaced') {
        const bye = walk.writes[index + 1];
        return [
          { op: 'setSideExitProvenance', matchUpId: write.matchUpId },
          { op: 'setMatchUpBye', matchUpId: write.matchUpId, ...(bye?.kind === 'bye' ? quiet(bye.named) : {}) },
          {
            op: 'setMatchUpResult',
            matchUpId: write.matchUpId,
            matchUpStatus: BYE,
            announcedAs: 'reconcileScoredTimes',
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: write.matchUpId },
        ];
      }
      if (walk.writes[index - 1]?.kind === 'displaced') return [];
      return [
        { op: 'setMatchUpBye', matchUpId: write.matchUpId, ...quiet(write.named) },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: write.matchUpId },
      ];
    }),
    matchUpIds: walk.matchUpIds,
  };
}

/** Held origins retain their existing deferred-phase certificate. */
function completeDeferredSeats(seats: DoubleExitSeats, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const touched = [
    ...(seats.unfillable?.matchUpIds ?? []),
    ...(seats.heldLoser
      ? [
          seats.heldLoser.byeMatchUpId,
          ...seats.heldLoser.relays.map(({ matchUpId }) => matchUpId),
          ...(seats.heldLoser.onward ? [seats.heldLoser.onward.matchUpId] : []),
        ].filter((matchUpId) => !seats.heldBeyond || matchUpId !== seats.unfillable?.matchUpIds[0])
      : []),
    ...(entry ? [entry.matchUpId] : []),
  ];
  return new Set(touched).size === touched.length ? seats : undefined;
}

function producedSeatsComplete(seats: DoubleExitSeats, entry?: HydratedMatchUp): boolean {
  const own = producedLoserMatchUpIds(seats.producedLoser);
  const unfillable = seats.unfillable?.matchUpIds ?? [];
  return (
    new Set(own).size === own.length &&
    new Set(unfillable).size === unfillable.length &&
    (!entry || ![...own, ...unfillable].includes(entry.matchUpId))
  );
}

const immediateSeatMatchUpIds = (seats: DoubleExitSeats) => [
  ...(seats.own?.matchUpIds ?? []),
  ...producedLoserMatchUpIds(seats.producedLoser),
];

/** A policy-off unfillable seat starts after its produced-loser program. Held exits use their deferred certificate. */
function projectedUnfillable(
  view: OutcomeView,
  entry: HydratedMatchUp,
  seats: DoubleExitSeats,
  frame: SeatFrame,
  project?: ProjectOutcome,
): ByeChain | false | undefined {
  const selected = view.targets.winnerLoserSeat;
  if (!selected) return undefined;
  const working = frameCursor(frame, project)?.working;
  const produced = seats.producedLoser ? producedLoserOps(frame, seats.producedLoser) : [];
  if (!working || working.apply(produced).error) return false;
  const current = currentLinkedSeat(working, working.matchUpsMap, selected);
  if (!current) return undefined;
  const planned = unfillableByeChain(atCursor(view, working), entry, current);
  if (!planned) return undefined;
  if (working.apply([...planned.assigns, ...planned.writes]).error) return false;
  return planned;
}

/**
 * The held exit's landing the unfillable seat's BYE makes a BYE (S7): the exit carried on past it (`heldBeyond`), and the
 * position's advance there taken out of the unfillable chain's writes, made after the produced exit. False where it is
 * not planned; true where there is nothing to join
 */
function joinHeldLanding(view: OutcomeView, seats: DoubleExitSeats): boolean {
  const { heldLoser: held, unfillable } = seats;
  if (!held?.onward || !unfillable || held.onward.matchUpId !== unfillable.matchUpIds[0]) return true;
  const position = view.targets.loserTargetDrawPosition;
  const beyond = position ? heldBeyond(view, held, unfillable, position) : undefined;
  if (!beyond) return false;
  const arrives = (op: OutcomeOp) =>
    (op.op === 'setMatchUpDrawPositions' || (op.op === 'stampUpdatedAt' && op.entity === 'matchUp')) &&
    ('matchUpId' in op ? op.matchUpId : op.id) === beyond.matchUpId;
  seats.heldBeyond = { ...beyond, advanceOps: unfillable.writes.filter(arrives) };
  seats.unfillable = { ...unfillable, writes: unfillable.writes.filter((op) => !arrives(op)) };
  return true;
}

/** this matchUp's loser seat, a BYE placed with the event named (`handleLoserMatchUp`), and its chain */
export function ownByeChain(view: OutcomeView): ByeChain | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  const { loserStructureId, loserTargetDrawPosition, loserMatchUpRecord, loserMatchUpId } = targets;
  if (targets.loserLink?.linkCondition || !loserMatchUpId || !loserStructureId || !loserTargetDrawPosition)
    return undefined;
  // a participant opposite goes on through the BYE as an empty position would; a BYE opposite makes a double BYE, the
  // matchUp a BYE already
  const doubled = !!seat?.opponentBye;
  if (!seat?.free) return undefined;
  if (targets.loserMatchUpStatus !== (doubled ? BYE : TO_BE_PLAYED)) return undefined;
  if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const first = { structureId: loserStructureId, drawPosition: loserTargetDrawPosition, matchUpId: loserMatchUpId };
  return byeChain(view, first, targets.byeLevels?.own, true, doubled);
}

/** the produced exit's matchUp's loser seat, a BYE placed with no event (`conditionallyAdvanceDrawPosition`), and its chain */
export function unfillableByeChain(
  view: OutcomeView,
  entry: HydratedMatchUp,
  from: { seat?: WinnerLoserSeat; levels?: { levels: CarryLevel[]; bounded: boolean } } = {
    seat: view.targets.winnerLoserSeat,
    levels: view.targets.byeLevels?.unfillable,
  },
): ByeChain | undefined {
  const unfillable = from.seat;
  // v1 places this BYE behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition): nobody loses here
  const conditioned = unfillable?.linkCondition && unfillable.linkCondition !== FIRST_MATCHUP;
  if (!unfillable || conditioned || unfillable.matchUpId !== entry.loserMatchUpId) return undefined;
  if (!unfillable.seat?.free) return undefined;
  const standing = !!unfillable.seat.opponentBye && unfillable.matchUpStatus === BYE;
  if (unfillable.seat.opponentBye && !standing) return undefined;
  if (unfillable.matchUpStatus !== (standing ? BYE : TO_BE_PLAYED) || unfillable.hasResult) return undefined;
  const record = indexed(view, unfillable.matchUpId);
  if (!record || record.matchUpStatusCodes?.length || Object.keys(record.sideExitProvenance ?? {}).length)
    return undefined;
  const { structureId, drawPosition, matchUpId } = unfillable;
  const first = { structureId, drawPosition, matchUpId };
  return byeChain(view, first, from.levels, false, standing);
}

// The held exit's landing readers (`heldLoser`, `heldLanding`, `heldAward`, `heldBeyond`) are kept apart from the
// carry's (`landingAt` and its siblings in `carriedExit.ts`) by ruling 11; the comment there says why.
/**
 * Under `doubleExitPropagateBye: false`, a loser seat opposite a BYE (its matchUp a BYE already): v1 records the exit the
 * double exit produces on the BYE matchUp, on the seat's side, its score removed (`stampExitOnByeHeldLoserTarget`), and
 * carries it on (`carryExitOnward`) into the matchUp the seat's position already stands in, advanced there by the BYE.
 * Where that matchUp is BYE-held too (a double BYE beyond), the exit is recorded there as well and carried on again, to
 * the structure's last round or to a matchUp to be played, where it lands pending with its origin on that side (S7).
 * Planned behind a link with no condition, each BYE matchUp holding no codes or provenance, and the landing to be played
 * holding no result, BYE, exit or provenance and nobody on the other side, whose other feeder is still to be played or a
 * BYE (the position it advanced waits for its arrival), or which is a fed seat.
 */
function heldLoser(view: OutcomeView): HeldLoser | undefined {
  const { targets } = view;
  const { loserTargetDrawPosition: drawPosition, loserMatchUpRecord, loserTargetSeat: seat } = targets;
  const byeMatchUp = indexed(view, targets.loserMatchUpId);
  if (targets.loserLink?.linkCondition || !byeMatchUp || !drawPosition || !seat?.free) return undefined;
  if (targets.loserMatchUpStatus !== BYE || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const seatSide = byeMatchUp.feedRound ? 1 : sideOf(byeMatchUp, drawPosition);
  if (!seatSide) return undefined;
  const held = { byeMatchUpId: byeMatchUp.matchUpId, structureId: byeMatchUp.structureId, seatSide: seatSide as 1 | 2 };
  const relays: HeldLoser['relays'] = [];
  let from = byeMatchUp;
  for (let hop = 0; hop < 8; hop += 1) {
    const onward = indexed(view, from.winnerMatchUpId);
    // the structure's last round: the exit recorded beside the BYEs stops there
    if (!onward) return { ...held, relays };
    const arrivalSide = sideOf(onward, drawPosition);
    if (!arrivalSide || onward.structureId !== byeMatchUp.structureId || onward.winningSide) return undefined;
    if (onward.score?.scoreStringSide1 || Object.keys(onward.sideExitProvenance ?? {}).length) return undefined;
    if (onward.matchUpStatusCodes?.length) return undefined;
    const other = onward.sides?.find((side) => side.sideNumber === 3 - arrivalSide);
    if (onward.matchUpStatus === BYE) {
      // a BYE-held matchUp the position passes: the BYE stands opposite it
      if (!other?.bye || onward.sides?.find((side) => side.sideNumber === arrivalSide)?.bye) return undefined;
      relays.push({ matchUpId: onward.matchUpId, sideNumber: arrivalSide });
      from = onward;
      continue;
    }
    // a participant standing opposite: the exit is awarded to them, and they go on into a clean next matchUp (S7)
    const awarded = other?.participantId ? heldAward(view, onward, other.drawPosition) : undefined;
    if (other?.participantId && !awarded) return undefined;
    if (!awarded && !heldLanding(view, from, onward, arrivalSide)) return undefined;
    return { ...held, relays, onward: { matchUpId: onward.matchUpId, arrivalSide, ...(awarded ? { awarded } : {}) } };
  }
  return undefined;
}

/** the held exit's landing awarded to the participant opposite: to be played, and their next matchUp clean or none */
function heldAward(view: OutcomeView, landing: HydratedMatchUp, drawPosition?: number): HeldAward | undefined {
  // a landing that links its loser on: decided, nobody loses it, and v1 sends a BYE across that link too (v1's)
  if (landing.loserMatchUpId || landing.matchUpStatus !== TO_BE_PLAYED || !drawPosition) return undefined;
  if (landing.sides?.some((side) => side.bye)) return undefined;
  if (!landing.winnerMatchUpId) return {};
  const next = onwardFrom(view, landing, drawPosition);
  return next ? { next } : undefined;
}

/**
 * a matchUp a held exit lands in, pending: to be played, holding no BYE and nobody on the other side, whose other feeder
 * is still to be played or a BYE (the position it advanced waits for its arrival), or a fed seat with no feeder. The
 * caller has read its result, score, codes and provenance
 */
function heldLanding(view: OutcomeView, from: HydratedMatchUp, landing: HydratedMatchUp, arrivalSide: 1 | 2): boolean {
  const other = landing.sides?.find((side) => side.sideNumber === 3 - arrivalSide);
  if (landing.matchUpStatus !== TO_BE_PLAYED || landing.sides?.some((side) => side.bye)) return false;
  if (other?.participantId) return false;
  const feeder = view.inContextDrawMatchUps?.find(
    (matchUp) => matchUp.winnerMatchUpId === landing.matchUpId && matchUp.matchUpId !== from.matchUpId,
  );
  const waiting = feeder?.matchUpStatus === TO_BE_PLAYED || feeder?.matchUpStatus === BYE;
  return waiting || (!!landing.feedRound && !feeder);
}

/**
 * The held exit's landing made a BYE by the unfillable seat's BYE (FIRST_MATCH_LOSER_CONSOLATION, behind FIRST_MATCHUP,
 * S7): the landing keeps the exit's origin as it becomes a BYE, and once the produced exit is written v1 advances the
 * position on into the matchUp after it and writes the exit there, pending, with the tournament and no event. Planned
 * where that matchUp is a clean landing in the structure, the position arriving beside another in their order, or alone
 * on the side its feeder's place sends it to. A landing in the structure's last round is v1's (no call measured reaches it)
 */
function heldBeyond(
  view: OutcomeView,
  held: HeldLoser,
  unfillable: ByeChain,
  drawPosition: number,
): { matchUpId: string; arrivalSide: 1 | 2 } | undefined {
  const landing = indexed(view, held.onward?.matchUpId);
  const beyond = indexed(view, unfillable.onward?.matchUpId);
  // the landing in the structure's last round: no measured call reaches it (S7), v1's
  if (!landing || !beyond || unfillable.matchUpIds[0] !== landing.matchUpId) return undefined;
  if (beyond.structureId !== landing.structureId || beyond.feedRound || beyond.winningSide) return undefined;
  if (beyond.score?.scoreStringSide1 || Object.keys(beyond.sideExitProvenance ?? {}).length) return undefined;
  // a participant standing there is awarded the exit (sides read before the advance re-orders them): v1's
  if (beyond.matchUpStatusCodes?.length || beyond.sides?.some((side) => side.participantId)) return undefined;
  // the side the held position takes: beside another position, in their order (the lower side 1); alone in a round that
  // is not fed, the side its feeder's place sends it to, as the structure pairs it (`getOrderedDrawPositions`)
  const positions = unfillable.onward?.drawPositions ?? [];
  if (!positions.includes(drawPosition) || positions.length > 2) return undefined;
  const fedFrom = (2 - ((landing.roundPosition ?? 0) % 2)) as 1 | 2;
  const arrivalSide = positions.length === 2 ? lowerFirst(positions, drawPosition) : fedFrom;
  return heldLanding(view, landing, beyond, arrivalSide) ? { matchUpId: beyond.matchUpId, arrivalSide } : undefined;
}

/** the held exit written where it lands past the unfillable seat's BYE: pending, its origin on the arrival side */
function heldBeyondOps(frame: SeatFrame, beyond: { matchUpId: string; arrivalSide: 1 | 2 }): OutcomeOp[] {
  const status = frame.cascadeStatus;
  const provenance = buildCarriedExitProvenance({
    ...frame.lineage,
    matchUpStatus: status,
    exitingSideNumber: beyond.arrivalSide,
  });
  const { matchUpId } = beyond;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus: status === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      inContextBare: true,
      resetsScore: true,
      score: toBePlayed.score,
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
}

/** the exit recorded on the BYE matchUps and carried on, as v1 writes them, the loser matchUp first */
function heldLoserOps(frame: SeatFrame, held: HeldLoser): OutcomeOp[] {
  const status = frame.cascadeStatus;
  const entry = (exitingSideNumber: 1 | 2) =>
    buildCarriedExitProvenance({
      ...frame.lineage,
      matchUpStatus: status,
      exitingSideNumber,
    });
  const blank = toBePlayed.score;
  const write = (
    matchUpId: string,
    matchUpStatus: MatchUpStatusUnion,
    side: 1 | 2,
    awarded?: HeldAward,
  ): OutcomeOp[] => {
    const provenance = entry(side);
    return [
      {
        op: 'setMatchUpResult',
        matchUpId,
        matchUpStatus,
        ...(awarded ? { winningSide: (3 - side) as 1 | 2 } : {}),
        matchUpStatusCodes: [],
        stampsScoredTime: false,
        announcesContext: false,
        resetsScore: true,
        score: blank,
      },
      ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ];
  };
  const produced = status === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  return [
    ...write(held.byeMatchUpId, BYE, held.seatSide),
    ...held.relays.flatMap(({ matchUpId, sideNumber }) => write(matchUpId, BYE, sideNumber)),
    ...(held.onward ? write(held.onward.matchUpId, produced, held.onward.arrivalSide, held.onward.awarded) : []),
    ...(held.onward?.awarded?.next
      ? [
          // the awarded participant goes on, announced as v1's `advanceWinner`, with the event and the tournament
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: held.onward.awarded.next.matchUpId,
            drawPositions: held.onward.awarded.next.drawPositions,
            advancesThroughBye: true as const,
            announcesEvent: true as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: held.onward.awarded.next.matchUpId },
        ]
      : []),
    { op: 'stampUpdatedAt', entity: 'structure', id: held.structureId },
  ];
}

export const producedLoserMatchUpIds = (produced?: ProducedLoser) =>
  produced
    ? [
        produced.matchUpId,
        ...(produced.onward ? [produced.onward.matchUpId] : []),
        ...(produced.beyond?.matchUpIds ?? []),
      ]
    : [];

/**
 * Under `doubleExitPropagateBye: false` nobody loses the double exit, and its loser matchUp takes a produced exit
 * (`handleLoserMatchUp` → `conditionallyAdvanceDrawPosition`): the double exit's flavour, awarded to the side opposite the
 * seat, its origin recorded on the seat's side, and the position opposite advanced into the next matchUp: a participant
 * standing there goes on, an empty position goes ahead of the arrival it awaits (a reservation). Planned only in a first
 * round, not fed (a fed seat takes a BYE whatever the policy), behind a link with no condition: the seat free with no
 * BYE opposite, the matchUp to be played holding no result, exit, codes or provenance, and the advance into a clean
 * matchUp with room. A loser matchUp that links its own loser on (COMPASS, OLYMPIC) leaves that seat to nobody: a BYE,
 * with all it sends on (`byeChain`).
 */
export function producedLoser(view: OutcomeView): ProducedLoser | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  const loserMatchUp = indexed(view, targets.loserMatchUpId);
  const { loserTargetDrawPosition, loserMatchUpRecord } = targets;
  if (targets.loserLink?.linkCondition || !loserMatchUp || !loserTargetDrawPosition) return undefined;
  if (loserMatchUp.roundNumber !== 1 || loserMatchUp.feedRound || loserMatchUp.hasFedDrawPosition) return undefined;
  // a participant opposite is awarded the exit and goes on, as the empty position would; a BYE opposite is v1's
  if (!seat?.free || seat.opponentBye) return undefined;
  if (targets.loserMatchUpStatus !== TO_BE_PLAYED || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const seatSide = sideOf(loserMatchUp, loserTargetDrawPosition);
  const opposite = (targets.loserMatchUpDrawPositions ?? []).filter((position) => position !== loserTargetDrawPosition);
  const onward = opposite.length === 1 ? onwardFrom(view, loserMatchUp, opposite[0]) : undefined;
  // the loser matchUp its structure's final (a one-round structure, COMPASS's North): the exit is written there and
  // nothing advances (S7)
  if (!seatSide || (!onward && (loserMatchUp.winnerMatchUpId || opposite.length !== 1))) return undefined;
  const produced: ProducedLoser = {
    matchUpId: loserMatchUp.matchUpId,
    structureId: loserMatchUp.structureId,
    seatSide,
    onward,
  };
  if (!loserMatchUp.loserMatchUpId) return produced;
  // a loser matchUp that links its own loser on: nobody will lose it either, so that seat takes a BYE, with its chain
  const levels = targets.byeLevels?.own;
  const [level, ...deeper] = levels?.levels ?? [];
  const clean = levels && level?.fromMatchUpId === loserMatchUp.matchUpId && cleanByeLevel(view, level);
  if (!clean) return undefined;
  const seatAt = { structureId: level.structureId, drawPosition: level.drawPosition, matchUpId: level.matchUpId };
  const doubled = clean === 'doubled';
  const beyond = byeChain(view, seatAt, { levels: deeper, bounded: levels.bounded }, false, doubled);
  return beyond ? { ...produced, beyond } : undefined;
}

/**
 * the exit produced on the loser matchUp, as v1 writes it there: the BYE beyond it first (`conditionallyAdvanceDrawPosition`
 * serves the loser seat before the score), then the exit, its origin, and the advance
 */
export function producedLoserOps(
  frame: Pick<SeatFrame, 'cascadeStatus' | 'lineage'>,
  produced: ProducedLoser,
): OutcomeOp[] {
  const matchUpStatus = frame.cascadeStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: frame.lineage.previousMatchUpStatus,
    sourceMatchUpId: frame.lineage.sourceMatchUpId,
    sourceSideNumber: produced.seatSide,
  });
  return [
    ...(produced.beyond ? [...produced.beyond.assigns, ...produced.beyond.writes] : []),
    {
      op: 'setMatchUpResult',
      matchUpId: produced.matchUpId,
      matchUpStatus,
      winningSide: (3 - produced.seatSide) as 1 | 2,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(matchUpStatus === WALKOVER ? { resetsScore: true, score: toBePlayed.score } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: produced.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: produced.matchUpId },
    ...(produced.onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: produced.onward.matchUpId,
            drawPositions: produced.onward.drawPositions,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: produced.onward.matchUpId },
        ]
      : []),
    { op: 'stampUpdatedAt', entity: 'structure', id: produced.structureId },
  ];
}

/** the double exit's BYEs and what they send on, in the order v1 announces them */
export function doubleExitSeatOps(
  view: OutcomeView,
  request: OutcomeRequest,
  direction?: DirectionPlan,
  project?: ProjectOutcome,
  prefix: OutcomeOp[] = [],
  following: OutcomeOp[] = [],
): { kind: 'planned' | 'not-required'; targetMatchUpId?: string; ops: OutcomeOp[]; after: OutcomeOp[] } | undefined {
  const entry = direction?.produced ? indexed(view, direction.produced.matchUpId) : undefined;
  // a final produces nothing: its own seat's BYE alone (S6 tail, family 8)
  const final = !view.targets.winnerMatchUpId && !direction?.decider;
  // Convergence and other produced writers certify their own seats. This is distinct from failed planning.
  if (!entry && !final) return { kind: 'not-required', ops: [], after: [] };
  const frame = sourceSeatFrame(view, request, prefix, following);
  const seats = doubleExitSeats(view, entry, frame, project);
  if (!seats) return undefined;
  // On this route the pre-seat prefix changes only the source. The first ordinary reader keeps its entry
  // facts only when its successful footprint cannot read that changed source through a backward edge.
  if (!seats.heldLoser && immediateSeatMatchUpIds(seats).includes(request.matchUpId as string)) return undefined;
  const { own, unfillable, producedLoser: produced, heldLoser: held } = seats;
  return {
    kind: 'planned',
    targetMatchUpId: entry?.matchUpId,
    ops: [
      ...(produced ? producedLoserOps(frame, produced) : []),
      ...(held ? heldLoserOps(frame, held) : []),
      ...(own ? [...own.assigns, ...own.writes] : []),
      ...(unfillable ? [...unfillable.assigns, ...unfillable.writes] : []),
    ],
    after: [
      ...(seats.heldBeyond ? [...seats.heldBeyond.advanceOps, ...heldBeyondOps(frame, seats.heldBeyond)] : []),
      ...(seats.after ?? []),
    ],
  };
}
