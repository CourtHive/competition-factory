import { captureOperation, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { deleteNotices, getFactoryBackend, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { seedCall } from '@Assemblies/engines/parts/seedRandomParam';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { isFunction, isObject, isString } from '@Tools/objects';
import { withCallRandomSource } from '@Tools/prng';
import { withCapturedClock } from '@Tools/clock';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

export function engineInvoke(engine: { [key: string]: any }, args: any) {
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

  // nonRandom: <seed> middleware, applied to `params` (not `args`) so it stays clear of the
  // function-count guard above, which is load-bearing for method dispatch. The seed also determines the
  // draws it does not reach through `random`: see seedCall and tools/prng.ts withCallRandomSource
  const unthreadedSource = seedCall(params);

  const method = passedMethod || engine[methodName] || getMethods()[methodName];
  if (!method) return logMethodNotFound({ methodName, params });

  // one instant for the whole call, captured before anything is written; see tools/clock.ts
  return withCapturedClock((timeStamp) => {
    const capture = params.rollbackOnError ? captureOperation() : undefined;
    if (capture?.error) return { error: capture.error };
    const captured = capture?.captured;

    let result: ReturnType<typeof executeFunction>;
    try {
      // the method itself, or a second implementation of it when a test harness set one (globalState
      // setFactoryBackend); either way this shell stamps, notifies and rolls back around it
      const runLocal = () => executeFunction(engine, method, params, methodName, 'sync');
      const backend = getFactoryBackend();
      result =
        withCallRandomSource(unthreadedSource, () =>
          backend?.implements(methodName)
            ? (backend.invoke({ methodName, params, timeStamp, runLocal }) as ReturnType<typeof runLocal>)
            : runLocal(),
        ) ?? {};
    } catch (err) {
      // thrown only under devContext (otherwise executeFunction catches): restore, then surface it
      if (captured) restoreOperation(captured);
      throw err;
    }

    if (result?.error && captured) {
      // records, selection, notices and the mutation flag all return to what they were: the
      // record is not stamped, and nothing the refused write buffered is delivered
      restoreOperation(captured);
      getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'sync', params, result });
      return result;
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension

    const notify = result?.success && params?.delayNotify !== true && params?.doNotNotify !== true;
    if (notify)
      notifySubscribers({
        directives: [{ method, params }],
        mutationStatus,
        timeStamp,
      });
    if (notify || !result?.success || params?.doNotNotify) deleteNotices();

    getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'sync', params, result });

    return result;
  });
}
