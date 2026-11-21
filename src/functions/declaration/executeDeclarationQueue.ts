import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { withCapturedClock } from '@Tools/clock';
import { isObject } from '@Tools/objects';

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

type QueueResult = {
  error?: any;
  success?: boolean;
  results?: any[];
  rolledBack?: boolean;
  context?: any;
};

const refuse = (message: string): QueueResult => ({ error: INVALID_VALUES, context: { message } });

/**
 * Refuses a queue before ANY directive runs. Checking each directive only as it was reached let an
 * earlier directive write first: a later non-object directive returned outside the rollback path, and
 * a later `null` directive threw, so rollbackOnError restored nothing in either case.
 */
function validateDeclarationQueue(
  directives: unknown[],
  engine: ExecuteDeclarationQueueArgs<unknown>['engine'],
): QueueResult | undefined {
  for (const [index, directive] of directives.entries()) {
    if (!isObject(directive)) return refuse('directive must be an object');
    const { method: methodName, params, pipe } = directive as Directives[number];
    if (params != null && !isObject(params)) return refuse('params must be an object');
    if (pipe != null) {
      if (!isObject(pipe)) return refuse('pipe must be an object');
      // a pipe reads the PREVIOUS directive's result; the first directive has none
      if (index === 0) return refuse('pipe requires a preceding directive');
    }
    if (typeof engine[methodName] !== 'function') return refuse(`Method not found: ${methodName}`);
  }
  return undefined;
}

export function executeDeclarationQueue<R>({
  engine,
  directives,
  rollbackOnError,
  getRecords,
  setRecords,
}: ExecuteDeclarationQueueArgs<R>): QueueResult {
  if (!Array.isArray(directives)) return refuse('directives must be an array');

  // every directive is checked before any runs: a refusal here has written nothing
  const invalid = validateDeclarationQueue(directives, engine);
  if (invalid) return invalid;

  // one instant for the whole queue, captured before any directive runs; see tools/clock.ts
  return withCapturedClock(() => {
    const snapshot = rollbackOnError ? makeDeepCopy(getRecords(), false, true) : undefined;

    const results: any[] = [];
    try {
      for (const directive of directives) {
        const { method: methodName, pipe } = directive;
        const params: { [key: string]: unknown } = directive.params ? { ...directive.params } : {};

        if (pipe) {
          const lastResult = results.at(-1);
          for (const pipeKey of Object.keys(pipe)) {
            if (lastResult[pipeKey] !== undefined) params[pipeKey] = lastResult[pipeKey];
          }
        }

        const result = engine[methodName](params);
        if (result?.error) {
          if (snapshot) setRecords(snapshot);
          return { ...result, rolledBack: !!snapshot };
        }

        results.push({ ...result, methodName });
      }
    } catch (err) {
      // a method that throws must not leave the earlier directives' writes behind
      if (snapshot) setRecords(snapshot);
      throw err;
    }

    const success = results.every((r) => r.success);
    return { success, results };
  });
}
