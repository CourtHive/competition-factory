import { deleteNotices, getDevContext, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { captureOperation, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { caughtErrorResult, executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { seedCall } from '@Assemblies/engines/parts/seedRandomParam';
import { isFunction, isObject, isString } from '@Tools/objects';
import { withCallRandomSourceAsync } from '@Tools/prng';
import { withCapturedClockAsync } from '@Tools/clock';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

export async function asyncEngineInvoke(engine: { [key: string]: any }, args: any) {
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

  const { [methodName]: passedMethod, ...remainingArgs } = args;
  const params = args?.params ? { ...args.params } : { ...remainingArgs };

  // nonRandom: <seed> middleware; see engineInvoke.ts
  const unthreadedSource = seedCall(params);

  const method = passedMethod || engine[methodName] || getMethods()[methodName];
  if (!method) return logMethodNotFound({ methodName, params });

  // one instant for the whole call, captured before anything is written; see tools/clock.ts
  return withCapturedClockAsync(async (timeStamp) => {
    const capture = params.rollbackOnError ? captureOperation() : undefined;
    if (capture?.error) return { error: capture.error };
    const captured = capture?.captured;

    let result: ReturnType<typeof executeFunction>;
    try {
      result =
        (await withCallRandomSourceAsync(unthreadedSource, async () =>
          executeFunction(engine, method, params, methodName, 'async'),
        )) ?? {};
    } catch (err) {
      // executeFunction catches a SYNC throw outside devContext, but an async method's rejection arrives after it has
      // returned. Restore, then answer as the sync engine does: rethrow under devContext, otherwise the
      // caught-error envelope
      if (captured) restoreOperation(captured);
      if (getDevContext()) throw err;
      return caughtErrorResult({ methodName, params, err });
    }

    if (result?.error && captured) {
      // records, selection, notices and the mutation flag all return to what they were: the
      // record is not stamped, and nothing the refused write buffered is delivered
      restoreOperation(captured);
      getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });
      return result;
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension

    const notify = result?.success && params?.delayNotify !== true && params?.doNotNotify !== true;

    if (notify)
      await notifySubscribersAsync({
        directives: [{ method, params }],
        mutationStatus,
        timeStamp,
      });
    if (notify || !result?.success || params?.doNotNotify) deleteNotices();

    getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });

    return result;
  });
}
