import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { appendNotice, type NoticeState } from '@Global/state/noticeIdentity';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { checkConnectedStructures } from '@Mutate/drawDefinitions/matchUpGovernor/checkConnectedStructures';
import { sideRecordOf } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { tiebreakPointsWarnings } from '@Scoring/analysis/validateScore';
import { findStructure } from '@Acquire/findStructure';
import { matchUpWillNeverBePlayed } from '@Helpers/scheduling/schedulePredicates';
import { matchUpHoldsScheduling } from '@Mutate/matchUps/schedule/byeScheduling';
import { claimEdges } from '../plan/placementClaims';
import { recordedNotice } from '../plan/recordedDiff';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { TO_BE_PLAYED, IN_PROGRESS, BYE } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import {
  deferredQuery,
  deferInContextMatchUp,
  modifyMatchUpNotice,
  type NoticeEffects,
} from '@Mutate/notifications/drawNotifications';

import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { OutcomeView, OutcomeRequest, Route } from '../types';
import type { OutcomeOp, RecordedNotice } from '../ops';
import type { Notice } from '@Global/state/globalState';
import type { WorkingView } from '../overlay';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';

type OpaqueNotice = { topic: string; key?: string; unmodeled: true };
export type SettlementNoticeInput = {
  topics?: string[];
  priorNotices?: (RecordedNotice | OpaqueNotice)[];
  tracksModificationMarks?: boolean;
  disableNotifications?: boolean;
};

type Args = SettlementNoticeInput & {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  capturedClock?: number;
  request: OutcomeRequest;
  event?: Event;
  view: OutcomeView;
  route?: Route;
  working: Pick<WorkingView, 'drawDefinition' | 'matchUpsMap'>;
  ops: OutcomeOp[];
};

type Emission = { match: HydratedMatchUp; context: string; bound: boolean; eventless?: boolean };
type Program = { emissions: Emission[]; result: ResultType & { connectedStructures?: boolean } };
type Prediction = {
  reasons: string[];
  announced?: Extract<OutcomeOp, { op: 'announceRecorded' }>;
  result?: ResultType;
  readings?: number[];
};

const score = (match: HydratedMatchUp, bound: boolean): Emission => ({ match, bound, context: 'modifyMatchUpScore' });

/** A produced award can send its occupied side to a terminal receiver before withdrawal. The
 * feed-round intersection, or the paired feeder's standing winner, must name that same seat.
 * Releasing it precedes the postorder score notices even when it is superseded in the buffer. */
function terminalRelease(
  args: Args,
  matches: HydratedMatchUp[],
  previous: HydratedMatchUp,
  award: HydratedMatchUp,
  terminal: HydratedMatchUp,
): Emission | undefined {
  const side = award.sides?.find((s) => s.sideNumber === award.winningSide);
  const position = side?.drawPosition;
  if (!position || !side.participantId || award.drawPositions?.filter(Boolean).length !== 1) return;
  if (
    terminal.structureId !== award.structureId ||
    terminal.matchUpStatus !== TO_BE_PLAYED ||
    terminal.winningSide ||
    getSideExitProvenance({ matchUp: terminal }) ||
    terminal.drawPositions?.filter(Boolean).length !== 1 ||
    !terminal.sides?.some((s) => s.drawPosition === position && s.participantId === side.participantId)
  )
    return;
  const edges = claimEdges({ drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches }, terminal);
  if (!edges.targetMatchUps || Object.values(edges.targetMatchUps).some(Boolean)) return;
  if (
    matches.some(
      (m) =>
        m.structureId === award.structureId &&
        (m.roundNumber ?? 0) > (award.roundNumber ?? 0) &&
        m.matchUpId !== terminal.matchUpId &&
        m.drawPositions?.includes(position),
    )
  )
    return;
  if (!award.feedRound) {
    const paired = matches.filter(
      (m) =>
        m.structureId === previous.structureId &&
        m.roundNumber === previous.roundNumber &&
        m.matchUpId !== previous.matchUpId &&
        (m.winnerMatchUpId === award.matchUpId || m.loserMatchUpId === award.matchUpId),
    );
    if (
      paired.length !== 1 ||
      !paired[0].winningSide ||
      !paired[0].drawPositions?.includes(position) ||
      previous.drawPositions?.includes(position)
    )
      return;
  }
  const after = args.working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === terminal.matchUpId);
  if (!after?.drawPositions || after.drawPositions.length) return;
  return { match: terminal, context: `removeSubsequentDrawPosition-${position}`, bound: false };
}

