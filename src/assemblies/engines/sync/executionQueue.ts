import { captureOperation, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { deleteNotices, getInvokeObserver, getMethods } from '@Global/state/globalState';
import { getMutationStatus } from '@Assemblies/engines/parts/getMutationStatus';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { withCallRandomSource } from '@Tools/prng';
import { withCapturedClock } from '@Tools/clock';

// types
import { Directives, FactoryEngine } from '@Types/factoryTypes';

export function executionQueue(engine: FactoryEngine, directives: Directives, rollbackOnError?: boolean) {
  const methods = getMethods();
  const start = Date.now();

  // every directive is checked before any runs: a refusal here has written nothing
  const invalid = validateDirectives(directives, methods, start);
  if (invalid) return invalid;

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClock((timeStamp) => {
    const capture = rollbackOnError ? captureOperation() : undefined;
    if (capture?.error) return { error: capture.error, rolledBack: false };
    const captured = capture?.captured;

    const results: any[] = [];
    let refusal: ReturnType<typeof executeFunction> | undefined;
    try {
      for (const directive of directives) {
        const methodName = directive.method;
        const { params, unthreadedSource } = prepareDirective(directive, results);

        const result = withCallRandomSource(unthreadedSource, () =>
          executeFunction(engine, methods[methodName], params, methodName, 'sync'),
        );
        getInvokeObserver()?.({ phase: 'after', methodName, engineType: 'sync', params, result });

        if (result?.error) {
          refusal = result;
          break;
        }
        results.push({ ...result, methodName });
      }
    } catch (err) {
      // thrown only under devContext (otherwise executeFunction catches): restore, then surface it
      if (captured) restoreOperation(captured);
      else keepWrites(timeStamp);
      throw err;
    }

    if (refusal) {
      if (captured) {
        restoreOperation(captured);
        return { ...refusal, rolledBack: true };
      }
      keepWrites(timeStamp);
      return { ...refusal, rolledBack: false, results };
    }

    const mutationStatus = getMutationStatus({ timeStamp }); // timeStamp reaches the record via the factory extension
    notifySubscribers({ directives, mutationStatus, timeStamp });
    deleteNotices();

    const success = results.every((r) => r.success);

    return { success, results };
  });
}
