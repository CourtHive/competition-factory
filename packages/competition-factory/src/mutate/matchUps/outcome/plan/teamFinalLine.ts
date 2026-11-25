import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { hasStaleScoredTime, scoredTimeAction } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { directScoredParticipants } from '@Mutate/matchUps/drawPositions/directParticipants';
import { ensureSideLineUps } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { finishingOrderUpdates } from '@Query/matchUp/finishingOrder';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getNoticeBuffer } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { cloneData, cloneState, restoreState } from '@Tools/cloneState';
import { nowIso } from '@Tools/clock';
import { returnedOnStored } from './recordedCall';
import { bareResultRequest } from './planShared';
import { Recording } from '../recording';
import { changedOwnState, ownState, pendingAnnouncement, stampCopies, withNoticeMarks } from './recordedDiff';
import { DRAW_CHILDREN, MATCHUP_CHILDREN, recordedName, STRUCTURE_CHILDREN } from '../ops';

// constants and types
import type { BuildViewArgs, PlanArgs, OutcomePlan, RecordCopy } from '../types';
import type { DrawDefinition, MatchUp, Score, Structure } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';
import { CONSOLATION, DOUBLE_ELIMINATION, LOSER, MAIN, PLAY_OFF, WINNER } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

type Circuit = { dualId: string; lineId: string; mainId: string; winnerId?: string; loserId?: string; backId?: string };

/** A single outgoing round link for this outcome must connect the two rounds named by the stored matchUp edges. */
function feeds(
  draw: DrawDefinition,
  kind: typeof WINNER | typeof LOSER,
  from: Structure,
  source: MatchUp,
  to: Structure,
  target: MatchUp,
) {
  const links = draw.links?.filter(
    (link) =>
      link.linkType === kind &&
      link.source.structureId === from.structureId &&
      link.source.roundNumber === source.roundNumber,
  );
  return (
    links?.length === 1 &&
    !links[0].linkCondition &&
    links[0].target.structureId === to.structureId &&
    links[0].target.roundNumber === target.roundNumber
  );
}

function emptyDecider(draw: DrawDefinition, main: Structure, final: MatchUp) {
  const playoff = draw.structures?.find((s) => s.stage === PLAY_OFF);
  const deciders = matchUpsOf(playoff);
  const positions = positionAssignmentsOf(playoff);
  const decider = deciders?.[0];
  return (
    draw.structures?.length === 3 &&
    playoff &&
    deciders?.length === 1 &&
    decider &&
    decider.matchUpId === final.winnerMatchUpId &&
    !decider.winningSide &&
    decider.matchUpStatus === TO_BE_PLAYED &&
    !decider.winnerMatchUpId &&
    !decider.loserMatchUpId &&
    positions?.length === 2 &&
    positions.every((a) => !a.participantId && !a.bye && !a.qualifier) &&
    feeds(draw, WINNER, main, final, playoff, decider) &&
    feeds(draw, LOSER, main, final, playoff, decider)
  );
}

/** The only occupied main positions belong to the source dual. The other backdraw seat is a structural BYE. */
function hasFeedingSeats(main: Structure, dual: MatchUp, back: Structure, feeder: MatchUp, final: MatchUp) {
  const occupied = positionAssignmentsOf(main)?.filter((a) => a.participantId);
  if (
    occupied?.length !== 2 ||
    dual.drawPositions?.length !== 2 ||
    new Set(occupied.map((a) => a.participantId)).size !== 2 ||
    !occupied.every((a) => dual.drawPositions!.includes(a.drawPosition) && !a.bye && !a.qualifier)
  )
    return false;
  if (feeder.drawPositions?.length !== 2 || new Set(feeder.drawPositions).size !== 2) return false;
  const seats = feeder.drawPositions.map((p) => positionAssignmentsOf(back)?.find((a) => a.drawPosition === p));
  if (!seats[0] || !seats[1] || seats.filter((a) => a?.bye && !a.participantId && !a.byeFromPropagation).length !== 1)
    return false;
  const landing = seats.find((a) => !a?.bye);
  if (!landing || landing.qualifier) return false;
  if (!dual.winningSide) return !landing.participantId && !final.drawPositions?.length;
  const winningPosition = getSideDrawPosition({ matchUp: dual, sideNumber: dual.winningSide });
  return (
    !!winningPosition &&
    occupied.some((a) => a.drawPosition === winningPosition) &&
    !!landing.participantId &&
    occupied.some((a) => a.drawPosition !== winningPosition && a.participantId === landing.participantId) &&
    final.drawPositions?.length === 2 &&
    occupied.every((a) => final.drawPositions!.includes(a.drawPosition))
  );
}

