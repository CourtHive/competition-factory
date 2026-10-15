import { captureOperation, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { deleteNotices, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { withCapturedClockAsync } from '@Tools/clock';

// types
import { Directives, FactoryEngine } from '@Types/factoryTypes';

export async function asyncExecutionQueue(engine: FactoryEngine, directives: Directives, rollbackOnError?: boolean) {
  const methods = getMethods();
  const start = Date.now();

  // every directive is checked before any runs: a refusal here has written nothing
  const invalid = validateDirectives(directives, methods, start);
  if (invalid) return invalid;

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClockAsync(async (timeStamp) => {
    const capture = rollbackOnError ? captureOperation() : undefined;
    if (capture?.error) return { error: capture.error, rolledBack: false };
    const captured = capture?.captured;

    const results: any[] = [];
    let refusal: ReturnType<typeof executeFunction> | undefined;
    try {
      for (const directive of directives) {
        const methodName = directive.method;
        const params = prepareDirective(directive, results);

        // awaited, as asyncEngineInvoke awaits it: an imported async method returns a promise
        const result = await executeFunction(engine, methods[methodName], params, methodName, 'async');
        getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'async', params, result });

        if (result?.error) {
          refusal = result;
          break;
        }
        results.push({ ...result, methodName });
      }
    } catch (err) {
      // thrown only under devContext (otherwise executeFunction catches): restore, then surface it
      if (captured) restoreOperation(captured);
      throw err;
    }

    if (refusal) {
      if (captured) restoreOperation(captured);
      return { ...refusal, rolledBack: !!captured };
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension
    await notifySubscribersAsync({ directives, mutationStatus, timeStamp });
    deleteNotices();

    const success = results.every((r) => r.success);

    return { success, results };
  });
}
