import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { ownMethod } from '@Tools/ownMethod';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { isFunction, isObject, isString } from '@Tools/objects';
import { getMethods } from '@Global/state/syncGlobalState';
import { withCapturedClock } from '@Tools/clock';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

export function askInvoke(engine: { [key: string]: any }, args: any) {
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

  // a destructured passedMethod also reads inherited names (args.constructor is Object), so only an own one counts
  const method = ownMethod(args, methodName) ?? ownMethod(engine, methodName) ?? ownMethod(getMethods(), methodName);
  if (!method) return logMethodNotFound({ methodName, params });

  // a query reads "now" (durations, windows) at one instant too; see tools/clock.ts
  return withCapturedClock(() => executeFunction(engine, method, params, methodName, 'ask'));
}
