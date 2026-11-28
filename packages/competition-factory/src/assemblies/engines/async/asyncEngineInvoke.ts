import { deleteNotices, getDevContext, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { engineBoundaryObservers } from '@Assemblies/engines/parts/boundaryObservers';
import { ownMethod } from '@Tools/ownMethod';
import { caughtErrorResult, executeFunction, isThrownResult } from '@Assemblies/engines/parts/executeMethod';
import { cannotPartlyCommit, captureRollback } from '@Assemblies/engines/parts/rollbackSnapshot';
import { restoreOperation } from '@Assemblies/engines/parts/operationState';
import { rolledBackResult } from '@Assemblies/engines/parts/rolledBack';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { isPartialCommit } from '@Assemblies/engines/parts/partialCommit';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { seedCall } from '@Assemblies/engines/parts/seedRandomParam';
import { isFunction, isObject, isString } from '@Tools/objects';
import { withCallRandomSourceAsync } from '@Tools/prng';
import { withCapturedClockAsync } from '@Tools/clock';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

let asyncInvokeReentry = false;

export async function asyncEngineInvoke(engine: { [key: string]: any }, args: any) {
  const observe = engineBoundaryObservers.asyncInvoke;
  if (observe) {
    // an installed observer (a test harness) is handed the call; it re-enters once, past this check
    if (!asyncInvokeReentry)
      return observe(args, (): unknown => {
        asyncInvokeReentry = true;
        return asyncEngineInvoke(engine, args);
      }) as never;
    asyncInvokeReentry = false;
  }
  if (!isObject(args)) return { error: INVALID_VALUES, message: 'args must be an object' };
  const methodsCount = Object.values(args).filter(isFunction).length;
  if (methodsCount > 1)
    return {
      message: 'there must be only one arg with typeof function',
      error: INVALID_VALUES,
    };

  const methodName = methodsCount
    ? Object.keys(args).find((key) => isFunction(args[key]))
    : isString(args.method) && args.method;
  if (!methodName) return { error: METHOD_NOT_FOUND };

  const { [methodName]: _passedMethod, ...remainingArgs } = args; // kept out of params; resolved below
  const params = args?.params ? { ...args.params } : { ...remainingArgs };

  // nonRandom: <seed> middleware; see engineInvoke.ts
  const unthreadedSource = seedCall(params);

  // a destructured passedMethod also reads inherited names (args.constructor is Object), so only an own one counts
  const method = ownMethod(args, methodName) ?? ownMethod(engine, methodName) ?? ownMethod(getMethods(), methodName);
  if (!method) return logMethodNotFound({ methodName, params });

  // one instant for the whole call, captured before anything is written; see tools/clock.ts
  return withCapturedClockAsync(async (timeStamp) => {
    // a call that cannot partly commit takes no snapshot of the records (rollbackSnapshot.ts)
    const capture = params.rollbackOnError ? captureRollback(cannotPartlyCommit(methodName, method)) : undefined;
    if (capture?.error) return { error: capture.error };
    const captured = capture?.captured;
    const snapshot = captured && !captured.atomic ? captured : undefined;

    let result: ReturnType<typeof executeFunction>;
    try {
      result = await withCallRandomSourceAsync(unthreadedSource, async () =>
        executeFunction(engine, method, params, methodName, 'async'),
      );
    } catch (err) {
      // executeFunction catches a SYNC throw outside devContext, but an async method's rejection arrives after it has
      // returned. Restore a snapshot, then answer as the sync engine does: rethrow under devContext, otherwise the
      // caught-error envelope. Without a snapshot the rejected method's writes stay, and the envelope says so
      if (snapshot) restoreOperation(snapshot);
      if (getDevContext()) throw err;
      const caught = caughtErrorResult({ methodName, params, err });
      if (snapshot) return rolledBackResult(caught);
      return captured ? { ...caught, rolledBack: false } : caught;
    }

    // without a snapshot, only a refusal is known to have written nothing: a method that threw may have
    if (result?.error && captured && !(captured.atomic && isThrownResult(result))) {
      // records, selection, notices and the mutation flag all return to what they were: the
      // record is not stamped, and nothing the refused write buffered is delivered
      restoreOperation(captured);
      getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });
      return rolledBackResult(result);
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension

    // a bulk call that committed some items before refusing one announces what it committed
    const committed = result?.success || isPartialCommit(result);
    const notify = committed && params?.delayNotify !== true && params?.doNotNotify !== true;

    if (notify)
      await notifySubscribersAsync({
        directives: [{ method, params }],
        mutationStatus,
        timeStamp,
      });
    if (notify || !committed || params?.doNotNotify) deleteNotices();

    getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });

    // a requested rollback that restored nothing says so
    return captured && result?.error ? { ...result, rolledBack: false } : result;
  });
}