function independentEmptyReceiver(matches: HydratedMatchUp[], next: HydratedMatchUp, originId?: string) {
  const origin = matches.find((m) => m.matchUpId === originId);
  return (
    origin &&
    (origin.winnerMatchUpId === next.matchUpId || origin.loserMatchUpId === next.matchUpId) &&
    isDoubleExit(origin.matchUpStatus) &&
    !getSideExitProvenance({ matchUp: origin }) &&
    !next.drawPositions?.some(Boolean)
  );
}

function releaseBeforeScore(
  args: Args,
  matches: HydratedMatchUp[],
  current: HydratedMatchUp,
  next: HydratedMatchUp,
): Emission[] | undefined {
  if (!next.drawPositions?.some(Boolean)) return [];
  const onward = claimEdges({ drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches }, next);
  if (!onward.targetMatchUps || onward.targetMatchUps.loserMatchUp || onward.targetMatchUps.byeMatchUp) return;
  if (!onward.targetMatchUps.winnerMatchUp) return [];
  if (onward.targetLinks.winnerTargetLink || !getSideExitProvenance({ matchUp: next })) return;
  const release = terminalRelease(args, matches, current, next, onward.targetMatchUps.winnerMatchUp);
  return release && [release];
}

/** A double exit's unwind visits its winner's targets before resetting that winner. A quiet onward
 * holder can receive a score notice even when its slots and status stay put. Recursion drops the
 * event and tournament bindings; the immediate target and the source retain the caller's bindings. */
function unwindScores(args: Args, source: HydratedMatchUp, matches: HydratedMatchUp[]): Emission[] | undefined {
  const frame = { drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches };
  const withdrawn = new Set([source.matchUpId]);
  const scores: Emission[] = [];
  const releases: Emission[] = [];
  let current = source;
  for (;;) {
    const edges = claimEdges(frame, current);
    if (!edges.targetMatchUps || edges.targetMatchUps.loserMatchUp || edges.targetMatchUps.byeMatchUp) return undefined;
    const next = edges.targetMatchUps.winnerMatchUp;
    if (!next) break;
    if (next.structureId !== source.structureId || edges.targetLinks.winnerTargetLink || withdrawn.has(next.matchUpId))
      return undefined;
    const marks = Object.values(getSideExitProvenance({ matchUp: next }) ?? {});
    // A single independently produced exit, carrying no seat onward, keeps its own result.
    if (marks.length && !marks.every((mark) => mark.sourceMatchUpId && withdrawn.has(mark.sourceMatchUpId))) {
      if (marks.length === 1 && independentEmptyReceiver(matches, next, marks[0].sourceMatchUpId)) break;
      return undefined;
    }
    if (next.matchUpStatus !== TO_BE_PLAYED && !isExit(next.matchUpStatus)) return undefined;
    if (next.sides?.some((s) => s.bye)) return undefined;
    const additions = releaseBeforeScore(args, matches, current, next);
    if (!additions) return undefined;
    releases.push(...additions);
    scores.push(score(next, current === source));
    withdrawn.add(next.matchUpId);
    current = next;
  }
  return [...releases, ...scores.reverse()];
}

function clearProgram(args: Args): Program | undefined {
  const { request, route, view } = args;
  const matches = view.inContextDrawMatchUps;
  const source = matches?.find((m) => m.matchUpId === request.matchUpId);
  if (!source || !matches || view.group || view.isTeam || view.line || request.winningSide) return undefined;
  if (request.matchUpFormat || request.carries?.notes || request.carries?.schedule) return undefined;
  if (view.draw.luckyBased || source.winningSide || !isDoubleExit(source.matchUpStatus)) return undefined;
  if (
    !(route === 'clear-score' && request.matchUpStatus === TO_BE_PLAYED) &&
    !(route === 'clear' && request.matchUpStatus === IN_PROGRESS)
  )
    return undefined;

  const emissions = unwindScores(args, source, matches);
  if (!emissions) return undefined;
  emissions.push(score(source, true));
  const touched = new Set(emissions.map((e) => e.match.matchUpId));
  for (const op of args.ops) {
    if (op.op === 'stampUpdatedAt') continue;
    if (!('matchUpId' in op) || !op.matchUpId || !touched.has(op.matchUpId)) return undefined;
    if (op.op === 'clearMatchUpScoredTime') {
      const match = matches.find((m) => m.matchUpId === op.matchUpId);
      if (!match) return undefined;
      emissions.push({ match, bound: true, context: 'reconcileScoredTimes' });
    } else if (
      op.op === 'setMatchUpDrawPositions' &&
      emissions.some((e) => e.match.matchUpId === op.matchUpId && e.context.startsWith('removeSubsequentDrawPosition-'))
    )
      continue;
    else if (!['setMatchUpResult', 'setSideExitProvenance', 'setMatchUpStatusCodes'].includes(op.op)) return undefined;
  }
  const stack = [
    ...(route === 'clear-score' ? ['ndd:scoreModification'] : []),
    'noDownStreamDependencies',
    'setMatchUpStatus',
    'setMatchUpStatus',
  ];
  const result: ResultType = { success: true, stack };
  if (!request.flags.disableScoreValidation && request.score?.sets?.length) {
    const stored = args.working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === source.matchUpId);
    const warnings = tiebreakPointsWarnings(stored?.score?.sets, view.existing.matchUpFormat);
    if (warnings.length) result.warnings = warnings;
  }
  return { emissions, result };
}

