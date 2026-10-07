import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Directives } from '@Types/factoryTypes';

// Generic directive/pipe/rollback pipeline shared by declaration-style engines
// (officiating, sanctioning, and a future player/declarations engine). The engine
// supplies its own method surface and its keyed-record store accessors; the queue
// logic — snapshot, method lookup, pipe, rollback-on-error — is population-agnostic.
type ExecuteDeclarationQueueArgs<R> = {
  engine: { [method: string]: any };
  directives: Directives;
  rollbackOnError?: boolean;
  getRecords: () => R;
  setRecords: (records: R) => unknown;
};

export function executeDeclarationQueue<R>({
  engine,
  directives,
  rollbackOnError,
  getRecords,
  setRecords,
}: ExecuteDeclarationQueueArgs<R>): {
  error?: any;
  success?: boolean;
  results?: any[];
  rolledBack?: boolean;
  context?: any;
} {
  if (!Array.isArray(directives)) return { error: INVALID_VALUES, context: { message: 'directives must be an array' } };

  const snapshot = rollbackOnError ? makeDeepCopy(getRecords(), false, true) : undefined;

  const results: any[] = [];
  for (const directive of directives) {
    if (typeof directive !== 'object')
      return { error: INVALID_VALUES, context: { message: 'directive must be an object' } };

    const { method: methodName, pipe } = directive;
    const params: { [key: string]: unknown } = directive.params ? { ...directive.params } : {};

    const method = engine[methodName];
    if (!method) {
      if (snapshot) setRecords(snapshot);
      return { error: INVALID_VALUES, context: { message: `Method not found: ${methodName}` }, rolledBack: !!snapshot };
    }

    if (pipe && results.length) {
      const lastResult = results.at(-1);
      for (const pipeKey of Object.keys(pipe)) {
        if (lastResult[pipeKey] !== undefined) params[pipeKey] = lastResult[pipeKey];
      }
    }

    const result = method(params);
    if (result?.error) {
      if (snapshot) setRecords(snapshot);
      return { ...result, rolledBack: !!snapshot };
    }

    results.push({ ...result, methodName });
  }

  const success = results.every((r) => r.success);
  return { success, results };
}
