import { deleteNotices, getInvokeObserver, getMethods, getTournamentRecords } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { seedRandomParam } from '@Assemblies/engines/parts/seedRandomParam';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { setState } from '@Assemblies/engines/parts/stateMethods';
import { withCapturedClockAsync } from '@Tools/clock';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Directives, FactoryEngine } from '@Types/factoryTypes';

export async function asyncExecutionQueue(engine: FactoryEngine, directives: Directives, rollbackOnError?: boolean) {
  if (!Array.isArray(directives)) return { error: INVALID_VALUES, message: 'directives must be an array' };

  const methods = getMethods();
  const start = Date.now();

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClockAsync(async (timeStamp) => {
    const snapshot = rollbackOnError && makeDeepCopy(getTournamentRecords(), false, true);

    const results: any[] = [];
    for (const directive of directives) {
      if (typeof directive !== 'object') return { error: INVALID_VALUES, message: 'directive must be an object' };

      const { method: methodName, pipe } = directive;
      const params = directive.params ? { ...directive.params } : {};
      if (!methods[methodName]) return logMethodNotFound({ methodName, start, params });

      seedRandomParam(params); // nonRandom: <seed> middleware

      if (pipe) {
        const lastResult = results.at(-1);
        const pipeKeys = Object.keys(pipe);
        for (const pipeKey of pipeKeys) {
          if (lastResult[pipeKey]) params[pipeKey] = lastResult[pipeKey];
        }
      }

      const result = executeFunction(engine, methods[methodName], params, methodName, 'async');
      getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });

      if (result?.error) {
        if (snapshot) setState(snapshot);
        return { ...result, rolledBack: !!snapshot };
      }
      results.push({ ...result, methodName });
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension
    await notifySubscribersAsync({ directives, mutationStatus, timeStamp });
    deleteNotices();

    const success = results.every((r) => r.success);

    return { success, results };
  });
}