function winnerRemoval(
  matches: HydratedMatchUp[],
  source: HydratedMatchUp,
  winner: HydratedMatchUp,
  winnerPosition: number,
  emissions: Emission[],
): boolean {
  const held = matches.filter(
    (m) =>
      m.structureId === source.structureId &&
      (m.roundNumber ?? 0) > (source.roundNumber ?? 0) &&
      m.drawPositions?.includes(winnerPosition),
  );
  if (
    held.some((m) => m.matchUpId !== winner.matchUpId) ||
    winner.matchUpStatus !== TO_BE_PLAYED ||
    winner.winningSide ||
    getSideExitProvenance({ matchUp: winner })
  )
    return false;
  if (held.length)
    emissions.push({
      match: winner,
      context: `removeSubsequentDrawPosition-${winnerPosition}`,
      bound: true,
      eventless: true,
    });

  return true;
}

/** One direct linked loser whose sole produced exit belonged to the withdrawn source, whose
 * awarded seat was empty, and which passed neither a position nor a derived exit on. */
function plainProducedLoser(args: Args, source: HydratedMatchUp, loser: HydratedMatchUp, matches: HydratedMatchUp[]) {
  const entries = Object.entries(getSideExitProvenance({ matchUp: loser }) ?? {});
  const carrier = source.sides?.find((s) => s.sideNumber && s.sideNumber !== source.winningSide);
  if (!isExit(source.matchUpStatus) || !loser.winningSide || entries.length !== 1 || !carrier?.participantId)
    return false;
  const [side, mark] = entries[0];
  if (
    mark.sourceMatchUpId !== source.matchUpId ||
    mark.previousMatchUpStatus !== source.matchUpStatus ||
    mark.matchUpStatus !== loser.matchUpStatus ||
    Number(side) === loser.winningSide ||
    !loser.sides?.some((s) => s.sideNumber === Number(side) && s.participantId === carrier.participantId) ||
    loser.sides?.some((s) => s.sideNumber === loser.winningSide && s.drawPosition) ||
    loser.drawPositions?.filter(Boolean).length !== 1
  )
    return false;
  const edge = claimEdges({ drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches }, loser);
  if (
    !edge.targetMatchUps ||
    edge.targetLinks.winnerTargetLink ||
    edge.targetMatchUps.loserMatchUp ||
    edge.targetMatchUps.byeMatchUp
  )
    return false;
  return !matches.some((m) =>
    Object.values(getSideExitProvenance({ matchUp: m }) ?? {}).some(
      (entry) => entry.sourceMatchUpId === loser.matchUpId,
    ),
  );
}

function loserRemoval(
  args: Args,
  source: HydratedMatchUp,
  loser: HydratedMatchUp,
  matches: HydratedMatchUp[],
  withdrawn: boolean,
  emissions: Emission[],
): boolean {
  const edge = claimEdges({ drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches }, source);
  const losing = source.sides?.find((s) => s.sideNumber !== source.winningSide);
  if (
    !edge.targetLinks?.loserTargetLink ||
    (!withdrawn &&
      (loser.matchUpStatus !== TO_BE_PLAYED || loser.winningSide || getSideExitProvenance({ matchUp: loser }))) ||
    loser.sides?.some((s) => s.bye)
  )
    return false;
  // A released entrant still held elsewhere can send further removals, including over winner links.
  if (
    losing?.participantId &&
    matches.some(
      (m) =>
        m.structureId === loser.structureId &&
        m.matchUpId !== loser.matchUpId &&
        m.sides?.some((s) => s.participantId === losing.participantId),
    )
  )
    return false;
  if (
    edge.targetLinks.loserTargetLink.linkCondition === FIRST_MATCHUP &&
    matches.some(
      (m) =>
        m.structureId === source.structureId &&
        m.matchUpStatus === BYE &&
        losing?.drawPosition &&
        m.drawPositions?.includes(losing.drawPosition),
    )
  )
    return false;
  const before = getMatchUpsMap({ drawDefinition: args.drawDefinition }).drawMatchUps.find(
    (m) => m.matchUpId === loser.matchUpId,
  );
  const after = args.working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === loser.matchUpId);
  if (!before || !after) return false;
  const intermediate = withdrawn ? { ...before, sideExitProvenance: undefined, matchUpStatusCodes: [] } : before;
  if (sideRecordOf(intermediate) !== sideRecordOf(after))
    emissions.push({ match: loser, context: 'removeDirectedLoser', bound: true });

  return true;
}

