import { ErrorType, METHOD_REMOVED } from '@Constants/errorConditionConstants';

// the 8.0.0 migration guide's section on the outcome pipeline selector
export const OUTCOME_PIPELINE_REMOVED =
  'https://courthive.github.io/competition-factory/docs/migration-8.0.0#the-outcome-pipeline-selector-is-removed';

// the 8.0.0 migration guide's section on the engine and governor routes it removes
export const ENGINE_ROUTE_REMOVED =
  'https://courthive.github.io/competition-factory/docs/migration-8.0.0#engine-and-governor-routes';

// the engine's own methods removed with the selector: they stay on the engine as stubs returning METHOD_REMOVED
export const REMOVED_ENGINE_METHODS: ReadonlySet<string> = new Set(['outcomePipeline', 'getOutcomePipeline']);

/**
 * Every removed name a call by name (a queue directive, `invoke`, `ask`) is told about, with the guide section that
 * replaces it, rather than given a bare METHOD_NOT_FOUND: the selector's engine methods, and the governor routes
 * removed because they wrote before refusing (`setMatchUpState`: use `setMatchUpStatus`).
 */
export const REMOVED_METHOD_MIGRATIONS: ReadonlyMap<string, string> = new Map([
  ...[...REMOVED_ENGINE_METHODS].map((method): [string, string] => [method, OUTCOME_PIPELINE_REMOVED]),
  ['setMatchUpState', ENGINE_ROUTE_REMOVED],
]);

export type MethodRemovedResult = {
  error: ErrorType;
  context: { method: string; option?: string; migration: string };
  success?: undefined;
};

/**
 * What a removed method or option returns in place of its old answer: `METHOD_REMOVED`, naming it (and the option, for
 * a removed option) and the guide's
 * section that replaces it. An error result, never a throw, so a caller that still makes the call is told, not broken.
 */
export function methodRemoved(
  method: string,
  option?: string,
  migration = OUTCOME_PIPELINE_REMOVED,
): MethodRemovedResult {
  return { error: METHOD_REMOVED, context: { method, ...(option ? { option } : {}), migration } };
}
