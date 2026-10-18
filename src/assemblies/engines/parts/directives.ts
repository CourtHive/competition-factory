import { logMethodNotFound } from '@Assemblies/engines/parts/logMethodNotFound';
import { seedCall } from '@Assemblies/engines/parts/seedRandomParam';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Directives, ResultType } from '@Types/factoryTypes';

type DirectiveRefusal = ResultType & { message?: string; methodName?: string };

/**
 * Refuses a queue before ANY directive runs. A queue that checked each directive as it reached it
 * returned for the second one after the first had written, outside the rollback path, so a
 * malformed or unknown later directive left the earlier write in place even with rollbackOnError.
 *
 * Shared by the sync and async queues and by dryRun, so that a preview refuses exactly what the
 * commit would.
 */
export function validateDirectives(
  directives: unknown,
  methods: { [key: string]: unknown },
  start?: number,
): DirectiveRefusal | undefined {
  if (!Array.isArray(directives)) return { error: INVALID_VALUES, message: 'directives must be an array' };

  for (const [index, directive] of directives.entries()) {
    if (!isObject(directive)) return { error: INVALID_VALUES, message: 'directive must be an object' };
    const { method: methodName, params, pipe } = directive;
    if (params != null && !isObject(params)) return { error: INVALID_VALUES, message: 'params must be an object' };
    if (pipe != null) {
      if (!isObject(pipe)) return { error: INVALID_VALUES, message: 'pipe must be an object' };
      // a pipe reads the PREVIOUS directive's result; the first directive has none
      if (index === 0) return { error: INVALID_VALUES, message: 'pipe requires a preceding directive' };
    }
    if (typeof methodName !== 'string' || !methods[methodName]) return logMethodNotFound({ methodName, start, params });
  }

  return undefined;
}

/**
 * The params one directive is dispatched with: the caller's own copy, the `nonRandom: <seed>`
 * transform applied, and piped values from the previous result, with the stream a seeded directive
 * scopes around itself (see seedCall). ONE copy for every queue and for dryRun, so a preview receives
 * the same inputs as the commit it previews.
 */
export function prepareDirective(directive: Directives[number], results: { [key: string]: unknown }[]) {
  const params: { [key: string]: unknown } = directive.params ? { ...directive.params } : {};

  const unthreadedSource = seedCall(params); // nonRandom: <seed> middleware

  if (directive.pipe) {
    const lastResult = results.at(-1);
    for (const pipeKey of Object.keys(directive.pipe)) {
      if (lastResult?.[pipeKey]) params[pipeKey] = lastResult[pipeKey];
    }
  }

  return { params, unthreadedSource };
}