function accountsForRemoval(
  op: OutcomeOp,
  matches: HydratedMatchUp[],
  emissions: Emission[],
  source: HydratedMatchUp,
  withdrawn: boolean,
  loserId?: string,
  winner?: HydratedMatchUp,
  winnerPosition?: number,
  loser?: HydratedMatchUp,
) {
  if (op.op === 'stampUpdatedAt' || (op.op === 'setMatchUpResult' && op.matchUpId === source.matchUpId)) return true;
  if (
    op.op === 'setMatchUpDrawPositions' &&
    winner &&
    op.matchUpId === winner.matchUpId &&
    op.removedDrawPosition === winnerPosition
  )
    return true;
  if (op.op === 'clearPosition' && loser && op.structureId === loser.structureId && op.participantId === loserId)
    return true;
  if (
    withdrawn &&
    op.op === 'setMatchUpResult' &&
    op.matchUpId === loser?.matchUpId &&
    op.announcedAs === 'withdrawProducedExits' &&
    op.matchUpStatus === TO_BE_PLAYED
  )
    return true;
  if (withdrawn && op.op === 'setSideExitProvenance' && op.matchUpId === loser?.matchUpId && !op.provenance)
    return true;
  if (op.op === 'setMatchUpStatusCodes' && op.matchUpId === loser?.matchUpId) return true;
  if (op.op === 'clearMatchUpScoredTime') {
    const match = matches.find((m) => m.matchUpId === op.matchUpId);
    if (!match) return false;
    emissions.push({ match, context: 'reconcileScoredTimes', bound: true });
    return true;
  }
  return false;
}

/** The source score is announced first. Removing its winner uses the source tournament but
 * drops the event binding. The plain linked loser removal publishes a match notice only when it
 * changes that target's side record; an assignment cleared without such a change is quiet. */
function removeProgram(args: Args): Program | undefined {
  const { request, route, view } = args;
  if (
    route !== 'remove-directed' ||
    view.isTeam ||
    view.line ||
    view.group ||
    view.draw.tallied ||
    view.draw.unlinkedQualifierRemoval ||
    request.winningSide ||
    request.matchUpStatus !== TO_BE_PLAYED ||
    request.score?.sets?.length ||
    request.matchUpFormat ||
    request.carries?.schedule ||
    request.carries?.notes
  )
    return undefined;
  const matches = view.inContextDrawMatchUps;
  const source = matches?.find((m) => m.matchUpId === request.matchUpId);
  if (!matches || !source?.winningSide || isDoubleExit(source.matchUpStatus)) return undefined;
  const frame = { drawDefinition: args.drawDefinition, inContextDrawMatchUps: matches };
  const edge = claimEdges(frame, source);
  if (!edge.targetMatchUps || edge.targetLinks.winnerTargetLink || edge.targetMatchUps.byeMatchUp) return undefined;
  const winner = edge.targetMatchUps.winnerMatchUp;
  const loser = edge.targetMatchUps.loserMatchUp;
  const winnerPosition = source.sides?.find((s) => s.sideNumber === source.winningSide)?.drawPosition;
  const losing = source.sides?.find((s) => s.sideNumber !== source.winningSide);
  const emissions = [score(source, true)];
  const supplied = matches.filter((m) =>
    Object.values(getSideExitProvenance({ matchUp: m }) ?? {}).some(
      (mark) => mark.sourceMatchUpId === source.matchUpId,
    ),
  );
  const withdrawn =
    supplied.length === 1 &&
    loser?.matchUpId === supplied[0].matchUpId &&
    !!loser &&
    plainProducedLoser(args, source, loser, matches);
  if (supplied.length && !withdrawn) return undefined;
  if (withdrawn && loser) emissions.push({ match: loser, context: 'withdrawProducedExits', bound: true });
  if (winner && winnerPosition && !winnerRemoval(matches, source, winner, winnerPosition, emissions)) return undefined;
  if (loser && !loserRemoval(args, source, loser, matches, withdrawn, emissions)) return undefined;
  if (
    !args.ops.every((op) =>
      accountsForRemoval(
        op,
        matches,
        emissions,
        source,
        withdrawn,
        losing?.participantId,
        winner,
        winnerPosition,
        loser,
      ),
    )
  )
    return undefined;
  const { structure } = findStructure({ drawDefinition: args.drawDefinition, structureId: source.structureId });
  if (!structure) return undefined;
  const { connectedStructureIds } = checkConnectedStructures({
    drawDefinition: args.drawDefinition,
    structure,
    matchUp: source,
  });
  return {
    emissions,
    result: {
      success: true,
      connectedStructures: connectedStructureIds.length ? true : undefined,
      stack: ['noDownStreamDependencies', 'setMatchUpStatus', 'setMatchUpStatus'],
    },
  };
}

