import { buildCarriedExitProvenance, buildSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { indexed, lowerFirst, onwardFrom, sideOf } from './planShared';
import { carriedByeSeat, carriedByeSeatOps } from './carriedByeSeat';

// constants and types
import type { ByeWalk, CarryLevel, DirectionPlan, OutcomeRequest, OutcomeView, WinnerLoserSeat } from '../types';
import { BYE, DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { CarriedByeSeat } from './carriedByeSeat';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

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
  /** a double BYE at the first seat: the matchUp it makes a BYE, and where that one sends its other position */
  advanced?: { matchUpId: string; next?: { matchUpId: string; drawPositions: number[] } };
  /** the position opposite the first seat sent on through a BYE already standing: the matchUp beyond it, and what it holds */
  passed?: { matchUpId: string; drawPositions: number[] };
};

/**
 * The chain from `first`, planned where every step is clean: the seat's matchUp holding at most one other position, that
 * position going on into a clean matchUp with room (or nowhere, a final), and each further seat (`levels`, read before the
 * call) behind a link with no condition, in a first round, free with nobody and no BYE beside it, its matchUp to be played
 * holding no result, exit, codes or provenance. A matchUp holding no other position that links its loser on, and a walk
 * that reached v1's bound (F9), are v1's. `announced`: whether v1 names the event for the first seat (deeper seats are
 * placed with none)
 */
function byeChain(
  view: OutcomeView,
  first: Seat,
  chain: { levels: CarryLevel[]; bounded: boolean } | undefined,
  announced: boolean,
  doubled?: boolean,
  heldFirst?: number[],
  heldOnward?: { matchUpId: string; drawPositions: number[] },
): ByeChain | undefined {
  const planned: ByeChain = { assigns: [], writes: [], matchUpIds: [] };
  let seat = first;
  let beside = !!doubled;
  for (let index = 0; ; index += 1) {
    // the first seat's matchUp as an earlier write of this call leaves it (a position advanced into it), else as found;
    // deeper seats are placed with no event
    const step = byeStep(view, seat, {
      held: index === 0 ? heldFirst : undefined,
      heldOnward: index === 0 ? heldOnward : undefined,
      namesEvent: index === 0 && announced,
      besideBye: beside,
    });
    if (!step) return undefined;
    planned.assigns.unshift(step.assign);
    planned.writes.push(...step.writes);
    planned.matchUpIds.push(...step.matchUpIds);
    if (index === 0 && step.onward) planned.onward = step.onward;
    if (index === 0 && step.advanced) planned.advanced = step.advanced;
    if (index === 0 && step.passed) planned.passed = step.passed;
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
    held,
    heldOnward,
    namesEvent,
    besideBye,
  }: {
    held?: number[];
    heldOnward?: { matchUpId: string; drawPositions: number[] };
    namesEvent: boolean;
    besideBye: boolean;
  },
) {
  const entry = indexed(view, seat.matchUpId);
  const opposite = (held ?? entry?.drawPositions ?? []).filter(
    (position): position is number => !!position && position !== seat.drawPosition,
  );
  if (!entry || opposite.length > 1) return undefined;
  const sends = !!opposite.length && !!entry.winnerMatchUpId && !besideBye;
  const direct = sends ? onwardFrom(view, entry, opposite[0], { heldNext: heldOnward }) : undefined;
  // a next matchUp a BYE already: the position goes into it and through it; no `onward` is named for it, so a later
  // chain touching either matchUp is refused as an overlap
  const passed = sends && !direct ? throughHeldBye(view, entry, opposite[0]) : undefined;
  const onward = direct;
  const quiet = namesEvent ? {} : { announcesEvent: false as const };
  const byeOnward = besideBye ? byeAdvanced(view, entry, seat.drawPosition, quiet, heldOnward) : undefined;
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
    advanced: byeOnward?.advanced,
    passed: passed?.[passed.length - 1],
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
  heldOnward?: { matchUpId: string; drawPositions: number[] },
): { ops: OutcomeOp[]; matchUpIds: string[]; advanced: NonNullable<ByeChain['advanced']> } | undefined {
  // a final: the BYE goes nowhere; v1 writes the matchUp, a BYE already, as a BYE again
  if (!entry.winnerMatchUpId)
    return {
      ops: [
        { op: 'setMatchUpBye', matchUpId: entry.matchUpId, ...quiet },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
      ],
      matchUpIds: [],
      advanced: { matchUpId: entry.matchUpId },
    };
  const onward = indexed(view, entry.winnerMatchUpId);
  // the next matchUp as an earlier write of this call leaves it (the other BYE's chain sent the position there)
  const positions = heldOnward?.matchUpId === onward?.matchUpId ? heldOnward?.drawPositions : onward?.drawPositions;
  const held = (positions ?? []).filter((position): position is number => !!position);
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
  const advanced = { matchUpId: onward.matchUpId };
  // nothing beside it, or the structure's last round: the position beside it goes nowhere (S6 tail, the BYE chain)
  if (!others.length || !onward.winnerMatchUpId) return { ops: bye, matchUpIds: [onward.matchUpId], advanced };
  const next = onwardFrom(view, onward, others[0]);
  if (!next) return undefined;
  return {
    ops: [...bye, ...throughByeOps(next)],
    matchUpIds: [onward.matchUpId, next.matchUpId],
    advanced: { ...advanced, next },
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
  /** C26: the BYE home holds a carried award whose carrier goes on. */
  carriedOwn?: CarriedByeSeat;
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
export function doubleExitSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const seats = chainedSeats(view, entry);
  if (seats || !view.draw.doubleExitPropagatesBye) return seats;
  // the chain's shapes refused: the seats as v1's `assignDrawPositionBye` recursion walks them (S6 tail, the BYE chain)
  return walkedSeats(view, entry);
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

/** the loser seat is a fed one (a feed round's): it takes a BYE whatever `doubleExitPropagateBye` says (S7) */
const fedSeat = (view: OutcomeView) => !!indexed(view, view.targets.loserMatchUpId)?.feedRound;

/** the seats as the chain's shapes plan them (S5, S6) */
function chainedSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const { targets } = view;
  const seats: DoubleExitSeats = {};
  // under `doubleExitPropagateBye: false` the loser matchUp takes a produced exit in place of the BYE
  if (!view.draw.doubleExitPropagatesBye && targets.loserTargetSeat?.opponentBye) {
    seats.heldLoser = heldLoser(view);
    if (!seats.heldLoser) return undefined;
  } else if (!view.draw.doubleExitPropagatesBye && (targets.loserLink || targets.loserMatchUpId) && !fedSeat(view)) {
    seats.producedLoser = producedLoser(view);
    if (!seats.producedLoser) return undefined;
  } else if (targets.loserLink || targets.loserMatchUpId) {
    seats.carriedOwn = carriedByeSeat(view);
    if (!seats.carriedOwn) seats.own = ownByeChain(view);
    if (!seats.own && !seats.carriedOwn) return undefined;
  }
  if (entry?.loserMatchUpId) {
    // the next matchUp as the own seat leaves it: its BYE's onward position, or the produced exit's advance (S7)
    const ownOnward = seats.own?.onward ?? seats.producedLoser?.onward;
    seats.unfillable = unfillableByeChain(view, entry, ownOnward, seats.own?.advanced, seats.own?.passed);
    if (!seats.unfillable) return undefined;
    if (!joinHeldLanding(view, seats)) return undefined;
  }
  // the matchUps both may touch: the unfillable seat's, which the own seat's BYE sent a position into first; or, the own
  // seat's double BYE having made it a BYE, it and the one its position went on into
  const ownSent = [
    seats.own?.onward?.matchUpId,
    seats.producedLoser?.onward?.matchUpId,
    seats.own?.advanced?.matchUpId,
    seats.own?.advanced?.next?.matchUpId,
    seats.own?.passed?.matchUpId,
  ];
  // ...or the matchUp the own chain passed a position into, which the unfillable seat's BYE sends its own position into,
  // read as the own chain leaves it (S6 tail, the BYE chain)
  const unfillableFirst = seats.unfillable?.matchUpIds[0];
  const joinedPassed = !!seats.own?.passed && seats.unfillable?.matchUpIds.includes(seats.own.passed.matchUpId);
  const shared = new Set(
    (unfillableFirst && ownSent.includes(unfillableFirst)) || joinedPassed
      ? (seats.unfillable?.matchUpIds ?? []).filter((matchUpId) => ownSent.includes(matchUpId))
      : [],
  );
  const joinedCarried = joinCarriedOnward(view, seats);
  if (joinedCarried === false) return undefined;
  const touched = [
    ...(seats.carriedOwn?.matchUpIds ?? []).filter((matchUpId) => matchUpId !== joinedCarried),
    ...(seats.own?.matchUpIds ?? []).filter((matchUpId) => !shared.has(matchUpId)),
    ...(seats.unfillable?.matchUpIds ?? []),
    ...producedLoserMatchUpIds(seats.producedLoser).filter((matchUpId) => !shared.has(matchUpId)),
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

/** C26: two clean arrivals share an onward matchUp. The awardee arrives after the other
 * BYE's advance, so its placement keeps that position. A shared result or BYE is not this program. */
function joinCarriedOnward(view: OutcomeView, seats: DoubleExitSeats): string | false | undefined {
  const landing = seats.carriedOwn?.landing;
  const earlier = seats.unfillable?.onward;
  if (!landing?.onward || !earlier || landing.onward.matchUpId !== earlier.matchUpId) return undefined;
  const writes = seats.unfillable?.writes.filter((op) => 'matchUpId' in op && op.matchUpId === earlier.matchUpId) ?? [];
  if (writes.length !== 1 || writes[0].op !== 'setMatchUpDrawPositions') return false;
  const awardee = landing.entry.sides?.find((side) => side.sideNumber === 3 - landing.side && side.participantId);
  const onward = awardee?.drawPosition
    ? onwardFrom(view, landing.entry, awardee.drawPosition, { heldNext: earlier })
    : undefined;
  if (!onward) return false;
  landing.onward = onward;
  return onward.matchUpId;
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
  ownOnward?: { matchUpId: string; drawPositions: number[] },
  ownAdvanced?: ByeChain['advanced'],
  ownPassed?: ByeChain['passed'],
  from: { seat?: WinnerLoserSeat; levels?: { levels: CarryLevel[]; bounded: boolean } } = {
    seat: view.targets.winnerLoserSeat,
    levels: view.targets.byeLevels?.unfillable,
  },
): ByeChain | undefined {
  const unfillable = from.seat;
  // v1 places this BYE behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition): nobody loses here
  const conditioned = unfillable?.linkCondition && unfillable.linkCondition !== FIRST_MATCHUP;
  if (!unfillable || conditioned || unfillable.matchUpId !== entry.loserMatchUpId) return undefined;
  // whoever stands opposite goes on through this BYE: a participant there, or a position the own seat's BYE sent into
  // this matchUp first (read as this call leaves it)
  const joined = ownOnward?.matchUpId === unfillable.matchUpId ? ownOnward.drawPositions : undefined;
  if (!unfillable.seat?.free) return undefined;
  // the own seat's double BYE made this matchUp a BYE, the position opposite gone on: a double BYE here too, the seat's
  // position (that one) standing where the own chain sent it (FIRST_MATCH_LOSER_CONSOLATION)
  const byOwn = ownAdvanced?.matchUpId === unfillable.matchUpId;
  // ...or a BYE already stands opposite the seat (another double exit's, a draw's BYE): a double BYE beside it, its
  // position gone on into the next matchUp as the own chain leaves it (S6 tail, the BYE chain)
  const standing = !byOwn && !!unfillable.seat.opponentBye && unfillable.matchUpStatus === BYE;
  if (unfillable.seat.opponentBye && !standing) return undefined;
  const doubled = byOwn || standing;
  if (unfillable.matchUpStatus !== (standing ? BYE : TO_BE_PLAYED) || unfillable.hasResult) return undefined;
  const record = indexed(view, unfillable.matchUpId);
  if (!record || record.matchUpStatusCodes?.length || Object.keys(record.sideExitProvenance ?? {}).length)
    return undefined;
  const { structureId, drawPosition, matchUpId } = unfillable;
  const first = { structureId, drawPosition, matchUpId };
  // the next matchUp as the own chain leaves it: the position it passed through a standing BYE arrived there first
  const heldOnward = byOwn ? ownAdvanced?.next : ownPassed;
  return byeChain(view, first, from.levels, false, doubled, joined, heldOnward);
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
function heldBeyondOps(request: OutcomeRequest, beyond: { matchUpId: string; arrivalSide: 1 | 2 }): OutcomeOp[] {
  const status = request.matchUpStatus as MatchUpStatusUnion;
  const provenance = buildCarriedExitProvenance({
    sourceMatchUpId: request.matchUpId,
    previousMatchUpStatus: status,
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
      score: { scoreStringSide1: '', scoreStringSide2: '' },
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
}

/** the exit recorded on the BYE matchUps and carried on, as v1 writes them, the loser matchUp first */
function heldLoserOps(request: OutcomeRequest, held: HeldLoser): OutcomeOp[] {
  const status = request.matchUpStatus as MatchUpStatusUnion;
  const entry = (exitingSideNumber: 1 | 2) =>
    buildCarriedExitProvenance({
      sourceMatchUpId: request.matchUpId,
      previousMatchUpStatus: status,
      matchUpStatus: status,
      exitingSideNumber,
    });
  const blank = { scoreStringSide1: '', scoreStringSide2: '' };
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

const producedLoserMatchUpIds = (produced?: ProducedLoser) =>
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
function producedLoser(view: OutcomeView): ProducedLoser | undefined {
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
function producedLoserOps(request: OutcomeRequest, produced: ProducedLoser): OutcomeOp[] {
  const matchUpStatus = request.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: request.matchUpStatus as MatchUpStatusUnion,
    sourceMatchUpId: request.matchUpId,
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
      ...(matchUpStatus === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
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
  drawDefinition: DrawDefinition,
  direction?: DirectionPlan,
): { ops: OutcomeOp[]; after: OutcomeOp[] } {
  const entry = direction?.produced ? indexed(view, direction.produced.matchUpId) : undefined;
  // a final produces nothing: its own seat's BYE alone (S6 tail, family 8)
  const final = !view.targets.winnerMatchUpId && !direction?.decider;
  const seats = entry || final ? doubleExitSeats(view, entry) : undefined;
  if (!seats) return { ops: [], after: [] };
  const { own, unfillable, producedLoser: produced, heldLoser: held } = seats;
  const carried = seats.carriedOwn ? carriedByeSeatOps(seats.carriedOwn, drawDefinition, view.isTeam) : undefined;
  return {
    ops: [
      ...(produced ? producedLoserOps(request, produced) : []),
      ...(held ? heldLoserOps(request, held) : []),
      ...(own ? [...own.assigns, ...own.writes] : []),
      ...(carried?.ops ?? []),
      ...(unfillable ? [...unfillable.assigns, ...unfillable.writes] : []),
    ],
    after: [
      ...(seats.heldBeyond ? [...seats.heldBeyond.advanceOps, ...heldBeyondOps(request, seats.heldBeyond)] : []),
      ...(carried?.after ?? []),
    ],
  };
}