/** A two-team main dual whose loser passes a held structural BYE into the winner's own next dual. */
function lineCircuit(args: PlanArgs, why: 'team' | 'cascade'): Circuit | undefined {
  const { view, request, drawDefinition } = args;
  const line = view.line;
  if (
    !drawDefinition ||
    view.drawType !== DOUBLE_ELIMINATION ||
    !line ||
    args.clockFree ||
    args.route !== 'winner' ||
    !request.winningSide ||
    args.write?.matchUpStatus !== COMPLETED ||
    !view.draw.storesEdges ||
    view.draw.perMatchUpCompetition ||
    line.dualRewrite.scoreReported ||
    line.talliedByScore ||
    line.autoCalcDisabled ||
    !bareResultRequest({ ...request, score: undefined }) ||
    request.flags.disableAutoCalc ||
    request.flags.enableAutoCalc ||
    !request.matchUpId
  )
    return;
  const structures = drawDefinition.structures ?? [];
  const main = structures.find((s) => s.stage === MAIN);
  const back = structures.find((s) => s.stage === CONSOLATION);
  const dual = matchUpsOf(main)?.find((m) => m.matchUpId === line.dualMatchUpId);
  const source = dual?.tieMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (
    !main ||
    !back ||
    !dual ||
    source?.matchUpStatus !== TO_BE_PLAYED ||
    source.winningSide ||
    source.score?.sets?.length ||
    source.orderOfFinish ||
    source.schedule?.scoredTime
  )
    return;
  const lines = (dual.tieMatchUps ?? []).map<MatchUp>((m) =>
    m === source ? { ...m, matchUpStatus: COMPLETED, score: request.score } : m,
  );
  if (finishingOrderUpdates({ lines, previous: source }).some((update) => update.matchUpId !== source.matchUpId))
    return;
  const final = matchUpsOf(main)?.find((m) => m.matchUpId === dual.winnerMatchUpId);
  const feeder = matchUpsOf(back)?.find((m) => m.matchUpId === dual.loserMatchUpId);
  if (
    !final ||
    !feeder ||
    feeder.winnerMatchUpId !== final.matchUpId ||
    feeder.matchUpStatus !== BYE ||
    final.matchUpStatus !== TO_BE_PLAYED ||
    final.winningSide ||
    final.score?.sets?.length ||
    !final.winnerMatchUpId ||
    final.loserMatchUpId !== final.winnerMatchUpId ||
    !feeds(drawDefinition, LOSER, main, dual, back, feeder) ||
    !feeds(drawDefinition, WINNER, back, feeder, main, final) ||
    !emptyDecider(drawDefinition, main, final) ||
    !hasFeedingSeats(main, dual, back, feeder, final)
  )
    return;
  if (
    structures.some(
      (s) =>
        structuresOf(s)?.length ||
        matchUpsOf(s)?.some(
          (m) =>
            !!m.sideExitProvenance ||
            hasStaleScoredTime(m) ||
            m.tieMatchUps?.some(hasStaleScoredTime) ||
            (m !== final &&
              m !== feeder &&
              m !== dual &&
              m.matchUpId !== final.winnerMatchUpId &&
              m.matchUpStatus !== BYE),
        ),
    )
  )
    return;
  const base = { dualId: dual.matchUpId, lineId: source.matchUpId, mainId: main.structureId };
  if (
    why === 'team' &&
    line.keepsDualDecision &&
    !args.dual &&
    dual.matchUpStatus === COMPLETED &&
    dual.winningSide === request.winningSide &&
    !dual.score &&
    !line.relabelsDualExit
  )
    return base;
  const targets = args.dual?.view.targets;
  if (
    why !== 'cascade' ||
    dual.matchUpStatus !== IN_PROGRESS ||
    dual.winningSide ||
    args.dual?.route !== 'winner' ||
    line.projectedWinningSide !== request.winningSide ||
    !targets?.loserTargetSeat?.free ||
    !targets.loserTargetSeat.opponentBye ||
    !targets.loserLink ||
    targets.loserLink.linkCondition ||
    targets.winnerLink ||
    targets.byeTarget ||
    targets.seededParticipantIds?.length ||
    targets.winnerMatchUpId !== final.matchUpId ||
    targets.loserMatchUpId !== feeder.matchUpId ||
    final.drawPositions?.length ||
    feeder.winningSide ||
    !line.projectedScore
  )
    return;
  return { ...base, winnerId: final.matchUpId, loserId: feeder.matchUpId, backId: back.structureId };
}

/**
 * A provider may change a separately held record when asked for the clock or stamp ledger.
 * Capture ordinary data before the view reads it, then verify values AND references at the
 * recorder's clone boundary. Unusual fields remain with the existing writer.
 */
