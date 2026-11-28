import { captureRollback, queueCannotPartlyCommit } from '@Assemblies/engines/parts/rollbackSnapshot';
import { executeFunction, isThrownResult } from '@Assemblies/engines/parts/executeMethod';
import { restoreOperation } from '@Assemblies/engines/parts/operationState';
import { rolledBackResult } from '@Assemblies/engines/parts/rolledBack';
import { engineBoundaryObservers } from '@Assemblies/engines/parts/boundaryObservers';
import { ownMethod } from '@Tools/ownMethod';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { getQueueMethods } from '@Assemblies/engines/parts/engineMethodRegistry';
import { deleteNotices, getInvokeObserver } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { withCallRandomSource } from '@Tools/prng';
import { withCapturedClock } from '@Tools/clock';

// constants and types
import { FactoryEngine } from '@Types/factoryTypes';
import type { Directives } from '@Assemblies/engines/types/engineTypes';
import { PARTIAL_COMMIT } from '@Constants/resultConstants';

let queueReentry = false;

export function executionQueue(engine: FactoryEngine, directives: Directives<string>, rollbackOnError?: boolean) {
  const observe = engineBoundaryObservers.queue;
  if (observe) {
    // an installed observer (a test harness) is handed the call; it re-enters once, past this check
    if (!queueReentry)
      return observe(directives, rollbackOnError, (): unknown => {
        queueReentry = true;
        return executionQueue(engine, directives, rollbackOnError);
      }) as never;
    queueReentry = false;
  }
  const methods = getQueueMethods(engine, directives);
  const start = Date.now();

  // every directive is checked before any runs: a refusal here has written nothing
  const invalid = validateDirectives(directives, methods, start);
  if (invalid) return invalid;

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClock((timeStamp) => {
    // a queue of one directive that cannot partly commit takes no snapshot of the records (rollbackSnapshot.ts)
    const capture = rollbackOnError ? captureRollback(queueCannotPartlyCommit(directives, methods)) : undefined;
    if (capture?.error) return { error: capture.error, rolledBack: false };
    const captured = capture?.captured;

    const results: any[] = [];
    let refusal: ReturnType<typeof executeFunction> | undefined;
    try {
      for (const directive of directives) {
        const methodName = directive.method;
        const { params, unthreadedSource } = prepareDirective(directive, results);

        const result = withCallRandomSource(unthreadedSource, () =>
          executeFunction(engine, ownMethod(methods, methodName), params, methodName, 'sync'),
        );
        getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'sync', params, result });

        if (result?.error) {
          refusal = result;
          break;
        }
        results.push({ ...result, methodName });
      }
    } catch (err) {
      // thrown only under devContext (otherwise executeFunction catches): restore a snapshot, then surface it
      if (captured && !captured.atomic) restoreOperation(captured);
      else keepWrites(timeStamp);
      throw err;
    }

    if (refusal) {
      // without a snapshot, only a refusal is known to have written nothing: a method that threw may have
      if (captured && !(captured.atomic && isThrownResult(refusal))) {
        restoreOperation(captured);
        return rolledBackResult(refusal);
      }
      // the writes before the refusal stay, and committed work announces itself: the directives that succeeded, and
      // a refusing directive that committed part of its work. A method that threw announces nothing
      const partly = refusal[PARTIAL_COMMIT] === true;
      const ran = results.length + (partly ? 1 : 0);
      if (ran && !isThrownResult(refusal)) {
        const mutationStatus = getMutationStatus({ timeStamp });
        notifySubscribers({ directives: directives.slice(0, ran), mutationStatus, timeStamp });
        deleteNotices();
      } else keepWrites(timeStamp);
      // a refused bulk directive is listed, last, with its whole result: its per-item results among it
      const listed = Array.isArray(refusal.results)
        ? [...results, { ...refusal, methodName: directives[results.length].method }]
        : results;
      return { ...refusal, rolledBack: false, results: listed };
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension
    notifySubscribers({ directives, mutationStatus, timeStamp });
    deleteNotices();

    const success = results.every((r) => r.success);

    return { success, results };
  });
}
