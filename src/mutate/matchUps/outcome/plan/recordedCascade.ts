import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { settleAfterWrite } from '@Mutate/matchUps/matchUpStatus/settleAfterWrite';
import { getDeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { isDoubleExit } from '@Validators/isExit';
import { doubleExitAdvancement } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { cloneState } from '@Tools/cloneState';
import { readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { applyOutcomeOps, stampedInThisCall } from '../ops';
import { isObject } from '@Tools/objects';
import { Recording } from '../recording';

// constants and types
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  POLICY_TYPE_PROGRESSION,
  POLICY_TYPE_ROUND_ROBIN_TALLY,
  POLICY_TYPE_SCORING,
} from '@Constants/policyConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { BuildViewArgs } from '../types';
import type { OutcomeOp } from '../ops';

/**
 * RECORDED (CA, 2026-11-16, option 2): a double exit's cascade the planners do not write shape by shape is read off the
 * double-exit module itself. The call's own write (`prefix`) is folded into a COPY of the record, the module runs on that
 * copy as `attemptToSetMatchUpStatus` runs it after `scoreModification`, and what it changed is returned as ops: each
 * matchUp it wrote, each structure's and the draw's own fields, and the notices it buffered. Nothing here touches the
 * stored record or the engine's notice state. Undefined where the module refuses, or writes outside the draw.
 */
export type RecordCascade = (prefix: OutcomeOp[]) => OutcomeOp[] | undefined;

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
  stampCopies(drawDefinition, stampedBefore);
  return withNoticeMarks((readMarks) =>
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
        const before = { ...readBefore(drawDefinition), outside: outside() };
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
        return recordedOps({ drawDefinition, recording, before, marks: readMarks() });
      }),
    ),
  );
}