export function watchTeamLineInputs(args: BuildViewArgs): (() => boolean) | undefined {
  if (args.drawDefinition?.drawType !== DOUBLE_ELIMINATION || !args.recordDraws || !args.request.winningSide) return;
  const main = args.drawDefinition.structures?.find((s) => s.stage === MAIN);
  if (positionAssignmentsOf(main)?.filter((a) => a.participantId).length !== 2) return;
  const dual = matchUpsOf(main)?.find((m) =>
    m.tieMatchUps?.some((line) => line.matchUpId === args.request.matchUpId && line.matchUpStatus === TO_BE_PLAYED),
  );
  if (!dual || (dual.matchUpStatus !== COMPLETED && dual.matchUpStatus !== IN_PROGRESS)) return;

  const fields: { node: object; keys: string[]; values: unknown[] }[] = [];
  const seen = new Set<object>();
  const active = new Set<object>();
  function visit(value: unknown): boolean {
    if (typeof value === 'function' || typeof value === 'bigint') return false;
    if (value === null || typeof value !== 'object') return true;
    if (active.has(value)) return false;
    if (seen.has(value)) return true;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return false;
    active.add(value);
    const keys = Object.getOwnPropertyNames(value);
    const values: unknown[] = [];
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !('value' in field) || !visit(field.value)) return false;
      values.push(field.value);
    }
    active.delete(value);
    seen.add(value);
    fields.push({ node: value, keys, values });
    return true;
  }
  if (
    ![
      args.request,
      args.drawDefinition,
      args.event,
      args.tournamentRecord,
      args.tournamentRecords,
      args.policyDefinitions,
    ].every(visit)
  )
    return;
  return () =>
    fields.every(({ node, keys, values }) => {
      const current = Object.getOwnPropertyNames(node);
      return (
        keys.length === current.length &&
        keys.every((key, index) => {
          const field = Object.getOwnPropertyDescriptor(node, key);
          return current[index] === key && field && 'value' in field && Object.is(field.value, values[index]);
        })
      );
    });
}

function playPhases(
  copy: RecordCopy,
  plan: PlanArgs,
  ids: Circuit,
  matchUpsMap: ReturnType<typeof getMatchUpsMap>,
  byId: Map<string, MatchUp>,
) {
  const { drawDefinition, tournamentRecord, event } = copy;
  const source = byId.get(ids.lineId)!;
  const dual = byId.get(ids.dualId)!;
  const main = drawDefinition.structures!.find((s) => s.structureId === ids.mainId)!;
  const common = { drawDefinition, tournamentRecord, event };
  const { request, view } = plan;
  const winningSide = request.winningSide!;
  const inContextDrawMatchUps = ids.winnerId
    ? getAllDrawMatchUps({ ...common, matchUpsMap, inContext: true }).matchUps
    : undefined;
  const targetData =
    inContextDrawMatchUps && positionTargets({ drawDefinition, inContextDrawMatchUps, matchUpId: ids.dualId });
  const scored = modifyMatchUpScore({
    ...common,
    matchUp: source,
    matchUpId: ids.lineId,
    matchUpStatus: COMPLETED,
    matchUpStatusCodes: [],
    winningSide,
    score: request.score,
    context: 'attemptToModifyScore',
  });
  if (scored.error) return;
  ensureSideLineUps({
    ...common,
    dualMatchUp: dual,
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
  });
  const score = ids.winnerId ? (cloneData(view.line!.projectedScore) as Score) : dual.score;
  const tieMatchUpResult = ids.winnerId
    ? { success: true, score, removeWinningSide: false, tieFormatRemoved: undefined, winningSide }
    : { success: true, score };
  if (ids.winnerId) {
    dual.tieFormat = copyTieFormat(resolveTieFormat({ ...common, structure: main, matchUp: dual })?.tieFormat);
    const tallied = modifyMatchUpScore({
      ...common,
      matchUp: dual,
      matchUpId: ids.dualId,
      matchUpStatus: COMPLETED,
      winningSide,
      score,
      removeWinningSide: false,
      context: 'updateTieMatchUpScore',
    });
    if (tallied.error) return;
    const placed = directScoredParticipants(
      {
        ...common,
        matchUp: source,
        matchUpId: ids.lineId,
        matchUpsMap,
        dualMatchUp: dual,
        inContextDrawMatchUps,
        targetData,
        structure: main,
        projectedWinningSide: winningSide,
        winningSide,
        matchUpStatus: COMPLETED,
        ...request.flags,
      },
      dual.drawPositions,
      { tieMatchUpResult },
      'directParticipants',
    );
    if (placed.error) return;
  }
  if (scoredTimeAction(source) === 'initialize') {
    source.schedule ??= {};
    source.schedule.scoredTime = nowIso({ kind: 'scoredTime', target: source });
  }
  return {
    success: true,
    tieMatchUpResult,
    stack: ['directParticipants', 'attemptToSetWinningSide', 'noDownStreamDependencies', 'setMatchUpStatus'],
    context: {},
  };
}