/** Append using the same keyed replacement, subscription and modification-mark rules as the provider.
 * Prior descriptors contribute their envelope identity; their original payloads are never evaluated. */
function render(args: Args, program: Program): Prediction {
  const prior = args.priorNotices!;
  const initial: Notice[] = prior.map((n) => ({
    topic: n.topic,
    key: n.key,
    payload: 'unmodeled' in n ? {} : n.fields,
  }));
  const untouched = new Set(initial);
  const state: NoticeState = {
    notices: initial.slice(),
    subscriptions: Object.fromEntries(args.topics!.map((t) => [t, true])),
    disableNotifications: args.disableNotifications!,
    modified: false,
    modifiedTopics: new Set(),
    modifiedTournamentIds: new Set(),
  };
  const effects: NoticeEffects = {
    planStamp: () => undefined,
    getCapturedStamps: () => undefined,
    readClock: () => {
      throw new Error('unexpected uncaptured settlement read');
    },
    addNotice: (n) => appendNotice(state, n),
  };
  const projected = args.working.drawDefinition;
  for (const emission of program.emissions) {
    const { context, bound } = emission;
    const event = bound && !emission.eventless ? args.event : undefined;
    const tournamentRecord = bound ? args.tournamentRecord : undefined;
    const tournamentId = tournamentRecord?.tournamentId;
    const matchUpId = emission.match.matchUpId;
    const matchUp = args.working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === matchUpId);
    if (!matchUp) return { reasons: ['unresolved notice entity'] };
    if (context === 'modifyMatchUpScore' && args.topics!.includes(UPDATE_INCONTEXT_MATCHUP))
      deferInContextMatchUp(
        {
          matchUpId,
          tournamentId,
          inContextMatchUp: deferredQuery(getInContextMatchUp, {
            matchUpId,
            drawDefinition: projected,
            tournamentRecord,
          }),
        },
        effects,
      );
    modifyMatchUpNotice({ context, drawDefinition: projected, event, matchUp, tournamentId }, effects);
  }
  const notices: RecordedNotice[] = [];
  for (const n of state.notices) {
    if (untouched.has(n)) continue;
    if (prior.some((p) => 'unmodeled' in p && p.key === n.key && p.topic === n.topic))
      return { reasons: ['unknown superseded notice identity'] };
    const recorded = recordedNotice(n);
    if (!recorded) return { reasons: ['unknown notice descriptor'] };
    notices.push(recorded);
  }
  const marks = args.tracksModificationMarks
    ? {
        tournamentIds: [...state.modifiedTournamentIds!],
        topics: [...state.modifiedTopics!],
      }
    : undefined;
  return { result: program.result, announced: { op: 'announceRecorded', notices, marks }, readings: [], reasons: [] };
}

/** Predict the buffered effect of a certified material plan without invoking a writer or reading the process clock. */
export function planSettlementEffects(args: Args): Prediction {
  if (
    !Number.isFinite(args.capturedClock) ||
    !args.topics ||
    !args.priorNotices ||
    args.tracksModificationMarks === undefined ||
    args.disableNotifications === undefined
  )
    return { reasons: ['missing captured notice or clock context'] };
  const program = args.route === 'remove-directed' ? removeProgram(args) : clearProgram(args);
  if (!program) return { reasons: ['unmodeled settlement emission order'] };
  const before = getMatchUpsMap({ drawDefinition: args.drawDefinition }).drawMatchUps;
  if (
    args.working.matchUpsMap.drawMatchUps.some(
      (matchUp) =>
        matchUpHoldsScheduling({ matchUp }) &&
        matchUpWillNeverBePlayed({ matchUp }) &&
        !before.some((m) => m.matchUpId === matchUp.matchUpId && matchUpWillNeverBePlayed({ matchUp: m })),
    )
  )
    return { reasons: ['scheduled holder newly unplayable'] };
  return render(args, program);
}
