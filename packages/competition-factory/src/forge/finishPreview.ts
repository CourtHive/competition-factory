import { getDevContext, getNotices, getTournamentRecords, globalLog } from '@Global/state/globalState';
import { generatePatch } from '@Tools/jsonPatch';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import type { DryRunResult, EmittedNotice } from './dryRun';
import type { ResultType } from '@Types/factoryTypes';
import type { PrivateState } from './previewState';

export type QueueOutcome = { results: any[]; success?: boolean; refusal?: ResultType; error?: DryRunResult['error'] };

/** Hydrate deferred payloads while the private provider still owns the working records. */
export function finishPreview(
  state: PrivateState,
  { results, error }: QueueOutcome,
  awaitMethods: boolean,
  snapshotStart: number,
  executeStart: number,
  delivered: EmittedNotice[] = [],
): DryRunResult {
  const diffStart = Date.now();
  const patch = generatePatch(state.before, getTournamentRecords()).map((op) =>
    'value' in op ? { ...op, value: makeDeepCopy(op.value, false, true) } : op,
  );
  const willEmitNotices = [...delivered];
  for (const topic of state.topics) {
    const payloads = getNotices({ topic });
    if (payloads?.length) willEmitNotices.push({ topic, payloads });
  }
  if (typeof getDevContext() === 'object') {
    const diff = Date.now() - diffStart;
    globalLog(
      {
        dryRun: true,
        methods: results.length,
        patchOps: patch.length,
        elapsed: Date.now() - snapshotStart,
        overhead: { snapshot: executeStart - snapshotStart, diff, restore: 0 },
        execute: diffStart - executeStart,
      },
      awaitMethods ? 'async' : 'sync',
    );
  }
  return { wouldSucceed: !error, results, patch, willEmitNotices, ...(error ? { error } : {}), rolledBack: true };
}