/**
 * The provider sees the line write and (if it decides the dual) the two placements on a detached
 * draw, then its retained notices on storage. The write targets are fixed by the links before
 * the first phase. Mirror those targets together to preserve references across line-ups and scores.
 */
export function teamFinalLine(
  args: BuildViewArgs,
  plan: PlanArgs,
  why: 'team' | 'cascade',
  sample: () => Set<string> | undefined,
): OutcomePlan | undefined {
  if (
    !args.drawDefinition ||
    !args.recordDraws ||
    !args.finishTeamLine ||
    !args.tournamentRecord ||
    !args.tournamentRecords
  )
    return;
  if (plan.clockFree || !(plan.view.line?.keepsDualDecision || plan.dual?.route === 'winner')) return;
  const named = Object.keys(args.tournamentRecords);
  if (named.length > 1 || (named.length && named[0] !== args.tournamentRecord.tournamentId)) return;
  const ids = lineCircuit(plan, why);
  if (!ids) return;
  const stamped = sample();
  if (!stamped) return;
  const requested = JSON.stringify(args.request);
  const kept = cloneState(args.request);
  const { copy, originals } = cloneState({
    tournamentRecord: args.tournamentRecord,
    event: args.event,
    drawDefinition: args.drawDefinition,
  });
  stampCopies(copy.drawDefinition, stamped);
  const program = withNoticeMarks((marks): OutcomePlan =>
    withDraftWrites(() => {
      const prior = new Set(getNoticeBuffer() ?? []);
      const recording = new Recording(copy.drawDefinition);
      // An event or tournament may also retain a direct reference to an object inside the draw.
      // A write visible through that reference is outside the program, just as on the whole recorder.
      const outside = () =>
        JSON.stringify({ tournamentRecord: copy.tournamentRecord, event: copy.event }, (_key, v) =>
          v === copy.drawDefinition ? 0 : v,
        );
      const startingOutside = outside();
      const draw = copy.drawDefinition;
      const matchUpsMap = getMatchUpsMap({ drawDefinition: draw });
      const writtenIds = new Set([ids.dualId, ids.lineId, ids.winnerId, ids.loserId]);
      const byId = new Map(
        matchUpsMap.drawMatchUps.filter((m) => writtenIds.has(m.matchUpId)).map((m) => [m.matchUpId, m]),
      );
      const structures = draw.structures!.filter((s) => s.structureId === ids.mainId || s.structureId === ids.backId);
      // A pre-stamped parent can remain untouched. Mirroring it anyway would overwrite an
      // independent live edit made between the detached enqueue and application.
      const changed = new Map<object, () => boolean>();
      for (const entity of byId.values()) changed.set(entity, changedOwnState(entity, MATCHUP_CHILDREN));
      for (const entity of structures) changed.set(entity, changedOwnState(entity, STRUCTURE_CHILDREN));
      changed.set(draw, changedOwnState(draw, DRAW_CHILDREN));
      let result: ReturnType<NonNullable<BuildViewArgs['finishTeamLine']>> | undefined;
      try {
        result = args.recordDraws!(() => {
          const written = playPhases(copy, plan, ids, matchUpsMap, byId);
          return written && args.finishTeamLine!(copy, matchUpsMap, written);
        });
      } catch {
        return { abstain: why };
      }
      if (!result || outside() !== startingOutside) return { abstain: why };
      const ops: OutcomeOp[] = [];
      const own = (entity: object, skip: string[]) => cloneData(ownState(entity, skip));
      const add = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
        if (!changed.get(entity)!()) return;
        recording.source(recordedName(op), entity);
        ops.push(op);
      };
      for (const [matchUpId, entity] of byId) {
        add({ op: 'replaceMatchUp', matchUpId, matchUp: own(entity, MATCHUP_CHILDREN) as MatchUp, recording }, entity);
      }
      for (const entity of structures) {
        add(
          {
            op: 'replaceStructureState',
            structureId: entity.structureId,
            state: own(entity, STRUCTURE_CHILDREN),
            recording,
          },
          entity,
        );
      }
      add({ op: 'replaceDrawState', drawId: draw.drawId, state: own(draw, DRAW_CHILDREN), recording }, draw);
      const announce = pendingAnnouncement(prior, marks());
      if (!announce || !returnedOnStored(result, originals, draw)) return { abstain: why };
      ops.push(announce);
      return { ops, shape: 'local', phaseResult: result };
    }),
  );
  if (JSON.stringify(args.request) === requested) return program;
  restoreState(kept);
  return { abstain: why };
}
