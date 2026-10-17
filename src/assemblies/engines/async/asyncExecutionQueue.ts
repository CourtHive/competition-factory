import { captureOperation, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { deleteNotices, getDevContext, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { caughtErrorResult, executeFunction } from '@Assemblies/engines/parts/executeMethod';
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
    // the directive running when a method throws, for the caught-error envelope
    let current: { methodName: string; params?: Record<string, any> } | undefined;
    try {
      for (const directive of directives) {
        const methodName = directive.method;
        const params = prepareDirective(directive, results);
        current = { methodName, params };

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
      // executeFunction catches a SYNC throw outside devContext, but an async method's rejection arrives after it has
      // returned. Restore, then answer as the sync engine does: rethrow under devContext, otherwise the
      // caught-error envelope, marked rolledBack like any other refusal
      if (captured) restoreOperation(captured);
      if (getDevContext()) throw err;
      const caught = caughtErrorResult({ methodName: current?.methodName ?? '', params: current?.params, err });
      return { ...caught, rolledBack: !!captured };
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
