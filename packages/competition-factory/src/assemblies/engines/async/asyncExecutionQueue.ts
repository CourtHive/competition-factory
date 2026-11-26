import { deleteNotices, getDevContext, getInvokeObserver } from '@Global/state/globalState';
import { engineBoundaryObservers } from '@Assemblies/engines/parts/boundaryObservers';
import { ownMethod } from '@Tools/ownMethod';
import { caughtErrorResult, executeFunction, isThrownResult } from '@Assemblies/engines/parts/executeMethod';
import { captureRollback, queueCannotPartlyCommit } from '@Assemblies/engines/parts/rollbackSnapshot';
import { restoreOperation } from '@Assemblies/engines/parts/operationState';
import { rolledBackResult } from '@Assemblies/engines/parts/rolledBack';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { getQueueMethods } from '@Assemblies/engines/parts/engineMethodRegistry';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { withCallRandomSourceAsync } from '@Tools/prng';
import { withCapturedClockAsync } from '@Tools/clock';

// constants and types
import { Directives, FactoryEngine } from '@Types/factoryTypes';
import { PARTIAL_COMMIT } from '@Constants/resultConstants';

let asyncQueueReentry = false;

export async function asyncExecutionQueue(engine: FactoryEngine, directives: Directives, rollbackOnError?: boolean) {
  const observe = engineBoundaryObservers.asyncQueue;
  if (observe) {
    // an installed observer (a test harness) is handed the call; it re-enters once, past this check
    if (!asyncQueueReentry)
      return observe(directives, rollbackOnError, (): unknown => {
        asyncQueueReentry = true;
        return asyncExecutionQueue(engine, directives, rollbackOnError);
      }) as never;
    asyncQueueReentry = false;
  }
  const methods = getQueueMethods(engine, directives);
  const start = Date.now();

  // every directive is checked before any runs: a refusal here has written nothing
  const invalid = validateDirectives(directives, methods, start);
  if (invalid) return invalid;

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClockAsync(async (timeStamp) => {
    // a queue of one directive that cannot partly commit takes no snapshot of the records (rollbackSnapshot.ts)
    const capture = rollbackOnError ? captureRollback(queueCannotPartlyCommit(directives, methods)) : undefined;
    if (capture?.error) return { error: capture.error, rolledBack: false };
    const captured = capture?.captured;
    const snapshot = captured && !captured.atomic ? captured : undefined;

    const results: any[] = [];
    let refusal: ReturnType<typeof executeFunction> | undefined;
    // the directive running when a method throws, for the caught-error envelope
    let current: { methodName: string; params?: Record<string, any> } | undefined;
    try {
      for (const directive of directives) {
        const methodName = directive.method;
        const { params, unthreadedSource } = prepareDirective(directive, results);
        current = { methodName, params };

        // awaited, as asyncEngineInvoke awaits it: an imported async method returns a promise
        const result = await withCallRandomSourceAsync(unthreadedSource, async () =>
          executeFunction(engine, ownMethod(methods, methodName), params, methodName, 'async'),
        );
        getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });

        if (result?.error) {
          refusal = result;
          break;
        }
        results.push({ ...result, methodName });
      }
    } catch (err) {
      // executeFunction catches a SYNC throw outside devContext, but an async method's rejection arrives after it has
      // returned. Restore a snapshot, then answer as the sync engine does: rethrow under devContext, otherwise the
      // caught-error envelope, marked rolledBack like any other refusal. Without a snapshot the writes stay
      if (snapshot) restoreOperation(snapshot);
      else keepWrites(timeStamp);
      if (getDevContext()) throw err;
      const caught = caughtErrorResult({ methodName: current?.methodName ?? '', params: current?.params, err });
      return snapshot ? rolledBackResult(caught) : { ...caught, rolledBack: false, results };
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
        await notifySubscribersAsync({ directives: directives.slice(0, ran), mutationStatus, timeStamp });
        deleteNotices();
      } else keepWrites(timeStamp);
      // a refused bulk directive is listed, last, with its whole result: its per-item results among it
      const listed = Array.isArray(refusal.results)
        ? [...results, { ...refusal, methodName: directives[results.length].method }]
        : results;
      return { ...refusal, rolledBack: false, results: listed };
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension
    await notifySubscribersAsync({ directives, mutationStatus, timeStamp });
    deleteNotices();

    const success = results.every((r) => r.success);

    return { success, results };
  });
}
