import { scoredTimeAction } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { applyOutcomeOps, splitScoredTimeCleanup } from './ops';
import { findStructure } from '@Acquire/findStructure';
import { getTopics } from '@Global/state/globalState';
import {
  liveNoticeEffects,
  type NoticeEffects,
  deferInContextMatchUp,
  deferredQuery,
  modifyMatchUpNotice,
  modifyDrawNotice,
  modifyPositionAssignmentsNotice,
} from '@Mutate/notifications/drawNotifications';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import type { BuildViewArgs, OutcomeView, PlanShape, Route } from './types';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type { OutcomeOp } from './ops';

type ResultOp = Extract<OutcomeOp, { op: 'setMatchUpResult' }>;
type ArrivalOp = Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }>;
export type TemporalPhases = {
  result: ResultOp;
  arrival?: ArrivalOp;
  sourceStructureId: string;
  /** Every input op is consumed, including the batch stamp obligations replaced by actual notices. */
  consumed: number;
};

/** Certify ordinary result/arrival occurrences before any live write; unsupported programs remain owed. */
export function compileTemporalPhases({
  args,
  view,
  route,
  ops,
}: {
  args: BuildViewArgs;
  view: OutcomeView;
  route?: Route;
  ops: OutcomeOp[];
}): TemporalPhases | undefined {
  const sourceStructureId = view.targets.source.structureId;
  if (route !== 'winner' || !sourceStructureId || !args.drawDefinition || !args.request.matchUpId) return undefined;
  if (view.isTeam || view.line || view.group || view.existing.winningSide || view.existing.hasSideExitProvenance)
    return undefined;
  if (view.existing.matchUpStatus !== TO_BE_PLAYED || args.request.carries?.schedule) return undefined;
  const result = ops[0];
  if (result?.op !== 'setMatchUpResult' || result.matchUpId !== args.request.matchUpId) return undefined;
  if (result.matchUpStatus !== COMPLETED || result.score !== args.request.score) return undefined;
  if (
    Object.keys(result).some(
      (key) =>
        ![
          'op',
          'matchUpId',
          'matchUpStatus',
          'winningSide',
          'score',
          'matchUpFormat',
          'matchUpStatusCodes',
          'notes',
        ].includes(key),
    )
  )
    return undefined;
  const writes = ops.filter((op) => op.op !== 'stampUpdatedAt');
  const arrival = writes[1];
  if (writes.length > 2 || (arrival && arrival.op !== 'setMatchUpDrawPositions')) return undefined;
  if (arrival) {
    const target = view.targets.winner;
    if (!target || arrival.matchUpId !== view.targets.winnerMatchUpId || arrival.matchUpId === result.matchUpId)
      return undefined;
    if (target.matchUpStatus !== TO_BE_PLAYED || target.hasBye || target.holdsResult || target.carriesExit)
      return undefined;
    if (Object.keys(arrival).some((key) => !['op', 'matchUpId', 'drawPositions'].includes(key))) return undefined;
  }
  // The phase compiler replaces these exact stamp obligations; an extra or missing effect must not disappear.
  const expected: OutcomeOp[] = [
    result,
    { op: 'stampUpdatedAt', entity: 'matchUp', id: result.matchUpId },
    ...(arrival ? [arrival, { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: arrival.matchUpId }] : []),
    { op: 'stampUpdatedAt', entity: 'structure', id: sourceStructureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: args.drawDefinition.drawId },
  ];
  if (ops.length !== expected.length) return undefined;
  if (
    ops.some((op, index) => {
      const wanted = expected[index];
      return op.op === 'stampUpdatedAt'
        ? wanted.op !== 'stampUpdatedAt' || op.entity !== wanted.entity || op.id !== wanted.id
        : op !== wanted;
    })
  )
    return undefined;
  return { result, arrival: arrival as ArrivalOp | undefined, sourceStructureId, consumed: ops.length };
}

