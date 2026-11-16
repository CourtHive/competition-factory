import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { settleAfterWrite } from '@Mutate/matchUps/matchUpStatus/settleAfterWrite';
import { getDeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { isDoubleExit } from '@Validators/isExit';
import { doubleExitAdvancement } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { DEFERRED_PAYLOAD, getCapturedStamps, getNoticeState, type Notice } from '@Global/state/globalState';
import { deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { getNoticeBuffer } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { cloneState } from '@Tools/cloneState';
import { isObject } from '@Tools/objects';
import {
  applyOutcomeOps,
  DRAW_CHILDREN,
  RECORDED_ENTITY,
  recordedName,
  STRUCTURE_CHILDREN,
  stampedInThisCall,
} from '../ops';
import { Recording } from '../recording';

// constants and types
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  POLICY_TYPE_PROGRESSION,
  POLICY_TYPE_ROUND_ROBIN_TALLY,
  POLICY_TYPE_SCORING,
} from '@Constants/policyConstants';
import type { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import type { BuildViewArgs } from '../types';
import type { OutcomeOp, RecordedNotice } from '../ops';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';

/**
 * RECORDED (CA, 2026-11-16, option 2): a double exit's cascade the planners do not write shape by shape is read off the
 * double-exit module itself. The call's own write (`prefix`) is folded into a COPY of the record, the module runs on that
 * copy as `attemptToSetMatchUpStatus` runs it after `scoreModification`, and what it changed is returned as ops: each
 * matchUp it wrote, each structure's and the draw's own fields, and the notices it buffered. Nothing here touches the
 * stored record or the engine's notice state. Undefined where the module refuses, or writes outside the draw.
 */
export type RecordCascade = (prefix: OutcomeOp[]) => OutcomeOp[] | undefined;

const own = (entity: object, children: string[]) =>
  Object.fromEntries(Object.entries(entity).filter(([key]) => !children.includes(key)));

function drawMatchUps(drawDefinition: DrawDefinition): MatchUp[] {
  const found: MatchUp[] = [];
  const visit = (structure: Structure) => {
    for (const matchUp of matchUpsOf(structure) ?? []) found.push(matchUp, ...(matchUp.tieMatchUps ?? []));
    for (const child of structuresOf(structure) ?? []) visit(child);
  };
  for (const structure of drawDefinition.structures ?? []) visit(structure);
  return found;
}

/**
 * `withDraftWrites` puts back the notice buffer and the modified flag; the provider's marks of WHICH tournaments and
 * topics the call modified are put back here, in their order. A copy's notices marked them before the call's own did.
 */
function withNoticeMarks<T>(fn: () => T): T {
  const marks = () => {
    const state = getNoticeState();
    return [state?.modifiedTournamentIds, state?.modifiedTopics];
  };
  const before = marks().map((set) => set && [...set]);
  try {
    return fn();
  } finally {
    marks().forEach((set, at) => {
      set?.clear();
      for (const value of before[at] ?? []) set?.add(value);
    });
  }
}

function recordedNotice({ topic, key, payload }: Notice): RecordedNotice | undefined {
  if (!key || !isObject(payload)) return undefined;
  const base = { topic, key, eventId: payload.eventId, context: payload.context };
  if (topic === UPDATE_INCONTEXT_MATCHUP) {
    const built = payload[DEFERRED_PAYLOAD];
    const outer = typeof built === 'function' ? deferredQueryBinding(built) : undefined;
    const bound = outer?.args as { inContextMatchUp?: object; tournamentId?: string } | undefined;
    const inner = bound?.inContextMatchUp && deferredQueryBinding(bound.inContextMatchUp);
    if (!bound || !inner) return undefined;
    const contextless = !(inner.args as { tournamentRecord?: unknown }).tournamentRecord;
    return {
      ...base,
      fields: { tournamentId: payload.tournamentId },
      deferred: { tournamentId: bound.tournamentId, contextless },
    };
  }
  const entity = RECORDED_ENTITY[topic];
  if (!entity) return undefined;
  return { ...base, fields: structuredClone({ ...payload, [entity]: null }) };
}

export function recordDoubleExitCascade(args: BuildViewArgs, prefix: OutcomeOp[]): OutcomeOp[] | undefined {
  const { request } = args;
  const matchUpId = request.matchUpId as string;
  if (!args.drawDefinition) return undefined;
  // a first entry only: a decided or exited matchUp made a double exit is removed first (`removeWinningSideAndSetDoubleExit`)
  const entered = args.matchUpsMap?.drawMatchUps.find((stored) => stored.matchUpId === matchUpId);
  if (!entered || entered.winningSide || (entered.matchUpStatus && entered.matchUpStatus !== TO_BE_PLAYED))
    return undefined;
  const stampedBefore = stampedInThisCall(args.drawDefinition);
  const { copy } = cloneState({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    event: args.event,
  });
  const { tournamentRecord, event } = copy;
  const drawDefinition = copy.drawDefinition as DrawDefinition;
  const outside = () =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  // the copies of what this engine call already stamped are stamped: the module's own notices stamp once per call
  const ledger = getCapturedStamps();
  if (ledger) {
    if (stampedBefore.has(`drawDefinition:${drawDefinition.drawId}`)) ledger.add(drawDefinition);
    for (const structure of drawDefinition.structures ?? [])
      if (stampedBefore.has(`structure:${structure.structureId}`)) ledger.add(structure);
    for (const matchUp of drawMatchUps(drawDefinition))
      if (stampedBefore.has(`matchUp:${matchUp.matchUpId}`)) ledger.add(matchUp);
  }
  return withNoticeMarks(() =>
    withDraftWrites(() =>
      withoutSettleTelemetry(() => {
        // v1 reads the draw before the call's own write (`setMatchUpState`), and the module is handed that reading
        const matchUpsMap = getMatchUpsMap({ drawDefinition });
        const inContextDrawMatchUps =
          getAllDrawMatchUps({ tournamentRecord, inContext: true, drawDefinition, matchUpsMap, event }).matchUps ?? [];
        const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
        const matchUp = matchUpsMap.drawMatchUps.find((stored) => stored.matchUpId === matchUpId);
        const { structure } = findStructure({ drawDefinition, structureId: inContextMatchUp?.structureId });
        const targetData = positionTargets({ matchUpId, inContextDrawMatchUps, drawDefinition });
        if (!inContextMatchUp || !matchUp || !structure || targetData.error) return undefined;
        const { appliedPolicies = {} } = getAppliedPolicies({
          policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING, POLICY_TYPE_ROUND_ROBIN_TALLY],
          tournamentRecord,
          drawDefinition,
          event,
        });
        if (isObject(args.policyDefinitions)) Object.assign(appliedPolicies, args.policyDefinitions);
        // read before the call's write, as `setMatchUpStatus` reads them for its settle passes
        const settleBefore = {
          doubleExitsBefore: new Set(
            matchUpsMap.drawMatchUps
              .filter((stored) => isDoubleExit(stored.matchUpStatus))
              .map((stored) => stored.matchUpId),
          ),
          deciderSnapshotBefore: getDeciderSnapshot(drawDefinition),
          finalsBefore: getDeciderFinals(drawDefinition),
        };
        if (applyOutcomeOps(drawDefinition, prefix, stampedBefore).error) return undefined;
        // where every object of the copy stands as the module is about to find it (`recording.ts`)
        const recording = new Recording(drawDefinition);
        const before = {
          matchUps: new Map(drawMatchUps(drawDefinition).map((stored) => [stored.matchUpId, JSON.stringify(stored)])),
          structures: new Map(
            (drawDefinition.structures ?? []).map((s) => [s.structureId, JSON.stringify(own(s, STRUCTURE_CHILDREN))]),
          ),
          draw: JSON.stringify(own(drawDefinition, DRAW_CHILDREN)),
          outside: outside(),
          notices: new Set(getNoticeBuffer() ?? []),
        };
        const result = doubleExitAdvancement({
          // the outcome as the call entered it, then its flags, as `attemptToSetMatchUpStatus` hands v1's parameters on
          ...request,
          flags: undefined,
          carries: undefined,
          ...request.flags,
          policyDefinitions: args.policyDefinitions,
          inContextDrawMatchUps,
          inContextMatchUp,
          appliedPolicies,
          tournamentRecord,
          drawDefinition,
          matchUpsMap,
          targetData,
          structure,
          matchUpId,
          matchUp,
          event,
        });
        if (result?.error) return undefined;
        // then everything v1 settles after the write, on the copy (`settleAfterWrite`: the one sequence both run)
        const settled = settleAfterWrite({
          params: { tournamentRecord, drawDefinition, matchUpId, event },
          propagateExitStatus: request.flags.propagateExitStatus,
          ...settleBefore,
          matchUpsMap,
        });
        if (settled.error || settled.exhausted || outside() !== before.outside) return undefined;
        const ops: OutcomeOp[] = [];
        const replace = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
          recording.source(recordedName(op), entity);
          ops.push(op);
        };
        for (const stored of drawMatchUps(drawDefinition))
          if (JSON.stringify(stored) !== before.matchUps.get(stored.matchUpId))
            replace(
              { op: 'replaceMatchUp', matchUpId: stored.matchUpId, matchUp: structuredClone(stored), recording },
              stored,
            );
        for (const s of drawDefinition.structures ?? []) {
          const state = own(s, STRUCTURE_CHILDREN);
          if (JSON.stringify(state) !== before.structures.get(s.structureId))
            replace(
              { op: 'replaceStructureState', structureId: s.structureId, state: structuredClone(state), recording },
              s,
            );
        }
        const state = own(drawDefinition, DRAW_CHILDREN);
        if (JSON.stringify(state) !== before.draw)
          replace(
            { op: 'replaceDrawState', drawId: drawDefinition.drawId, state: structuredClone(state), recording },
            drawDefinition,
          );
        const notices: RecordedNotice[] = [];
        for (const notice of getNoticeBuffer() ?? []) {
          if (before.notices.has(notice)) continue;
          const recorded = recordedNotice(notice);
          // a notice apply could not raise again on the stored record: the call stays v1's
          if (!recorded) return undefined;
          notices.push(recorded);
        }
        ops.push({ op: 'announceRecorded', notices });
        return ops;
      }),
    ),
  );
}
