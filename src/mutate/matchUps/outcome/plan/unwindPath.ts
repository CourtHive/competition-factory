import { convergedChain, convergedRelayCopy, unwoundSeatOps } from './unwindSeats';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { standingReservationPrograms } from './standingReservation';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';
import { unwindWalk } from '../unwindWalk';
import {
  BLANK_SCORE,
  CLEAR_SCORE,
  indexed,
  pairedFeeder,
  positionsOf,
  scoreless,
  seatKey,
  sideOf,
  undecided,
  unwoundClean,
} from './planShared';

// constants and types
import type { DirectionPlan, OutcomeRequest, OutcomeView, RebuildView, Route, WinnerLoserSeat } from '../types';
import type { DrawDefinition, MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import { BYE, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP, LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { Rederived, UnwindRelay } from './unwindSeats';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ProducedTarget } from './producedTarget';
import type { Convergence } from './convergence';
import type { OutcomeOp } from '../ops';

/**
 * The path of a double exit's unwind (S6, S7): the produced exit taken back and the path to the final written back to
 * be played, level by level, the deeper seats first under `doubleExitPropagateBye: false`, the walk and the plain
 * readings of each seat, and the view with the unwind folded in.
 */

// This is the plan's one "unwind, then re-plan" composition (Mentat
// assessment/2026-11-07-outcome-refactor-debates.md, ruling 6): its arguments are the caller's facts (`args`,
// `releasedLandings`), and the plain-winner sites call it. The sites that call `rebuild` directly (the standalone and
// terminal programs, the geometry probes) fold a different ops set (`clearing`, `clearOnly`, extra ops) and must not
// be routed through here. It is deliberately not memoised: a per-call cache of the unwind and its rebuilt views would
// save walks and rebuilds that no gate measures (`pipelineCost` counts hydrations, and a rebuild hydrates nothing),
// at the cost of state in a module of pure functions. That saving is Phase 3 work, proven by a paired perf-compare
// run, never by a structural PR.
/** the view with a double exit's unwind folded in, and the direction planned on it (`rebuild`); undefined where none */
export function unwoundView(
  args: {
    drawDefinition?: DrawDefinition;
    request: OutcomeRequest;
    view: OutcomeView;
    route?: Route;
    rebuild?: RebuildView;
  },
  { releasedLandings = false }: { releasedLandings?: boolean } = {},
): ReturnType<RebuildView> {
  if (args.route !== 'winner' || !args.rebuild) return undefined;
  const { ops, reannounced } = unwoundOps(args.view, args.request, args.route, args.drawDefinition);
  // A convergence produces into a released landing: its emptied award is written back to be played before the
  // direction's ops (`planOps`). Other deferred writes, including standing-BYE advancements, stay out of this fold.
  const released = releasedLandings ? earlyReleasedLandings(reannounced) : [];
  return args.rebuild([...ops, ...released], args.route);
}

/** Only the released-landing writes belong before a fresh direction; other deferred writers remain late. */
export const earlyReleasedLandings = (ops: OutcomeOp[]) =>
  ops.filter((op) => op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes');

/** The ordinary award certified by the produced-exit reader, retained for a standalone clear. */
type ProducedAward = {
  target: ProducedTarget;
  paired: HydratedMatchUp;
  drawPosition: number;
  participantId: string;
};

/** a matchUp on a cleared double exit's path, with the writes v1's unwind makes at the seat its loser link feeds */
export type UnwoundLevel = {
  matchUpId: string;
  seatOps: OutcomeOp[];
  /** the drawPosition the level before sent on into this matchUp (an award, a fed seat's reservation), taken back out */
  released?: number;
  /** a convergence this unwind dissolves, re-derived to the kept origin's pending exit (S6 tail) */
  rederived?: Rederived;
  pendingRemoval?: PendingRemoval;
};

/** what a dissolved convergence is written back to: the kept origin's exit, pending, with that origin alone */
type PendingRemoval = { drawPosition: number; provenance: SideExitProvenance };

/**
 * S6: a double exit cleared (the `clear-score` route): v1's `removeDoubleExit`, then the clear's own write. Planned where
 * all the double exit sent on is its produced exit, still pending, in a structure whose only links out are loser links
 * with no condition: the next matchUp holds that exit alone (no winner, positions, score or codes, and this matchUp's
 * origin, on the side it fed, as its only provenance), and every matchUp beyond it on the winner's path to the final is
 * to be played with no positions, result, codes or provenance. v1 walks that path to the final
 * (`conditionallyRemoveDrawPosition` → `removeDoubleExit`, level by level) and writes each matchUp back to be played:
 * codes `[]`, its score blanked, the produced exit's origin withdrawn. At each level it also withdraws the BYE at the seat
 * the loser link feeds (`removeDirectedBye`, under `doubleExitPropagateBye`): the seats the double exit's BYEs took
 * (`unwoundSeatOps`). Returns the path, the call's matchUp first; undefined where anything else stands (a feed round, a
 * winner or conditioned link, an award, a convergence, anything played beyond, a BYE that went on further).
 */
/** A clear removes the previous awardee while the independent pending exit remains; not a dissolved convergence. */
function pendingAwardRemoval(
  view: OutcomeView,
  previous: HydratedMatchUp,
  at: HydratedMatchUp,
): PendingRemoval | undefined {
  if (view.draw.doubleExitPropagatesBye || previous.structureId !== at.structureId || !at.winningSide) return undefined;
  if (!scoreless(previous) || !scoreless(at) || previous.matchUpStatusCodes?.length || at.matchUpStatusCodes?.length)
    return undefined;
  const held = positionsOf(at);
  const winner = at.sides?.find((side) => side.sideNumber === at.winningSide);
  if (held.length !== 1 || !winner?.participantId || winner.drawPosition !== held[0]) return undefined;
  if (!positionsOf(previous).includes(held[0]) || previous.winnerMatchUpId !== at.matchUpId) return undefined;
  const entries = Object.entries(at.sideExitProvenance ?? {});
  const arrival = entries.find(([, entry]) => entry.sourceMatchUpId === previous.matchUpId);
  const kept = entries.find(([, entry]) => entry.sourceMatchUpId !== previous.matchUpId);
  if (entries.length !== 2 || !arrival || !kept || arrival[1].matchUpStatus) return undefined;
  if (arrival[1].previousMatchUpStatus !== previous.matchUpStatus || arrival[0] !== String(at.winningSide))
    return undefined;
  const foreign = indexed(view, kept[1].sourceMatchUpId);
  const status = carriedExitStatus(kept[1]);
  if (!foreign || !isDoubleExit(foreign.matchUpStatus) || foreign.winningSide || !status) return undefined;
  if (foreign.matchUpStatus !== kept[1].previousMatchUpStatus || foreign.winnerMatchUpId !== at.matchUpId)
    return undefined;
  if (!scoreless(foreign) || foreign.matchUpStatusCodes?.length || Object.keys(foreign.sideExitProvenance ?? {}).length)
    return undefined;
  if (at.matchUpStatus !== status || kept[0] !== String(3 - at.winningSide)) return undefined;
  if (foreign.structureId !== at.structureId || !pendingAwardSeatStands(view, at)) return undefined;
  return { drawPosition: held[0], provenance: { [Number(kept[0])]: kept[1] } };
}

/** The award becoming pending still sends nobody to its already unfillable loser seat. */
function pendingAwardSeatStands(view: OutcomeView, source: HydratedMatchUp): boolean {
  const seat = view.targets.unwindLoserSeats?.find((level) => level.matchUpId === source.matchUpId)?.loserSeat;
  if (!seat || seat.linkCondition || !seat.seat?.bye || !seat.seat.byeFromPropagation) return false;
  const target = indexed(view, seat.matchUpId);
  if (!target || target.matchUpId !== source.loserMatchUpId || target.structureId !== seat.structureId) return false;
  if (target.matchUpStatus !== BYE || target.winningSide || target.loserMatchUpId || !scoreless(target)) return false;
  if (target.matchUpStatusCodes?.length || Object.keys(target.sideExitProvenance ?? {}).length) return false;
  const positions = positionsOf(target);
  if (positions.length !== 1 || positions[0] !== seat.drawPosition) return false;
  if (target.sides?.some((side) => side.participantId || side.qualifier)) return false;
  const next = indexed(view, target.winnerMatchUpId);
  return (
    !!next &&
    next.structureId === target.structureId &&
    !next.winningSide &&
    !next.winnerMatchUpId &&
    !next.loserMatchUpId &&
    !positionsOf(next).length &&
    unwoundClean(next, new Set())
  );
}

type ProducedUnwind = {
  path: string[];
  rederived: Map<string, Rederived>;
  takenBack: Map<string, number>;
  pendingRemovals: Map<string, PendingRemoval>;
  award?: ProducedAward;
};

export function unwoundPath(
  view: OutcomeView,
  matchUpId?: string,
  drawDefinition?: DrawDefinition,
  clearing = false,
  clearOnly = false,
  seatPrograms?: Map<number, OutcomeOp[]>,
): UnwoundLevel[] | undefined {
  const source = indexed(view, matchUpId);
  const structureId = source?.structureId;
  if (!source || !structureId) return undefined;
  const linksOut = (drawDefinition?.links ?? []).filter((link) => link.source?.structureId === structureId);
  // the links out that the unwind reads: loser links, plain or FIRST_MATCHUP (the double exit placed its BYE behind one
  // regardless, `advanceByeToLoserMatchUp`); a WINNER link out (DOUBLE_ELIMINATION's Main to its Decider) matters only
  // once the final has sent across it, which the undecided path below excludes (S6 tail)
  const unread = (link: (typeof linksOut)[number]) =>
    link.linkType === LOSER ? !!link.linkCondition && link.linkCondition !== FIRST_MATCHUP : link.linkType !== WINNER;
  if (linksOut.some(unread)) return undefined;
  // under `doubleExitPropagateBye: false` the seats the loser links feed show no BYE: v1 visits them as matchUps and
  // walks on from them (`unwoundBranch`, S6 tail)
  const branched = linksOut.some((link) => link.linkType === LOSER) && !view.draw.doubleExitPropagatesBye;
  const seats = view.targets.unwindLoserSeats ?? [];
  // a structure's final (or the one matchUp of a one-round structure) produced nothing: the path is the call's matchUp
  // alone, its own seat visited as any first level's (S6 tail, family 6). A final whose winner link leads on
  // (DOUBLE_ELIMINATION's Decider) has a next matchUp, and is read as any path
  const produced: ProducedUnwind | undefined = source.winnerMatchUpId
    ? unwoundProducedPath(view, source, structureId, clearOnly)
    : {
        path: [source.matchUpId],
        rederived: new Map<string, Rederived>(),
        takenBack: new Map<string, number>(),
        pendingRemovals: new Map<string, PendingRemoval>(),
      };
  if (!produced) return undefined;
  const { path, rederived, takenBack, pendingRemovals, award } = produced;
  if (seatPrograms && (rederived.size || pendingRemovals.size)) return undefined;
  // the BYEs this unwind withdraws (its own seat's and its produced exit's), which a seat's onward matchUp is read without:
  // v1 withdraws the deeper one first, so the own seat's onward matchUp has lost the unfillable seat's BYE by the time it
  // is visited (FIRST_MATCH_LOSER_CONSOLATION: both BYEs meet in the consolation's second round). Past a convergence
  // re-derived the unfillable seat is a level further on, and no owned shape reads it there (FMLC's dissolved
  // convergence is v1's): the first two levels suffice
  const reset = 1 + rederived.size;
  const withdrawn = new Set(
    seats.slice(0, 2).flatMap(({ loserSeat }, index) => {
      const program = seatPrograms?.get(index);
      if (program) return program.flatMap((op) => (op.op === 'withdrawBye' ? [seatKey(op)] : []));
      return loserSeat?.seat?.byeFromPropagation ? [seatKey(loserSeat)] : [];
    }),
  );
  const context = {
    path,
    seats,
    rederived,
    takenBack,
    reset,
    withdrawn,
    branched,
    sourceId: source.matchUpId,
    clearing,
    clearOnly,
    pendingRemovals,
    award,
  };
  const plain = unwoundLevels(view, context, seatPrograms);
  if (plain) return plain;
  if (seatPrograms) return undefined;
  // where the plain reading of a placed seat refuses, v1's removal is walked for both placed seats together
  const walk = walkedSeatOps(view, path, seats, { reset, rederived, branched, drawDefinition });
  return walk ? unwoundLevels(view, context, walk) : undefined;
}

type UnwoundContext = {
  path: string[];
  seats: NonNullable<OutcomeView['targets']['unwindLoserSeats']>;
  rederived: Map<string, Rederived>;
  takenBack: Map<string, number>;
  reset: number;
  withdrawn: Set<string>;
  branched: boolean;
  /** the double exit's matchUpId: the source of the carry its own seat relays under `doubleExitPropagateBye: false` */
  sourceId: string;
  clearing: boolean;
  clearOnly: boolean;
  pendingRemovals: Map<string, PendingRemoval>;
  award?: ProducedAward;
};

/**
 * The levels of an unwind (`unwoundPath`): each matchUp on the path with the writes at the seat its loser link feeds, the
 * placed seats read plainly (`unwoundLevelSeatOps`) or, given a walk, as the walk removes them (`walkedSeatOps`). Under
 * `doubleExitPropagateBye: false` the deeper seats are read first, as v1 withdraws them first: the own seat's passage
 * then reads the matchUps those withdrawals wrote (`UnwindRelay`)
 */
function unwoundLevels(
  view: OutcomeView,
  context: UnwoundContext,
  walk?: Map<number, OutcomeOp[]>,
): UnwoundLevel[] | undefined {
  const {
    path,
    seats,
    rederived,
    takenBack,
    reset,
    withdrawn,
    branched,
    sourceId,
    clearing,
    clearOnly,
    pendingRemovals,
  } = context;
  // a position the own seat's withdrawal releases out of a matchUp a deeper seat's BYE also sends to (a double BYE's next
  // matchUp, a BYE until then, had sent it on): that matchUp is read without it, and written once, by the release
  const released = new Set<number>();
  const relay: UnwindRelay = { sourceId, cleared: new Set(), reset: new Set(), retained: new Map() };
  const indices = path.map((_, index) => index);
  const order = branched && indices.length > 1 ? [...indices.slice(1), 0] : indices;
  const seatOpsAt = new Map<number, OutcomeOp[]>();
  for (const index of order) {
    const level = seats[index];
    if (level?.matchUpId !== path[index]) return undefined;
    if (pendingRemovals.has(path[index])) {
      seatOpsAt.set(index, []);
      continue;
    }
    const kept = rederived.get(path[index]);
    // the double exit's own seat and its produced exit's took the BYEs it placed; a seat further on holds nothing yet
    const at = { first: index === 0, placed: index === 0 || index === reset, kept: !!kept };
    const plain = () =>
      level.loserSeat
        ? unwoundLevelSeatOps(view, level, at, withdrawn, branched, released, relay, clearing, clearOnly)
        : [];
    const seatOps = walk?.get(index) ?? plain();
    if (!seatOps) return undefined;
    collectUnwound(seatOps, released, relay);
    seatOpsAt.set(index, seatOps);
  }
  if (!unwoundProgramsStand(view, context, seatOpsAt)) return undefined;
  return path.map((id, index) => {
    const taken = takenBack.get(id);
    const kept = rederived.get(id);
    return {
      matchUpId: id,
      seatOps: seatOpsAt.get(index) ?? [],
      ...(taken ? { released: taken } : {}),
      ...(kept ? { rederived: kept } : {}),
      ...(pendingRemovals.has(id) ? { pendingRemoval: pendingRemovals.get(id) } : {}),
    };
  });
}

/** The pending foreign award remains coupled; an ordinary award needs its own complete certificate. */
function unwoundProgramsStand(view: OutcomeView, context: UnwoundContext, programs: Map<number, OutcomeOp[]>): boolean {
  const indirect = [...programs].filter(([, program]) =>
    program.some((op) => op.op === 'clearMatchUpBye' && indirectRelayReset(view, op, program)),
  );
  if (context.pendingRemovals.size) return !!indirect.length;
  if (!indirect.length) return true;
  const [own, ...other] = indirect;
  return !other.length && own[0] === 0 && standaloneIndirectClear(view, context, own[1]);
}

/** A plain produced award and its clean final, with exactly the source's certified indirect seat program. */
function standaloneIndirectClear(view: OutcomeView, context: UnwoundContext, program: OutcomeOp[]): boolean {
  const { path, sourceId, award, seats, takenBack } = context;
  // The sole two-position indirect program already requires a policy-off clear at its constructor.
  if (!award || award.target.feed || path.length !== 3) return false;
  const source = indexed(view, sourceId);
  const final = indexed(view, path[2]);
  if (!source || !final || final.structureId !== source.structureId || final.winnerMatchUpId || final.loserMatchUpId)
    return false;
  if (takenBack.get(final.matchUpId) !== award.drawPosition) return false;
  if (!ordinaryAwardStands(source, award)) return false;
  const seat = seats[0]?.loserSeat;
  const clear = program.find(
    (op): op is Extract<OutcomeOp, { op: 'clearMatchUpBye' }> =>
      op.op === 'clearMatchUpBye' && op.matchUpId === seat?.matchUpId && op.drawPosition === seat.drawPosition,
  );
  return !!clear && !!indirectRelayReset(view, clear, program);
}

/** Live source and paired result agree with the two literal origins retained by the ordinary award reader. */
function ordinaryAwardStands(source: HydratedMatchUp, award: ProducedAward): boolean {
  const { target, paired, drawPosition, participantId } = award;
  if (
    !isDoubleExit(source.matchUpStatus) ||
    source.winningSide ||
    !scoreless(source) ||
    source.matchUpStatusCodes?.length
  )
    return false;
  if (
    Object.keys(source.sideExitProvenance ?? {}).length ||
    source.sides?.filter((side) => side.participantId).length !== 2
  )
    return false;
  if (paired.winnerMatchUpId !== target.entry.matchUpId) return false;
  if (paired.matchUpStatus !== WALKOVER && paired.matchUpStatus !== DEFAULTED) return false;
  if (!scoreless(paired) || paired.matchUpStatusCodes?.length || Object.keys(paired.sideExitProvenance ?? {}).length)
    return false;
  const produced = target.entry.sideExitProvenance?.[target.fedSide];
  const arrival = target.entry.sideExitProvenance?.[target.awardedSide];
  const winner = paired.sides?.find((side) => side.sideNumber === paired.winningSide);
  return (
    produced?.matchUpStatus === target.matchUpStatus &&
    produced.previousMatchUpStatus === source.matchUpStatus &&
    arrival?.matchUpStatus === undefined &&
    arrival?.previousMatchUpStatus === paired.matchUpStatus &&
    winner?.drawPosition === drawPosition &&
    winner.participantId === participantId
  );
}

/** The same validated level owns both this two-position relay clear and its exact onward reset. */
export function indirectRelayReset(
  view: OutcomeView,
  clear: Extract<OutcomeOp, { op: 'clearMatchUpBye' }>,
  program: OutcomeOp[],
): Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> | undefined {
  if (!program.includes(clear)) return undefined;
  const home = indexed(view, clear.matchUpId);
  if (!home || positionsOf(home).length !== 2) return undefined;
  return program.find(
    (op): op is Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> =>
      op.op === 'setMatchUpDrawPositions' &&
      op.matchUpId === home.winnerMatchUpId &&
      !!op.withdrawsProducedExit &&
      op.withdrawnByePosition === clear.drawPosition,
  );
}

/** what a level's seat ops leave for the levels read after them: the positions released, the matchUps cleared or reset */
function collectUnwound(seatOps: OutcomeOp[], released: Set<number>, relay: UnwindRelay): void {
  for (const op of seatOps) {
    if (op.op === 'clearMatchUpBye') {
      relay.cleared.add(op.matchUpId);
      if (op.retainedOnwardMatchUpId) {
        relay.retained.set(op.matchUpId, op.retainedOnwardMatchUpId);
        relay.reset.add(op.retainedOnwardMatchUpId);
      }
    }
    if (op.op !== 'setMatchUpDrawPositions') continue;
    if (op.releasedDrawPosition) released.add(op.releasedDrawPosition);
    if (op.clearsPendingExit) relay.reset.add(op.matchUpId);
  }
}

/**
 * The placed seats of an unwind (the double exit's own loser seat, and the seat its produced exit left unfillable) as v1
 * removes their BYEs (`unwindWalk`): the deeper seat first, on the draw that removal leaves, then the own seat. Keyed by
 * the level each seat belongs to. Under `doubleExitPropagateBye: false` the own seat holds the carry, not a BYE, and is
 * read plainly (`unwoundBranch`, `unwoundPassage`): the walk takes the seats that do hold a propagated BYE (the
 * unfillable seat's, S7). Undefined where a seat the walk takes holds no propagated BYE, where no seat is walked, or where
 * the walk abstains.
 */
function walkedSeatOps(
  view: OutcomeView,
  path: string[],
  seats: NonNullable<OutcomeView['targets']['unwindLoserSeats']>,
  {
    reset,
    rederived,
    branched,
    drawDefinition,
  }: {
    reset: number;
    rederived: Map<string, Rederived>;
    branched: boolean;
    drawDefinition?: DrawDefinition;
  },
): Map<number, OutcomeOp[]> | undefined {
  if (!drawDefinition || !view.inContextDrawMatchUps) return undefined;
  const placed = [reset, 0].filter(
    (index, i, all) => all.indexOf(index) === i && index < path.length && !rederived.has(path[index]),
  );
  const walkedSeats: { index: number; structureId: string; drawPosition: number }[] = [];
  for (const index of placed) {
    const loserSeat = seats[index]?.loserSeat;
    if (!loserSeat || (branched && !loserSeat.seat?.bye)) continue;
    if (!loserSeat.seat?.bye || !loserSeat.seat.byeFromPropagation || !loserSeat.structureId) return undefined;
    walkedSeats.push({ index, structureId: loserSeat.structureId, drawPosition: loserSeat.drawPosition });
  }
  if (!walkedSeats.length) return undefined;
  const segments = unwindWalk({
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    propagatesBye: !!view.draw.doubleExitPropagatesBye,
    seats: walkedSeats,
    drawDefinition,
  });
  // the walk writes nothing the unwind's own path writes (`unwoundOps` writes those back to be played)
  const touched = segments?.flat().flatMap((op) => ('matchUpId' in op ? [op.matchUpId] : []));
  if (!segments || touched?.some((matchUpId) => path.includes(matchUpId))) return undefined;
  return new Map(walkedSeats.map(({ index }, i) => [index, segments[i]]));
}

/**
 * What a double exit's produced exit sent on, as the unwind takes it back (`unwoundPath`): the next matchUp holding the
 * produced exit (pending, or awarded to the paired matchUp's winner), or the convergences it made (`convergedChain`), then
 * the winner path beyond (`unwoundWinnerPath`). Undefined where anything else stands (a feed round, an award gone further).
 */
function unwoundProducedPath(
  view: OutcomeView,
  source: HydratedMatchUp,
  structureId: string,
  clearOnly = false,
): ProducedUnwind | undefined {
  const target = producedTarget(view, source, source.matchUpStatus as MatchUpStatusUnion);
  if (!target) return undefined;
  const { entry } = target;
  // the produced exit met its paired matchUp's there: a convergence this unwind dissolves (`convergedChain`, S6 tail)
  const converged = entry.matchUpStatus === target.matchUpStatus ? undefined : convergedChain(view, source, target);
  if (entry.matchUpStatus !== target.matchUpStatus && !converged) return undefined;
  const awardee = converged ? undefined : awardedReason(view, source, target);
  if (awardee === false) return undefined;
  // in a feed round the produced exit lands beside the fed seat (S6 tail, family 7): pending, it stands with that seat's
  // structural position, which went ahead as the reservation (awarded to the loser fed there, its arrival names no paired
  // matchUp and `awardedReason` refuses it; a feed matchUp has one feeder, so no convergence forms there)
  const start = [source.matchUpId, ...(converged?.map((level) => level.matchUpId) ?? [entry.matchUpId])];
  const pendingRemovals = new Map<string, PendingRemoval>();
  const walked = unwoundWinnerPath(view, structureId, start, clearOnly ? pendingRemovals : undefined);
  if (!walked) return undefined;
  const rederived = new Map(
    converged?.flatMap((level): [string, Rederived][] => (level.rederived ? [[level.matchUpId, level.rederived]] : [])),
  );
  return {
    path: walked.path,
    rederived,
    takenBack: walked.takenBack,
    pendingRemovals,
    ...(awardee ? { award: awardee } : {}),
  };
}

/**
 * The winner path a cleared double exit's unwind writes back, from the produced exit's matchUp to the structure's final
 * and one matchUp across the final's winner link (`unwoundPath`): each to be played with nothing decided or carried. The
 * position the level before sent ahead (the awardee's, a feed round's fed seat reserved on) comes back out of the matchUp
 * holding it (v1's `removeDirectedWinner`, `takenBack`); any other position there stands (a feed round's own fed seat, an
 * opponent arrived from the other half), as v1 leaves it. Undefined where anything else stands.
 */
function unwoundWinnerPath(
  view: OutcomeView,
  structureId: string,
  start: string[],
  pendingRemovals?: Map<string, PendingRemoval>,
): { path: string[]; takenBack: Map<string, number> } | undefined {
  const path = [...start];
  const takenBack = new Map<string, number>();
  let previous = indexed(view, path[path.length - 1]);
  let next = indexed(view, previous?.winnerMatchUpId);
  while (next && previous) {
    const before: HydratedMatchUp = previous;
    // the final's winner link leads into another structure (DOUBLE_ELIMINATION's Decider): v1's walk crosses it, takes
    // back a participant the final sent across (`removeLinkedWinner`: nobody, the final being undecided, which the
    // level before refused otherwise) and writes the matchUp back to be played as it writes the path; its structural
    // positions stand. The view holds one level past the final (`unwindLoserSeats`), so a walk going further abstains
    const crossed = next.structureId !== structureId;
    const pending =
      pendingRemovals && pendingRemovals.size === 0 && path.length === 2
        ? pendingAwardRemoval(view, before, next)
        : undefined;
    if (pending) {
      pendingRemovals?.set(next.matchUpId, pending);
      path.push(next.matchUpId);
      previous = next;
      next = indexed(view, next.winnerMatchUpId);
      continue;
    }
    if (next.matchUpStatus !== TO_BE_PLAYED || next.winningSide || !scoreless(next)) return undefined;
    if (Object.keys(next.sideExitProvenance ?? {}).length || path.includes(next.matchUpId)) return undefined;
    if (crossed && next.matchUpStatusCodes?.length) return undefined;
    if (!crossed) {
      if (next.matchUpStatusCodes?.length || next.sides?.some((side) => side.bye)) return undefined;
      // one position goes on from a matchUp; another standing here came from elsewhere and stays
      const sent = positionsOf(next).filter((position) => positionsOf(before).includes(position));
      if (sent.length) takenBack.set(next.matchUpId, sent[0]);
    }
    path.push(next.matchUpId);
    previous = next;
    next = indexed(view, next.winnerMatchUpId);
  }
  return { path, takenBack };
}

/**
 * The produced exit as it stands: pending (undefined), with this matchUp's origin, on the side it fed, its only
 * provenance and nothing placed; or awarded to the winner of the matchUp beside this one, who stands there alone with
 * their arrival recorded beside that origin (their drawPosition). False for anything else (a convergence, a score, codes).
 */
function awardedReason(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: ProducedTarget,
): ProducedAward | false | undefined {
  const { entry, fedSide, awardedSide } = target;
  const provenance = entry.sideExitProvenance ?? {};
  const origins = Object.keys(provenance);
  if (provenance[fedSide]?.sourceMatchUpId !== source.matchUpId) return false;
  if (!entry.winningSide) {
    if (origins.length !== 1) return false;
    if (!target.feed) return undecided(entry, true) ? undefined : false;
    // a feed round: the fed seat's structural position stands beside the pending exit (anyone on it would have won the
    // exit, the exit's own side holds no position, and a BYE there makes the matchUp a BYE, refused before this, S6 tail)
    return scoreless(entry) && !entry.matchUpStatusCodes?.length ? undefined : false;
  }
  const awarded = entry.sides?.find((side) => side.sideNumber === awardedSide);
  const arrival = provenance[awardedSide];
  const paired = pairedFeeder(view);
  const held = (entry.drawPositions ?? []).filter(Boolean);
  if (entry.winningSide !== awardedSide || !awarded?.participantId || !awarded.drawPosition) return false;
  // the awardee's arrival entry: none of a status where they won the paired matchUp, or the BYE-origin pair the produced
  // exit wrote opposite itself where they came through the paired matchUp's BYE (S6 tail, family 5: the one entry of
  // BYE status, naming the BYE matchUp, which the paired read below asks)
  const throughBye = arrival?.matchUpStatus === BYE;
  if (origins.length !== 2 || (arrival?.matchUpStatus && !throughBye) || !paired) return false;
  if (arrival?.sourceMatchUpId !== paired.matchUpId) return false;
  if (held.length !== 1 || !scoreless(entry) || entry.matchUpStatusCodes?.length) return false;
  if (entry.sides?.some((side) => side.bye)) return false;
  return { target, paired, drawPosition: awarded.drawPosition, participantId: awarded.participantId };
}

/**
 * The writes at a level's loser seat: the BYE the double exit placed there withdrawn (`unwoundSeatOps`), or under
 * `doubleExitPropagateBye: false` the matchUp holding the seat visited and walked on from (`unwoundBranch`), as v1's
 * `removeDoubleExit` takes one branch or the other by what the seat holds.
 */
function unwoundLevelSeatOps(
  view: OutcomeView,
  level: { loserSeat?: WinnerLoserSeat },
  at: { first: boolean; placed: boolean; kept: boolean },
  withdrawn: Set<string>,
  branched: boolean,
  released: Set<number> = new Set(),
  relay?: UnwindRelay,
  clearing = false,
  clearOnly = false,
): OutcomeOp[] | undefined {
  const { loserSeat } = level;
  if (!loserSeat) return [];
  const byeHeld = loserSeat.matchUpStatus === BYE;
  // a convergence re-derived still sends its seat nobody: the BYE it placed there stands (v1 withdraws the claim and
  // P39 claims it back, `settleRederivedDoubleExit`), nothing written. Under `doubleExitPropagateBye: false` the seat
  // holds the carries' own convergence, which the first level's branch refuses before this level is read
  if (at.kept) return [];
  if (branched && !byeHeld) return unwoundBranch(view, loserSeat, at.first, withdrawn, relay);
  if (branched && !loserSeat.seat?.bye) return unwoundPassage(view, loserSeat, relay);
  // the relay is read whatever the policy: only under `doubleExitPropagateBye: false` can a BYE matchUp hold this
  // double exit's own carry (its loser seats take BYEs otherwise), so it refuses nothing new under the default
  return unwoundSeatOps(view, loserSeat, at.placed, withdrawn, released, false, relay, clearing, clearOnly);
}

/**
 * Under `doubleExitPropagateBye: false`, the double exit's carried exit placed opposite a generated BYE: it passed the
 * BYE (RULE 1), recorded beside it and beside each BYE-held matchUp after, and stands pending where it landed. The unwind
 * takes it back as v1's `removeDoubleExit` visits the seat (S7): each BYE matchUp passed keeps its BYE, its provenance
 * withdrawn by a score write that names neither event nor tournament; then the landing is written back to be played,
 * quietly, the carrier's position standing in it (the BYE sent it there). Undefined where the walk meets anything else:
 * another origin beside the carry, an award at the landing (somebody stood opposite and went on), a result.
 */
function unwoundPassage(view: OutcomeView, loserSeat: WinnerLoserSeat, relay?: UnwindRelay): OutcomeOp[] | undefined {
  const { drawPosition } = loserSeat;
  const start = indexed(view, loserSeat.matchUpId);
  // the seat's matchUp is BYE-held, the seat itself not a BYE: the generated BYE stands opposite (`unwoundLevelSeatOps`)
  if (!start) return undefined;
  const passed: HydratedMatchUp[] = [];
  let at: HydratedMatchUp | undefined = start;
  let landing: HydratedMatchUp | undefined;
  // the landing a deeper seat's withdrawal already wrote back (`clearsPendingExit`): v1's chain finds nothing of this
  // unwind's there and stops (S7)
  while (at && !landing && !relay?.reset.has(at.matchUpId)) {
    const side = sideOf(at, drawPosition);
    const entry = side ? at.sideExitProvenance?.[side] : undefined;
    if (!carriedExitStatus(entry) || Object.keys(at.sideExitProvenance ?? {}).length !== 1) return undefined;
    if (at.matchUpStatus === BYE) passed.push(at);
    else if (at.matchUpStatus !== carriedExitStatus(entry) || at.winningSide || !scoreless(at)) return undefined;
    else landing = at;
    if (passed.length > 8) return undefined;
    at = landing ? undefined : indexed(view, at.winnerMatchUpId);
  }
  const landed: OutcomeOp[] = landing
    ? [
        {
          op: 'setMatchUpResult',
          matchUpId: landing.matchUpId,
          matchUpStatus: TO_BE_PLAYED,
          score: BLANK_SCORE,
          matchUpStatusCodes: [],
          stampsScoredTime: false,
          announcesContext: false,
        },
        { op: 'setSideExitProvenance', matchUpId: landing.matchUpId },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
      ]
    : [];
  // each BYE matchUp passed, its provenance withdrawn by v1's score write (the blank score, codes `[]`), which names
  // neither event nor tournament; one whose BYE a deeper seat's withdrawal took (the unfillable seat's, `cleared`) is to
  // be played by then, and v1 writes it so (S7)
  const relayed = passed.flatMap((matchUp): OutcomeOp[] => [
    {
      op: 'setMatchUpResult',
      matchUpId: matchUp.matchUpId,
      matchUpStatus: relay?.cleared.has(matchUp.matchUpId) ? TO_BE_PLAYED : BYE,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcesContext: false,
    },
    { op: 'setSideExitProvenance', matchUpId: matchUp.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
  ]);
  // v1's notice for each matchUp written stamps its structure (`modifyMatchUpNotice`; `structureStamps` reads no quiet seat)
  const stamped: OutcomeOp[] = [{ op: 'stampUpdatedAt', entity: 'structure', id: loserSeat.structureId }];
  return [...relayed, ...landed, ...stamped];
}

/**
 * The double exit's carried exit on the matchUp its loser link feeds, alone there (`doubleExitPropagateBye: false`): the
 * origin on the fed side (which only this double exit's loser link feeds) carries the matchUp's status; a winner opposite
 * or none yet; scoreless. Anything else there (a convergence, whose status is a double exit's; a BYE) is not this
 * unwind's.
 */
function carriesAlone(matchUp: HydratedMatchUp, drawPosition: number): boolean {
  const fedSide = matchUp.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (!fedSide) return false;
  const status = carriedExitStatus(matchUp.sideExitProvenance?.[fedSide]);
  if (!status || matchUp.matchUpStatus !== status) return false;
  if (matchUp.winningSide && matchUp.winningSide !== 3 - fedSide) return false;
  return scoreless(matchUp) && !matchUp.sides?.some((side) => side.bye);
}

/** The own carried convergence dissolves before its produced relay, whose foreign onward origin stands. */
function unwoundOwnConvergence(view: OutcomeView, seat: WinnerLoserSeat, relay?: UnwindRelay): OutcomeOp[] | undefined {
  const start = indexed(view, seat.matchUpId);
  const next = indexed(view, start?.winnerMatchUpId);
  const onwardId = next && relay?.retained.get(next.matchUpId);
  if (!start || !next || !onwardId || next.winnerMatchUpId !== onwardId) return undefined;
  // Numeric positions are forwarded only within this structure.
  if (next.structureId !== start.structureId) return undefined;
  if (!isDoubleExit(start.matchUpStatus) || start.winningSide || !scoreless(start)) return undefined;
  if (start.loserMatchUpId || start.matchUpStatusCodes?.length || start.sides?.some((side) => side.bye))
    return undefined;
  const fedSide = sideOf(start, seat.drawPosition);
  if (!fedSide) return undefined;
  const own = start.sideExitProvenance?.[fedSide];
  const keptSide = (3 - fedSide) as 1 | 2;
  const kept = start.sideExitProvenance?.[keptSide];
  const status = carriedExitStatus(kept);
  const source = indexed(view, kept?.sourceMatchUpId);
  if (Object.keys(start.sideExitProvenance ?? {}).length !== 2 || own?.sourceMatchUpId !== relay?.sourceId)
    return undefined;
  if (!carriedExitStatus(own) || !kept || !status || kept.previousMatchUpStatus !== status) return undefined;
  if (source?.loserMatchUpId !== start.matchUpId || source.matchUpStatus !== status) return undefined;
  const copy = Object.values(next.sideExitProvenance ?? {});
  if (next.matchUpStatus !== BYE || copy.length !== 1 || copy[0].sourceMatchUpId !== start.matchUpId) return undefined;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcesContext: false,
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: start.matchUpId,
      matchUpStatus: status,
      winningSide: fedSide,
      retainedExitPlanned: true,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
    },
    { op: 'setSideExitProvenance', matchUpId: start.matchUpId, provenance: { [keptSide]: kept } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: start.matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: seat.structureId },
  ];
}

/**
 * Under `doubleExitPropagateBye: false` the seat a level's loser link feeds shows no BYE: the double exit carries its exit
 * there, awarded to whoever stands or arrives opposite, and a further level's seat holds nothing of this unwind's. v1
 * visits the matchUp all the same (`conditionallyRemoveDrawPosition`, the loser branch of `removeDoubleExit`) and walks on
 * from it as it walks the main path, over winner and loser links alike: the position its result sent on taken back out
 * of the next matchUp (`removeDirectedWinner`), its winner path to its final and across the final's winner link, the
 * matchUp its own loser link feeds (DOUBLE_ELIMINATION's Main final into the Decider), each matchUp written back to be
 * played, deepest first, the visited matchUp last; the first level's with the call's context, the rest without. Planned
 * where the first level's matchUp holds the carried exit alone (`carriesAlone`) and every other matchUp reached holds
 * nothing (`unwoundClean`). Undefined for anything else: a BYE's or a convergence's seat; a BYE standing where the walk
 * leads (the carry's award, with nobody for a loser, sent one on through the chain beyond: COMPASS, OLYMPIC; another
 * double exit's).
 */
function unwoundBranch(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  first: boolean,
  withdrawn: Set<string>,
  relay?: UnwindRelay,
): OutcomeOp[] | undefined {
  const start = indexed(view, loserSeat.matchUpId);
  if (!start) return undefined;
  if (first && !carriesAlone(start, loserSeat.drawPosition)) return unwoundOwnConvergence(view, loserSeat, relay);
  const all = view.inContextDrawMatchUps ?? [];
  const taken = new Set<number>();
  const written = new Set<string>();
  const write = (matchUp: HydratedMatchUp, context: boolean): OutcomeOp[] => {
    written.add(matchUp.matchUpId);
    return [
      {
        op: 'setMatchUpResult',
        matchUpId: matchUp.matchUpId,
        matchUpStatus: TO_BE_PLAYED,
        score: BLANK_SCORE,
        matchUpStatusCodes: [],
        stampsScoredTime: false,
        ...(context ? {} : { announcesContext: false as const }),
      },
      ...(context ? [{ op: 'setSideExitProvenance' as const, matchUpId: matchUp.matchUpId }] : []),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
    ];
  };
  // v1's `removeSubsequentRoundsParticipant`: the position out of every later round of the structure holding it
  // v1's `removeSubsequentRoundsParticipant`: the position out of every later round holding it. The next matchUp is
  // the only one that can: a further advance is a result standing (the call refused) or a BYE this unwind withdraws
  // (`unwoundSeatOps` takes the position back there)
  const takeBack = (next: HydratedMatchUp, position: number): OutcomeOp => {
    taken.add(position);
    return {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: positionsOf(next).filter((held) => held !== position),
      removedDrawPosition: position,
    };
  };
  const walk = (matchUp: HydratedMatchUp, context: boolean, depth: number): OutcomeOp[] | undefined => {
    if (depth > all.length) return undefined;
    // every matchUp written back holds nothing of a result; the first level's holds the carry alone (`carriesAlone`)
    if (!context && !unwoundClean(matchUp, withdrawn)) return undefined;
    const ops: OutcomeOp[] = [];
    const next = indexed(view, matchUp.winnerMatchUpId);
    if (next) {
      // across a winner link positions are another structure's (v1 follows the participant, `removeLinkedWinner`: a clean
      // final sent nobody)
      const crossed = next.structureId !== matchUp.structureId;
      const sent = crossed
        ? []
        : positionsOf(matchUp).filter((held) => positionsOf(next).includes(held) && !taken.has(held));
      // only the carry's award sent anyone on; v1 takes back the first position it finds
      if (sent.length && (!matchUp.winningSide || sent.length > 1)) return undefined;
      if (sent.length) ops.push(takeBack(next, sent[0]));
      const deeper = walk(next, false, depth + 1);
      if (!deeper) return undefined;
      ops.push(...deeper);
    }
    // v1 walks on over the matchUp's own loser link too, the matchUp there visited as any (OLYMPIC's West into its
    // South; DOUBLE_ELIMINATION's Main final into the Decider); where the carry's award, with nobody for a loser, has
    // sent a BYE on through the chain beyond (COMPASS), the walk stops: v1's
    const target = indexed(view, matchUp.loserMatchUpId);
    if (matchUp.loserMatchUpId && !target) return undefined;
    if (target) {
      const side = walk(target, false, depth + 1);
      if (!side) return undefined;
      ops.push(...side);
    }
    ops.push(...write(matchUp, context));
    return ops;
  };
  const ops = walk(start, first, 0);
  if (!ops) return undefined;
  // v1's notice for each matchUp written stamps its structure (`modifyMatchUpNotice`); the call's own is stamped once
  // by the plan, the others here (no seat op names them, as `structureStamps` reads)
  const source = view.targets.source.structureId;
  const structures = new Set(
    [...written].flatMap((id) => {
      const structureId = indexed(view, id)?.structureId;
      return structureId && structureId !== source ? [structureId] : [];
    }),
  );
  return [
    ...ops,
    ...[...structures].map((id) => ({ op: 'stampUpdatedAt' as const, entity: 'structure' as const, id })),
  ];
}

/**
 * The cleared double exit's unwind, as v1 writes it, deepest first: at each level the seat its loser link feeds, then
 * the matchUp written back to be played through `modifyMatchUpScore` (no `scoredTime` rule), its codes `[]` and its
 * score blanked, the produced exit's origin withdrawn; the call's own seat last, before the clear's own write. v1's walk
 * past the produced exit's matchUp passes on neither the tournament nor the event, so those writes are announced without
 * them (`announcesContext: false`).
 */
export function unwoundOps(
  view: OutcomeView,
  request: OutcomeRequest,
  route: Route | undefined,
  drawDefinition?: DrawDefinition,
  retainOccupiedAward = route === CLEAR_SCORE,
): { ops: OutcomeOp[]; reannounced: OutcomeOp[]; seatPrograms: OutcomeOp[][] } {
  if ((route !== CLEAR_SCORE && route !== 'winner') || !isDoubleExit(view.existing.matchUpStatus))
    return { ops: [], reannounced: [], seatPrograms: [] };
  const ownPrograms = standingReservationPrograms({ view, request, route });
  const levels =
    unwoundPath(view, request.matchUpId, drawDefinition, retainOccupiedAward, route === CLEAR_SCORE, ownPrograms) ?? [];
  const retainedAward =
    retainOccupiedAward &&
    levels.some(({ seatOps }) => seatOps.some((op) => op.op === 'clearMatchUpBye' && !!op.retainedCarriedAward));
  // a seat's advance through a standing BYE is v1's `reconcileByeAdvancements`, after the call's own write; so is a
  // released landing's write back to be played (`carrierHomeOps`), announced by `reconcileScoredTimes` after everything
  const deferred = (op: OutcomeOp) =>
    (op.op === 'setMatchUpDrawPositions' && !!op.advancesThroughBye) ||
    (op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes');
  const pendingOps: OutcomeOp[] = levels.flatMap(({ matchUpId, pendingRemoval }) =>
    pendingRemoval
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId,
            drawPositions: [],
            removedDrawPosition: pendingRemoval.drawPosition,
            withdrawsPendingAward: true,
            announcesContext: false,
          },
          { op: 'setSideExitProvenance', matchUpId, provenance: pendingRemoval.provenance },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
        ]
      : [],
  );
  const ops = [
    ...pendingOps,
    ...[...levels]
      .reverse()
      .flatMap(({ matchUpId, seatOps: all, released, rederived, pendingRemoval }, depth): OutcomeOp[] => {
        if (pendingRemoval) return [];
        const seatOps = all.filter((op) => !deferred(op));
        if (matchUpId === request.matchUpId) return seatOps;
        const produced = depth === levels.length - 2;
        const stored = indexed(view, matchUpId);
        const drawPositions = positionsOf(stored).filter((position) => position !== released);
        // a convergence dissolved: the kept origin's exit, pending, its score the blank one v1's write leaves (a double
        // default stored none) and its codes re-derived (none to keep). Its `modifyMatchUp` is the settle pass's (`reannounced`
        // below), with the event and tournament at every depth; only the in-context notice is this write's
        if (rederived) {
          return [
            ...seatOps,
            {
              op: 'setMatchUpResult',
              matchUpId,
              matchUpStatus: rederived.matchUpStatus,
              score: BLANK_SCORE,
              matchUpStatusCodes: [],
              stampsScoredTime: false,
              ...(retainedAward && !stored?.winnerMatchUpId && !stored?.loserMatchUpId
                ? { retainedExitPlanned: true as const }
                : {}),
              ...(produced ? {} : { announcesContext: false as const }),
            },
            { op: 'setSideExitProvenance', matchUpId, provenance: rederived.provenance },
            { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
          ];
        }
        // the origin withdrawn off the matchUp that held it: the produced exit's, or a dissolved convergence's beyond
        const carried = Object.keys(stored?.sideExitProvenance ?? {}).length > 0;
        return [
          ...seatOps,
          ...(released ? [{ op: 'setMatchUpDrawPositions' as const, matchUpId, drawPositions }] : []),
          {
            op: 'setMatchUpResult',
            matchUpId,
            matchUpStatus: TO_BE_PLAYED,
            score: BLANK_SCORE,
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            ...(produced ? {} : { announcesContext: false as const }),
          },
          ...(carried ? [{ op: 'setSideExitProvenance' as const, matchUpId }] : []),
          { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
        ];
      }),
  ];
  // v1's `settleRederivedDoubleExits` writes each dissolved convergence again as it stands, after the call's own write:
  // its `modifyMatchUp` is announced there, under the pass's name (the in-context notice stays at the unwind's write)
  const reannounced: OutcomeOp[] = levels.flatMap(({ matchUpId, rederived }): OutcomeOp[] =>
    rederived
      ? [
          {
            op: 'setMatchUpResult',
            matchUpId,
            matchUpStatus: rederived.matchUpStatus,
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            announcedAs: 'settleRederivedDoubleExit',
          },
        ]
      : [],
  );
  reannounced.push(...levels.flatMap(({ seatOps }) => seatOps.filter(deferred)));
  return { ops, reannounced, seatPrograms: levels.map(({ seatOps }) => seatOps) };
}

/**
 * The produced exit rests where its BYE went (S7). A pending copy is withdrawn after the arrival; an awarded copy was
 * already reset on the unwind, so the arrival joins its legitimate occupant without repeating that withdrawal.
 */
export function producedRelayAfterOps(
  view: OutcomeView,
  unwound: OutcomeOp[],
  loser: DirectionPlan['loser'] | undefined,
  seatPrograms: OutcomeOp[][],
  superseded?: Convergence,
): OutcomeOp[] {
  return unwound.flatMap((op): OutcomeOp[] => {
    if (op.op !== 'clearMatchUpBye' || !op.rederived || op.rederived.winningSide) return [];
    // The relay reader certified its retained producer and any onward copy before emitting this pending exit.
    const home = indexed(view, op.matchUpId) as HydratedMatchUp;
    const next = indexed(view, home.winnerMatchUpId) as HydratedMatchUp;
    // This same own program now produces a fresh exit on its old relay side; its obsolete copy cannot be replayed.
    if (
      seatPrograms[0]?.includes(op) &&
      superseded?.matchUpId === home.matchUpId &&
      superseded.target?.entry.matchUpId === next?.matchUpId
    )
      return [];
    if (op.retainedCarriedAward) return [];
    // Reuse the complete-level proof; an unrelated level's reset cannot suppress this relay's late write.
    if (seatPrograms.some((program) => indirectRelayReset(view, op, program))) return [];
    if (op.retainedOnwardMatchUpId) {
      const copy = convergedRelayCopy(view, home, op.drawPosition) as NonNullable<
        ReturnType<typeof convergedRelayCopy>
      >;
      return [
        ...unwound.filter((write) => write.op === 'setMatchUpResult' && write.retainedExitPlanned && !loser?.converged),
        ...unwound.filter(
          (write) =>
            write.op === 'setMatchUpResult' &&
            (write.matchUpId === copy.next.matchUpId || write.matchUpId === copy.successor.matchUpId),
        ),
      ];
    }
    const arrived = loser?.arrives && !loser.exit && !loser.converged && view.targets.loserMatchUpId === home.matchUpId;
    const award: OutcomeOp[] = arrived
      ? [
          {
            op: 'setMatchUpResult',
            matchUpId: home.matchUpId,
            matchUpStatus: op.rederived.matchUpStatus,
            winningSide: sideOf(home, op.drawPosition),
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            announcedAs: 'assignMatchUpDrawPosition',
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: home.matchUpId },
        ]
      : [];
    // This direct terminal certificate has no onward copy; named assignment preserves its absent score and callback.
    if (!home.winnerMatchUpId) return award;
    const beyond = indexed(view, next.winnerMatchUpId);
    const drawPositions = [...positionsOf(next), op.drawPosition];
    const arrival: OutcomeOp[] = arrived
      ? [
          ...award,
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: next.matchUpId,
            drawPositions,
            placedDrawPosition: op.drawPosition,
          },
          ...(beyond && !next.winningSide
            ? [
                {
                  op: 'setMatchUpDrawPositions' as const,
                  matchUpId: beyond.matchUpId,
                  drawPositions: positionsOf(beyond),
                  releasedDrawPosition: op.drawPosition,
                },
                { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: beyond.matchUpId },
              ]
            : []),
        ]
      : [];
    const reset: OutcomeOp[] = next.winningSide
      ? []
      : [
          {
            op: 'setMatchUpResult',
            matchUpId: next.matchUpId,
            matchUpStatus: TO_BE_PLAYED,
            matchUpStatusCodes: [],
            announcedAs: 'withdrawProducedExits',
          },
          { op: 'setSideExitProvenance', matchUpId: next.matchUpId },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
        ];
    return [
      ...arrival,
      ...reset,
      ...(!arrived
        ? [
            {
              op: 'setMatchUpDrawPositions' as const,
              matchUpId: next.matchUpId,
              drawPositions,
              advancesThroughBye: true as const,
              announcesEvent: true as const,
            },
          ]
        : []),
    ];
  });
}