/** Execute only a previously certified complete program, preserving each writer's clock and notice boundary. */
export function applyTemporalPhases(
  args: BuildViewArgs,
  phases: TemporalPhases,
  shape: PlanShape,
  effects: { notices: NoticeEffects; topics: string[] } = { notices: liveNoticeEffects, topics: getTopics().topics },
): ResultType {
  const { drawDefinition, tournamentRecord, event } = args;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const stored = new Map(args.matchUpsMap?.drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const source = stored.get(phases.result.matchUpId);
  const destination = phases.arrival && stored.get(phases.arrival.matchUpId);
  if (!source || (phases.arrival && !destination)) return { error: INVALID_VALUES };
  const tournamentId = tournamentRecord?.tournamentId;
  const result = applyOutcomeOps(drawDefinition, [{ ...phases.result, stampsScoredTime: false }], undefined, {
    phase: 'ordinary-result',
  });
  if (result.error) return { error: INVALID_VALUES, info: result.error };
  if (effects.topics.includes(UPDATE_INCONTEXT_MATCHUP)) {
    const matchUpId = source.matchUpId;
    deferInContextMatchUp(
      {
        inContextMatchUp: deferredQuery(getInContextMatchUp, { tournamentRecord, drawDefinition, matchUpId }),
        tournamentId,
        matchUpId,
      },
      effects.notices,
    );
  }
  const announce = (matchUp: MatchUp, context: string) =>
    modifyMatchUpNotice(
      { drawDefinition, tournamentId, eventId: event?.eventId, event, matchUp, context },
      effects.notices,
    );
  announce(source, 'modifyMatchUpScore');
  if (phases.arrival && destination) {
    const placed = applyOutcomeOps(drawDefinition, [phases.arrival], undefined, { phase: 'ordinary-arrival' });
    if (placed.error) return { error: INVALID_VALUES, info: placed.error };
    announce(destination, 'assignMatchUpDrawPosition');
  }
  const action = scoredTimeAction(source);
  if (action === 'initialize') {
    source.schedule ??= {};
    source.schedule.scoredTime = new Date(
      effects.notices.readClock({ kind: 'scoredTime', target: source }),
    ).toISOString();
  } else if (action === 'clear' && source.schedule) delete source.schedule.scoredTime;
  return planResult(shape, [phases.result]);
}

/**
 * The outcome pipeline, v2: APPLY (executor plan § 3.1 step 4, § 3.4; S2). A call v2 owns is written here and v1 is
 * not asked: the plan's ops are folded into the STORED draw by `applyOutcomeOps`, the one reducer the working view and
 * the `differential` shadow apply use, so what lands is what the plan said and what the shadow comparison has held equal
 * to v1's write (F3). Stamps are ops, and the reducer records each in the call's ledger, so the notices below, written
 * by v1's own notice functions, stamp nothing twice (F2 (i)).
 *
 * Nothing is refused here. Every refusal was decided before the first op (§ 2), and the same ops were folded into the
 * working view's copies before this ran, so an id they name is in the draw.
 *
 * THE NOTICES are v1's for the same write: a `modifyMatchUp` for each matchUp written (with the draw and the matchUp's
 * own top-level structure stamped, `modifyMatchUpNotice`), a `modifyPositionAssignments` for each structure a loser is
 * placed in (S3: the direction shape), and for each matchUp given a result (the call's, and a carried exit's landing,
 * S5) the `updateInContextMatchUp` a subscriber receives, built when the notices are read, after the call has succeeded, and only for a subscriber
 * (CA, 2026-10-24: projection bounded to the changed node, never on an error).
 */
export function applyOwnedPlan({
  shape,
  args,
  ops: completedOps,
  route,
}: {
  args: BuildViewArgs;
  ops: OutcomeOp[];
  shape: PlanShape;
  route?: Route;
}): ResultType {
  const { drawDefinition, tournamentRecord, event } = args;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const { prefix: ops, cleanup } = splitScoredTimeCleanup(completedOps);
  const stored = new Map(args.matchUpsMap?.drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const cleanupTargets = cleanup.flatMap(({ matchUpId }) => {
    const matchUp = stored.get(matchUpId);
    return matchUp ? [matchUp] : [];
  });
  if (cleanupTargets.length !== cleanup.length) return { error: INVALID_VALUES };
  const applied = applyOutcomeOps(drawDefinition, completedOps, undefined, { bindResultInputs: true });
  if (applied.error) return { error: INVALID_VALUES, info: applied.error };

  const tournamentId = tournamentRecord?.tournamentId;
  // a matchUp given its result and then a position (that next matchUp): its last notice is the placement's
  const lastWrites = new Map(ops.flatMap((op) => ('matchUpId' in op && op.matchUpId ? [[op.matchUpId, op]] : [])));
  const placedLast = new Set(
    [...lastWrites].flatMap(([matchUpId, op]) => (op.op === 'setMatchUpDrawPositions' ? [matchUpId] : [])),
  );
  // ...or a BYE's withdrawal visiting it after a quiet result write (an unwind's branch writes DOUBLE_ELIMINATION's
  // Backdraw final back to be played, then the walk from the unfillable seat visits it, S7): v1's buffer keeps the
  // withdrawal's name, `removeDrawPosition-<n>`, with neither event nor tournament
  const unbyedLast = new Set(
    [...lastWrites].flatMap(([matchUpId, op]) =>
      op.op === 'setMatchUpDrawPositions' && op.withdrawnByePosition ? [matchUpId] : [],
    ),
  );
  // ...or a BYE written after its result and origin (a held exit's landing the unfillable seat's BYE takes, S7): the BYE's
  const byedLast = new Set(
    [...lastWrites].flatMap(([matchUpId, op]) => (op.op === 'setMatchUpBye' ? [matchUpId] : [])),
  );
  // a line given a finishing number by another line's write is announced as v1's `modifyMatchUpScore` announces it
  const resulted = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpResult' || op.op === 'setOrderOfFinish' ? [op.matchUpId] : [])),
  );
  const byes = new Set(ops.flatMap((op) => (op.op === 'setMatchUpBye' ? [op.matchUpId] : [])));
  // a loser taken back out: their matchUp's codes re-derived, announced as v1's `removeDirectedLoser` announces it
  const recoded = new Set(ops.flatMap((op) => (op.op === 'setMatchUpStatusCodes' && !op.quiet ? [op.matchUpId] : [])));
  // a swap's relabel in a later round: v1's `exchangePathPositions` announces each matchUp as `swapWinnerLoser`
  const exchanged = new Set(ops.flatMap((op) => (op.op === 'exchangeDrawPositions' ? [op.matchUpId] : [])));
  // a carry recorded beside a BYE it passed: the BYE matchUp's state is not rewritten, so v1's `progressExitStatus`
  // announces the entry itself (`recordCarryBesideBye`)
  const relayed = new Set(ops.flatMap((op) => (op.op === 'mergeSideExitProvenance' ? [op.matchUpId] : [])));
  const { removed, unevented, untournamented, unbyed, namedResults, arrived, byeNamed, carriedNotices } =
    noticeRules(ops);
  // a position advanced through a BYE a double exit placed: v1's `doubleExitAdvancement` announces it as `advanceWinner`
  const advanced = advanceNotices(ops);
  // an awardee's position released when the carry they were awarded is withdrawn: v1's `releaseAdvancedDrawPosition`,
  // with the event (S6 tail)
  const released = releasedNotices(ops);
  const { advancedLast } = byeAndAdvance(ops);
  const subscribed = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
  // every score write announces its matchUp in context to a subscriber, as v1's `modifyMatchUpScore` does: the call's
  // own, and a carried exit's on the matchUp it lands in (S5)
  const deferScore = (score: ResultOp) => {
    const { matchUpId } = score;
    if (!subscribed || !stored.has(matchUpId)) return;
    const contextless = score?.announcesContext === false || score?.inContextBare;
    const record = contextless ? undefined : tournamentRecord;
    deferInContextMatchUp({
      inContextMatchUp: deferredQuery(getInContextMatchUp, { tournamentRecord: record, drawDefinition, matchUpId }),
      tournamentId: contextless ? undefined : tournamentId,
      matchUpId,
    });
  };
  const tallyMatchUpId = tallyNoticeTarget(ops, args);
  const { settled } = namedWriters(ops);
  const eventless = eventlessNotices(ops).matchUps;
  for (const step of nativeNoticeSteps(ops, args.request?.matchUpId, stored)) {
    if (step.kind === 'assignments') {
      announceAssignmentBoundary(step, args);
      continue;
    }
    const matchUpId = step.matchUpId;
    const matchUp = stored.get(matchUpId);
    if (!matchUp) continue;
    if (step.kind !== 'modify') {
      announceWriteBoundary(
        step,
        matchUp,
        { ...args, event: step.kind === 'score' && eventless.has(matchUpId) ? undefined : event },
        tallyMatchUpId,
        deferScore,
      );
      continue;
    }
    // a removal's notice is built as v1's `removeSubsequentRoundsParticipant` builds it, whose caller passes no event;
    // unless a score write announces the matchUp after it (a result turned into a double exit: the exit it produces)
    const removedPosition = resulted.has(matchUpId) ? undefined : removed.get(matchUpId);
    const unbyedPosition = resulted.has(matchUpId) && !unbyedLast.has(matchUpId) ? undefined : unbyed.get(matchUpId);
    // a settle pass's result write names the event and the tournament, whatever an earlier write of the matchUp in the
    // same call left out (a convergence re-derived past the produced exit's matchUp: contextless on the unwind, S6 tail)
    const settledWrite = namedResults.has(matchUpId) || carriedNotices.has(matchUpId);
    const noticeEvent =
      !settledWrite && (removedPosition || unbyedPosition || unevented.has(matchUpId)) ? undefined : event;
    modifyMatchUpNotice({
      // v1's writers name themselves: the call's result is `modifyMatchUpScore`'s, a winner's seat in the next matchUp
      // is `assignMatchUpDrawPosition`'s (`directWinner`), a FIRST_MATCHUP reservation's matchUp `setMatchUpStatusBye`'s
      context:
        settled.get(matchUpId) ??
        (byedLast.has(matchUpId) && resulted.has(matchUpId) ? 'setMatchUpStatusBye' : undefined) ??
        noticeContext(matchUpId, removedPosition, unbyedPosition, {
          resulted: placedLast.has(matchUpId) ? new Set<string>() : resulted,
          byes,
          recoded,
          exchanged,
          relayed,
          advanced,
          advancedLast,
          released,
        }),
      eventId: noticeEvent?.eventId,
      tournamentId:
        !settledWrite &&
        ((untournamented.has(matchUpId) && !arrived.has(matchUpId) && !byeNamed.has(matchUpId)) || unbyedPosition)
          ? undefined
          : tournamentId,
      drawDefinition,
      matchUp,
      event: noticeEvent,
    });
  }
  announceScoredTimeCleanup(cleanupTargets, args);
  return planResult(shape, ops, route);
}

/** Announce a group's tally at the result writer that performed it. */
function announceTally(
  matchUpId: string,
  tallyMatchUpId: string | undefined,
  drawDefinition: NonNullable<BuildViewArgs['drawDefinition']>,
): void {
  if (matchUpId === tallyMatchUpId) modifyDrawNotice({ drawDefinition });
}

/** The tally precedes its own result notice; a TEAM line may have announced its result already. */
function tallyNoticeTarget(ops: OutcomeOp[], args: BuildViewArgs): string | undefined {
  if (!ops.some((op) => op.op === 'setParticipantResults')) return undefined;
  return (
    ops.find((op): op is ResultOp => op.op === 'setMatchUpResult' && !!op.dualTally)?.matchUpId ??
    args.request.matchUpId
  );
}

type NativeNoticeStep =
  | { kind: 'ensure' | 'score'; matchUpId: string; rank: number; score: ResultOp }
  | { kind: 'modify'; matchUpId: string; rank: number }
  | { kind: 'position'; matchUpId: string; rank: number; position: ArrivalOp }
  | {
      kind: 'assignments';
      matchUpId?: never;
      structureId: string;
      named: boolean;
      includesEvent: boolean;
      rank: number;
    };

/** Preserve last-write order within each topic, while retaining genuine earlier score boundaries. */
function nativeNoticeSteps(
  ops: OutcomeOp[],
  sourceId: string | undefined,
  stored: Map<string, MatchUp>,
): NativeNoticeStep[] {
  const steps: NativeNoticeStep[] = [];
  const last = new Map<string, NativeNoticeStep>();
  // removeDirectedParticipants scores the call's own matchUp before withdrawing its directed positions.
  const lineSource = !!stored.get(sourceId ?? '')?.collectionId;
  const sourceFirst =
    !lineSource &&
    ops.some(
      (op) =>
        op.op === 'setMatchUpResult' &&
        op.matchUpId === sourceId &&
        op.removesWinningSide &&
        op.stampsScoredTime !== false,
    );
  const sourceIndex = ops.findIndex((op) => op.op === 'setMatchUpResult' && op.matchUpId === sourceId);
  ops.forEach((op, index) => {
    const matchUpId = noticeMatchUpId(op);
    if (matchUpId) last.set(matchUpId, { kind: 'modify', matchUpId, rank: index * 3 + 2 });
    if (op.op !== 'setMatchUpResult' || op.announcedAs) return;
    if (op.ensuredSides || op.dualTally?.sides)
      steps.push({ kind: 'ensure', matchUpId: op.matchUpId, rank: index * 3, score: op });
    steps.push({ kind: 'score', matchUpId: op.matchUpId, rank: index * 3 + 1, score: op });
  });
  ops.forEach((op, index) => {
    if (
      op.op !== 'setMatchUpDrawPositions' ||
      index * 3 + 2 === last.get(op.matchUpId)?.rank ||
      !ops
        .slice(index + 1)
        .some(
          (next) => (next.op === 'setMatchUpResult' || next.op === 'setMatchUpBye') && next.matchUpId === op.matchUpId,
        )
    )
      return;
    if (
      op.clearsScore ||
      op.removedDrawPosition ||
      op.withdrawnByePosition ||
      op.releasedDrawPosition ||
      op.announcesContext === false ||
      op.advancesThroughBye
    )
      steps.push({
        kind: 'position',
        matchUpId: op.matchUpId,
        rank: positionNoticeRank(op, index, steps, stored),
        // removeDoubleExit's recursive withdrawal omits the tournament and event.
        position: index < sourceIndex && !sourceFirst ? { ...op, announcesContext: false } : op,
      });
  });
  if (lineSource && sourceIndex > 0) {
    // scoreModification removes directed participants through an initial line write, then writes the line again.
    const initialLine = steps.find((step) => step.kind === 'score' && step.matchUpId === sourceId);
    if (initialLine) steps.push({ ...initialLine, rank: -2 });
  }
  const ordered = [...steps, ...last.values(), ...assignmentNoticeSteps(ops)];
  if (sourceFirst)
    for (const step of ordered) {
      if (step.matchUpId === sourceId) {
        step.rank = -1;
        if (step.kind === 'ensure') step.rank = -3;
        else if (step.kind === 'score') step.rank = -2;
      }
    }
  return ordered.sort((a, b) => a.rank - b.rank);
}

/** A removal announces this round before resetting the later rounds that its position had reached. */
function positionNoticeRank(
  op: ArrivalOp,
  index: number,
  steps: NativeNoticeStep[],
  stored: Map<string, MatchUp>,
): number {
  const downstream = new Set<string>();
  for (
    let id = stored.get(op.matchUpId)?.winnerMatchUpId;
    id && !downstream.has(id);
    id = stored.get(id)?.winnerMatchUpId
  )
    downstream.add(id);
  const preceding =
    op.clearsScore &&
    steps.find(
      (step) =>
        step.kind === 'score' &&
        step.rank < index * 3 &&
        step.score.stampsScoredTime === false &&
        step.score.matchUpStatus === TO_BE_PLAYED &&
        downstream.has(step.matchUpId),
    );
  return preceding ? preceding.rank - 0.5 : index * 3 + 2;
}

/** Position writers announce their structure when they return, at the program's explicit boundary. */
function assignmentNoticeSteps(ops: OutcomeOp[]): NativeNoticeStep[] {
  return ops.flatMap((op, index): NativeNoticeStep[] => {
    if (!announcesAssignments(op)) return [];
    const named =
      op.op !== 'withdrawBye' && !(op.op === 'announcePositionAssignments' && op.announcesTournament === false);
    let boundary = index;
    if (op.op === 'assignBye') {
      const byeIndex = ops.findIndex(
        (next, at) => at > index && next.op === 'setMatchUpBye' && next.matchUpId === op.matchUpId,
      );
      if (byeIndex >= 0) boundary = byeIndex;
    }
    // Legacy withdrawal programs without an explicit return marker retain their declared final boundary.
    if (op.op === 'withdrawBye') boundary += ops.length;
    return [
      {
        kind: 'assignments',
        structureId: op.structureId,
        named,
        includesEvent: named && !('announcesEvent' in op && op.announcesEvent === false),
        rank: boundary * 3 + 2.5,
      },
    ];
  });
}

/** A real placement/removal may announce before a later score supersedes its keyed notice. */
function announcePositionBoundary(
  op: ArrivalOp,
  matchUp: MatchUp,
  { drawDefinition, tournamentRecord, event }: Pick<BuildViewArgs, 'drawDefinition' | 'tournamentRecord' | 'event'>,
): void {
  const bare = op.announcesContext === false || !!op.withdrawnByePosition || !!op.clearsScore;
  const noticeEvent =
    bare || op.removedDrawPosition || (op.advancesThroughBye && !op.announcesEvent) ? undefined : event;
  modifyMatchUpNotice({
    drawDefinition,
    matchUp,
    tournamentId: bare ? undefined : tournamentRecord?.tournamentId,
    eventId: noticeEvent?.eventId,
    event: noticeEvent,
    context: positionBoundaryContext(op),
  });
}

function positionBoundaryContext(op: ArrivalOp): string {
  if (op.removedDrawPosition) return `removeSubsequentDrawPosition-${op.removedDrawPosition}`;
  if (op.withdrawnByePosition) return `removeDrawPosition-${op.withdrawnByePosition}`;
  if (op.releasedDrawPosition) return 'releaseAdvancedDrawPosition';
  return op.advancesThroughBye ? 'advanceWinner' : 'assignMatchUpDrawPosition';
}

function noticeMatchUpId(op: OutcomeOp): string | undefined {
  return op.op === 'setMatchUpResult' ||
    op.op === 'setMatchUpDrawPositions' ||
    op.op === 'setMatchUpBye' ||
    (op.op === 'setMatchUpStatusCodes' && !op.quiet) ||
    op.op === 'mergeSideExitProvenance' ||
    op.op === 'setSideExitProvenance' ||
    op.op === 'clearMatchUpBye' ||
    op.op === 'setSideLineUp' ||
    op.op === 'setOrderOfFinish' ||
    op.op === 'exchangeDrawPositions'
    ? op.matchUpId
    : undefined;
}

/** A dual ensures its line-ups before tallying; every score writer then defers and announces its own result. */
function announceWriteBoundary(
  step: Extract<NativeNoticeStep, { kind: 'ensure' | 'score' | 'position' }>,
  matchUp: MatchUp,
  { drawDefinition, tournamentRecord, event }: BuildViewArgs,
  tallyMatchUpId: string | undefined,
  deferScore: (score: ResultOp) => void,
): void {
  if (!drawDefinition) return;
  if (step.kind === 'position') {
    announcePositionBoundary(step.position, matchUp, { drawDefinition, tournamentRecord, event });
    return;
  }
  if (step.kind === 'score') {
    announceTally(step.matchUpId, tallyMatchUpId, drawDefinition);
    deferScore(step.score);
  }
  const bare = step.kind === 'score' && step.score.announcesContext === false;
  modifyMatchUpNotice({
    drawDefinition,
    tournamentId: bare ? undefined : tournamentRecord?.tournamentId,
    eventId: bare ? undefined : event?.eventId,
    event: bare ? undefined : event,
    matchUp,
    context: step.kind === 'ensure' ? 'ensureSidLineUps' : 'modifyMatchUpScore',
  });
}

function planResult(shape: PlanShape, ops: OutcomeOp[], route?: Route): ResultType {
  const tieMatchUpResult = dualTallyResult(ops);
  // a winner's route returns the context `directParticipants` builds, a final's included, which carries something only
  // for an exit (S5): empty
  if (route === 'remove-directed') {
    const result = {
      ...SUCCESS,
      connectedStructures: undefined,
      ...(ops.some((op) => op.op === 'setMatchUpResult' && op.returnsQualifierRemoved)
        ? { qualifierRemoved: undefined }
        : {}),
    };
    return result;
  }
  return shape === 'direction' ? { ...SUCCESS, ...tieMatchUpResult, context: {} } : { ...SUCCESS, ...tieMatchUpResult };
}

/** Final stored-order cleanup announces real context after ordinary writers and assignments. */
function announceScoredTimeCleanup(matchUps: MatchUp[], { drawDefinition, tournamentRecord, event }: BuildViewArgs) {
  for (const matchUp of matchUps)
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'reconcileScoredTimes',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
}

/** Actual score writers defer an in-context callback; named settle writers do not. */
const scoreWrites = (ops: OutcomeOp[]) =>
  ops.filter(
    (op): op is Extract<OutcomeOp, { op: 'setMatchUpResult' }> => op.op === 'setMatchUpResult' && !op.announcedAs,
  );

/**
 * A matchUp given a BYE and then another BYE or an advance through one in the same call (S6 tail): v1's notice buffer
 * keeps the LAST write's context and an EARLIER write's event (`preserveNoticeIdentity`). Whether the advance came last,
 * and whether a named BYE or advance came before a later write that names no event (an unfillable seat's BYE, an advance).
 */
function byeAndAdvance(ops: OutcomeOp[]): { advancedLast: Set<string>; eventKept: Set<string> } {
  const last = new Map<string, 'bye' | 'advance'>();
  const evented = new Set<string>();
  const eventKept = new Set<string>();
  for (const op of ops) {
    if (op.op === 'setMatchUpBye') {
      last.set(op.matchUpId, 'bye');
      // a quiet BYE (the seat a produced exit leaves unfillable) keeps an earlier BYE or advance's event
      if (op.announcesEvent === false && evented.has(op.matchUpId)) eventKept.add(op.matchUpId);
      if (op.announcesEvent !== false) evented.add(op.matchUpId);
    } else if (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye) {
      last.set(op.matchUpId, 'advance');
      if (!op.announcesEvent && evented.has(op.matchUpId)) eventKept.add(op.matchUpId);
      if (op.announcesEvent) evented.add(op.matchUpId);
    }
  }
  const advancedLast = new Set([...last].flatMap(([matchUpId, kind]) => (kind === 'advance' ? [matchUpId] : [])));
  return { advancedLast, eventKept };
}

/** C26: a later ordinary awardee placement replaces an earlier BYE advance's notice. */
function advanceNotices(ops: OutcomeOp[]): Set<string> {
  const advanced = new Set<string>();
  for (const op of ops) {
    if (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye) advanced.add(op.matchUpId);
    else if (plainPlacement(op)) advanced.delete(op.matchUpId);
  }
  return advanced;
}

/**
 * a positions write that places plainly: announced, with no withdrawal, removal or advance through a BYE named on it (a
 * release names none of those either, and is read here only where a release's own name was not asked first)
 */
const plainPlacement = (op: OutcomeOp): op is Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> =>
  op.op === 'setMatchUpDrawPositions' &&
  op.announcesContext !== false &&
  !op.advancesThroughBye &&
  !op.withdrawnByePosition &&
  !op.removedDrawPosition;

/**
 * An awardee's position released: v1's `releaseAdvancedDrawPosition` names the matchUp, unless a plain placement writes it
 * after the release (the awardee sent on again as a carry lands, S7): then the placement's name, as v1's buffer keeps it
 */
function releasedNotices(ops: OutcomeOp[]): Set<string> {
  const released = new Map<string, number>();
  for (const op of ops) {
    if (op.op !== 'setMatchUpDrawPositions') continue;
    if (op.releasedDrawPosition) released.set(op.matchUpId, op.releasedDrawPosition);
    else if (
      (op.announcesContext === false &&
        !op.advancesThroughBye &&
        !op.withdrawnByePosition &&
        !op.removedDrawPosition &&
        op.drawPositions.includes(released.get(op.matchUpId) ?? 0)) ||
      plainPlacement(op)
    )
      // A produced award quietly seats the same released participant again; its assignment is the last writer too.
      released.delete(op.matchUpId);
  }
  return new Set(released.keys());
}

/** the matchUps among `quiet` a plain placement writes after their quiet write: v1's buffer keeps the placement's notice */
function placedAfter(ops: OutcomeOp[], quiet: Set<string>): Set<string> {
  const placed = new Set<string>();
  const seen = new Set<string>();
  for (const op of ops) {
    if (
      ((op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpResult') && op.announcesContext === false) ||
      (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye && !op.announcesEvent)
    )
      seen.add(op.matchUpId);
    if (plainPlacement(op) && quiet.has(op.matchUpId) && seen.has(op.matchUpId)) placed.add(op.matchUpId);
  }
  return placed;
}

/**
 * Which notices v1 writes with no event, and with no tournament, read off the ops alone (S7): shared by
 * `applyOwnedPlan`, which writes them, and the differential (`plannedNotices`), which holds v1's notices to them
 */
function noticeRules(ops: OutcomeOp[]) {
  // a position taken back out of a later round: v1's `removeSubsequentRoundsParticipant` names the position, no event.
  // Not when the same write places one (a changed winner): v1 announces the placement after the removal, and the
  // notice buffer keeps the later of the two for the matchUp
  const removed = new Map(
    ops.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.removedDrawPosition && !op.placedDrawPosition
        ? [[op.matchUpId, op.removedDrawPosition]]
        : [],
    ),
  );
  // a placement v1 announces with no event or tournament (a produced exit's award, sent on by `doubleExitAdvancement`)
  const unevented = new Set(
    ops.flatMap((op) =>
      (op.op === 'setMatchUpDrawPositions' &&
        (op.announcesContext === false || (op.advancesThroughBye && !op.announcesEvent))) ||
      (op.op === 'setMatchUpResult' && op.announcesContext === false) ||
      ((op.op === 'setMatchUpBye' || op.op === 'setSideExitProvenance') && op.announcesEvent === false)
        ? [op.matchUpId]
        : [],
    ),
  );
  // and with no tournament either (a produced exit's award, #5875; an exit recorded beside a BYE and carried on)
  const untournamented = new Set<string>();
  for (const op of ops) {
    if ((op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpResult') && op.announcesContext === false)
      untournamented.add(op.matchUpId);
    else if (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye) untournamented.delete(op.matchUpId);
  }
  // ...but a BYE written there too: v1's `setMatchUpStatusBye` announces the matchUp last, with the tournament, though
  // its context stays read without it (the matchUp the unfillable seat's BYE makes a BYE, S7; the only order measured)
  const byeNamed = new Set(ops.flatMap((op) => (op.op === 'setMatchUpBye' ? [op.matchUpId] : [])));
  // a BYE an unwind withdraws: v1's `clearDrawPosition` names its position, with neither event nor tournament (S6)
  const unbyed = withdrawnByeNotices(ops);
  // a loser placed through a BYE into a matchUp an unwind wrote quietly (`unwoundThrough`): v1 announces the arrival last,
  // with the event and the tournament; the in-context notice stays the quiet score write's
  const arrived = new Set(
    ops.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.placedDrawPosition && !op.removedDrawPosition ? [op.matchUpId] : [],
    ),
  );
  // ...as is a plain placement after a quiet write (an awardee sent on again into the matchUp an unwind's release
  // emptied, or wrote back to be played, S7): v1's `assignMatchUpDrawPosition` announces it last
  for (const matchUpId of placedAfter(ops, unevented)) arrived.add(matchUpId);
  for (const matchUpId of arrived) unevented.delete(matchUpId);
  // a quiet BYE or advance keeps an earlier named BYE or advance's event (`byeAndAdvance`)
  for (const matchUpId of byeAndAdvance(ops).eventKept) unevented.delete(matchUpId);
  // a team's line-up written with no event, unless a result written after it announces the matchUp (`namedWriters`)
  for (const matchUpId of namedWriters(ops).lineUpUnevented) unevented.add(matchUpId);
  // A settle writer, or an explicitly restoring last score write, names the full identity after an earlier quiet write.
  const lastScores = new Map(scoreWrites(ops).map((op) => [op.matchUpId, op] as const));
  const namedResults = new Set([
    ...ops.flatMap((op) => (op.op === 'setMatchUpResult' && op.announcedAs ? [op.matchUpId] : [])),
    ...[...lastScores.values()].flatMap((op) => (op.restoresNoticeIdentity ? [op.matchUpId] : [])),
  ]);
  const carriedNotices = new Set(
    [...namedWriters(ops).settled].flatMap(([matchUpId, writer]) =>
      writer === 'progressExitStatus' ? [matchUpId] : [],
    ),
  );
  return { removed, unevented, untournamented, unbyed, namedResults, arrived, byeNamed, carriedNotices };
}

/**
 * The matchUps and structures whose notices name no event (S7): a matchUp's where its position is removed or its BYE
 * withdrawn and no result announces it after (v1's `removeSubsequentRoundsParticipant`, `clearDrawPosition`), or
 * where v1's writer passes none; a structure's where nothing evented is placed in it (`announceAssignments`)
 */
export function eventlessNotices(ops: OutcomeOp[]): { matchUps: Set<string>; structures: Set<string> } {
  const { removed, unevented, unbyed, namedResults, carriedNotices } = noticeRules(ops);
  const resulted = new Set(ops.flatMap((op) => (op.op === 'setMatchUpResult' ? [op.matchUpId] : [])));
  const matchUps = new Set(
    ops.flatMap((op) => {
      if (!('matchUpId' in op) || !op.matchUpId) return [];
      const { matchUpId } = op;
      const unplaced = !resulted.has(matchUpId) && (removed.has(matchUpId) || unbyed.has(matchUpId));
      return !namedResults.has(matchUpId) && !carriedNotices.has(matchUpId) && (unplaced || unevented.has(matchUpId))
        ? [matchUpId]
        : [];
    }),
  );
  const structures = new Set(touchedStructures(ops).filter((structureId) => !eventedPlacement(ops, structureId)));
  return { matchUps, structures };
}

const placement = (op: OutcomeOp): op is Extract<OutcomeOp, { op: 'assignPosition' | 'assignBye' }> =>
  op.op === 'assignPosition' || op.op === 'assignBye';

/**
 * an op whose structure's assignments v1 announces: a placement, and a seat an unwind visits but for a BYE the round-1
 * loser cascade takes back, which v1 announces no assignments for (S6 tail). The writer and the differential's planned
 * notices share this one rule
 */
export const announcesAssignments = (
  op: OutcomeOp,
): op is Extract<OutcomeOp, { op: 'assignPosition' | 'assignBye' | 'withdrawBye' | 'announcePositionAssignments' }> =>
  op.op === 'announcePositionAssignments' ||
  op.op === 'assignPosition' ||
  ((op.op === 'assignBye' || op.op === 'withdrawBye') && op.announcesAssignments !== false);

/** each structure a placement or an unwind's seat visit touches, in the order the call first touches it */
const touchedStructures = (ops: OutcomeOp[]) => [
  ...new Set(ops.flatMap((op) => (announcesAssignments(op) ? [op.structureId] : []))),
];

/**
 * a structure whose assignments notice names the event: a placement in it announced with one, the buffer keeping an
 * earlier notice's event when a later one names none. A seat an unwind visits with nothing placed names none
 */
const eventedPlacement = (ops: OutcomeOp[], structureId: string) =>
  ops.some(
    (op) =>
      (placement(op) || op.op === 'announcePositionAssignments') &&
      op.structureId === structureId &&
      !('announcesEvent' in op && op.announcesEvent === false),
  );

/**
 * A TEAM line's call returns its dual's tally as v1's `directParticipants` annotates it (`tieMatchUpResult`, S7): the
 * dual's score and the winner it decides, if it decides one; no winner removed, no tieFormat removed
 */
function dualTallyResult(ops: OutcomeOp[]) {
  const tally = ops.find((op): op is ResultOp => op.op === 'setMatchUpResult' && !!op.dualTally);
  if (tally?.op !== 'setMatchUpResult' || tally.dualTally?.unreturned) return {};
  return {
    tieMatchUpResult: {
      ...SUCCESS,
      score: tally.score,
      removeWinningSide: false,
      tieFormatRemoved: undefined,
      winningSide: tally.winningSide,
    },
  };
}

/**
 * The structures whose assignments the ops change: a loser placed across a link, or a reserved seat, announced once
 * (v1's `directLoser`, `assignDrawPositionBye`); and a seat an unwind visits (S6)
 */
function announceAssignmentBoundary(
  { structureId, named, includesEvent }: Extract<NativeNoticeStep, { kind: 'assignments' }>,
  { drawDefinition, tournamentRecord, event }: BuildViewArgs,
): void {
  if (!drawDefinition) return;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return;
  modifyPositionAssignmentsNotice({
    drawDefinition,
    structure,
    tournamentId: named ? tournamentRecord?.tournamentId : undefined,
    event: includesEvent ? event : undefined,
  });
}

/**
 * A BYE an unwind withdraws: v1's `clearDrawPosition` names its position, with neither event nor tournament (S6), unless
 * a seat is then advanced into the matchUp through a standing BYE, whose later notice v1's buffer keeps (S6 tail)
 */
function withdrawnByeNotices(ops: OutcomeOp[]): Map<string, number> {
  const unbyed = new Map<string, number>();
  for (const op of ops) {
    if (op.op === 'clearMatchUpBye') unbyed.set(op.matchUpId, op.drawPosition);
    if (op.op === 'setMatchUpDrawPositions' && op.withdrawnByePosition)
      unbyed.set(op.matchUpId, op.withdrawnByePosition);
    // any later positions write (a seat advanced through the standing BYE, a loser placed through it (`unwoundThrough`),
    // a release emptying the BYE matchUp, an awardee sent on after the carry lands, S7): its notice is the last
    else if (op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpBye') unbyed.delete(op.matchUpId);
  }
  return unbyed;
}

function noticeContext(
  matchUpId: string,
  removedPosition: number | undefined,
  unbyedPosition: number | undefined,
  written: Parameters<typeof matchUpContext>[1],
): string {
  if (removedPosition) return `removeSubsequentDrawPosition-${removedPosition}`;
  if (unbyedPosition) return `removeDrawPosition-${unbyedPosition}`;
  return matchUpContext(matchUpId, written);
}

function matchUpContext(
  matchUpId: string,
  written: {
    resulted: Set<string>;
    byes: Set<string>;
    recoded: Set<string>;
    exchanged: Set<string>;
    relayed: Set<string>;
    advanced: Set<string>;
    advancedLast: Set<string>;
    released: Set<string>;
  },
): string {
  const { resulted, byes, recoded, exchanged, relayed, advanced, advancedLast, released } = written;
  if (resulted.has(matchUpId)) return 'modifyMatchUpScore';
  // a BYE and an advance through one: the later write's context (`byeAndAdvance`)
  if (advanced.has(matchUpId) && (!byes.has(matchUpId) || advancedLast.has(matchUpId))) return 'advanceWinner';
  if (released.has(matchUpId)) return 'releaseAdvancedDrawPosition';
  if (relayed.has(matchUpId)) return 'progressExitStatus';
  // a loser taken back out and their seat then given a BYE (a result turned into a double exit): the BYE is the later
  if (recoded.has(matchUpId) && byes.has(matchUpId)) return 'setMatchUpStatusBye';
  if (recoded.has(matchUpId)) return 'removeDirectedLoser';
  if (exchanged.has(matchUpId)) return 'swapWinnerLoser';
  return byes.has(matchUpId) ? 'setMatchUpStatusBye' : 'assignMatchUpDrawPosition';
}

/**
 * The writers v1's notices name where they are not the matchUp's result: a settle pass's write (a withdrawn carry,
 * `reconcileScoredTimes`) and a team's line-up carried on (`directWinner`, `directLoser`) or written at its assignment
 * (`updateSidLineUp`, with no event where `assignTeamLineUp` hands it none). A matchUp's notice is its last writer's: a
 * result written after a line-up (a dual's exit carried onto the dual its losing team reached, whose own call writes it)
 * announces the matchUp as the result does (S7).
 */
function namedWriters(ops: OutcomeOp[]) {
  const settled = new Map<string, string>();
  const lineUpUnevented = new Set<string>();
  // a carry recorded beside the BYE a team's line-up is written on (a dual's passage, S7): v1 records it after the
  // line-up, so the carry's notice is the matchUp's, with its event
  const relayed = new Set(ops.flatMap((op) => (op.op === 'mergeSideExitProvenance' ? [op.matchUpId] : [])));
  for (const op of ops) {
    if ((op.op === 'mergeSideExitProvenance' || op.op === 'setSideExitProvenance') && op.announcedAs) {
      settled.set(op.matchUpId, op.announcedAs);
      lineUpUnevented.delete(op.matchUpId);
    } else if (op.op === 'setSideLineUp') {
      if (relayed.has(op.matchUpId)) continue;
      settled.set(op.matchUpId, op.announcedAs);
      if (op.announcesEvent === false) lineUpUnevented.add(op.matchUpId);
    } else if (
      op.op === 'setMatchUpDrawPositions' &&
      op.advancesThroughBye &&
      settled.get(op.matchUpId) === 'withdrawProducedExits'
    ) {
      settled.delete(op.matchUpId);
    } else if (
      (op.op === 'setMatchUpBye' || op.op === 'setMatchUpDrawPositions') &&
      ['withdrawDisplacedCarry', 'assignDrawPositionBye-TEAM'].includes(settled.get(op.matchUpId) ?? '')
    ) {
      settled.delete(op.matchUpId);
      lineUpUnevented.delete(op.matchUpId);
    } else if (op.op === 'setMatchUpResult') {
      if (op.announcedAs) settled.set(op.matchUpId, op.announcedAs);
      else settled.delete(op.matchUpId);
      lineUpUnevented.delete(op.matchUpId);
    }
  }
  return { settled, lineUpUnevented };
}
