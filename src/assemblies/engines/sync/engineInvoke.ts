import { deleteNotices, getTournamentRecords } from '@Global/state/globalState';
import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { setState } from '@Assemblies/engines/parts/stateMethods';
import { isFunction, isObject, isString } from '@Tools/objects';
import { getMethods } from '@Global/state/syncGlobalState';
import { createSeededRandom } from '@Tools/prng';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

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

  // nonRandom: <seed> middleware. Mirrors mocksEngine's
  // src/assemblies/engines/mock/index.ts:55-57 — transforms a numeric seed into
  // a seeded `random` function so callers can make stochastic mutations
  // deterministic without hand-patching Math.random around the call site. Done
  // on `params` (not `args`) so we stay clear of the function-count guard
  // above, which is load-bearing for method dispatch.
  if (typeof params.nonRandom === 'number') {
    params.random = createSeededRandom(params.nonRandom);
    delete params.nonRandom;
  }

  const snapshot = params.rollbackOnError && makeDeepCopy(getTournamentRecords(), false, true);

  const method = passedMethod || engine[methodName] || getMethods()[methodName];
  if (!method) return logMethodNotFound({ methodName, params });

  const result = executeFunction(engine, method, params, methodName, 'sync') ?? {};

  if (result?.error && snapshot) setState(snapshot);

  const timeStamp = Date.now();
  const mutationStatus = getMutationStatus({ timeStamp });

  const notify = result?.success && params?.delayNotify !== true && params?.doNotNotify !== true;
  if (notify)
    notifySubscribers({
      directives: [{ method, params }],
      mutationStatus,
      timeStamp,
    });
  if (notify || !result?.success || params?.doNotNotify) deleteNotices();

  return result;
}
