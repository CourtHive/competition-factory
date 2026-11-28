import { checkMutationLock } from '@Mutate/tournaments/mutationLocks/checkMutationLock';
import { engineLogging, paramsMayBeLogged } from '@Global/state/engineLogging';
import { withContextExclusion } from '@Query/matchUps/contextExclusion';
import { engineBoundaryObservers } from './boundaryObservers';
import { checkLoadedFootprint } from './loadedFootprintGuard';
import { internalParamsRefusal } from './internalParams';
import { paramsMiddleware } from './paramsMiddleware';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getDevContext,
  getInvokeObserver,
  getTournamentId,
  getTournamentRecord,
  getTournamentRecords,
  handleCaughtError,
} from '@Global/state/globalState';

// types
import { FactoryEngine } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

let directiveReentry = false;

export function executeFunction(
  engine: FactoryEngine,
  method: any,
  params: { [key: string]: any } | undefined,
  methodName: string,
  engineType: string,
  // `dryRun` only tags the dev log — it does not change dispatch. The caller
  // that sets it (`forge/dryRun`) owns snapshotting and restoring the state.
  options?: { dryRun?: boolean },
) {
  const observe = engineBoundaryObservers.directive;
  if (observe) {
    // an installed observer (a test harness) is handed the call; it re-enters once, past this check
    if (!directiveReentry)
      return observe(methodName, (): unknown => {
        directiveReentry = true;
        return executeFunction(engine, method, params, methodName, engineType, options);
      }) as never;
    directiveReentry = false;
  }
  delete engine.success;
  delete engine.error;

  const start = Date.now();
  const tournamentId = getTournamentId();
  if (params) params.activeTournamentId = tournamentId;

  // the records in state, never a record the caller passed: the middleware resolves a passed record to its one in state
  const tournamentRecords = getTournamentRecords();

  // ENSURE that logged params are not mutated by middleware. The copy is taken only when something
  // will read it: copied unconditionally it was ~90% of a query handed the tournament's hydrated
  // matchUps (8.8ms of 9.7ms at 504 matchUps), paid on every call with logging off.
  const observer = getInvokeObserver();
  const paramsToLog =
    params && (observer || paramsMayBeLogged(methodName)) ? makeDeepCopy(params, undefined, true) : undefined;
  // `before` is reported here, on the one path every call takes. `after` is reported by the
  // engine entry points (engineInvoke, executionQueue, their async twins) once their own
  // post-processing has run, because that post-processing writes into the record too (the
  // factory extension's timeStamp): an observer that captured state here would attribute that
  // write to the NEXT call.
  observer?.({ phase: 'before', methodName, engineType, params: paramsToLog });

  const result = resolve({ method, params, methodName, tournamentRecords, tournamentId });
  const elapsed = Date.now() - start;
  engineLogging({ result, methodName, elapsed, params: paramsToLog, engineType, dryRun: options?.dryRun });

  return result;
}

// A preview supplies its private records directly, below live dispatch logging and observers.
export { resolve as resolveEngineMethod };

function resolve({ method, params, methodName, tournamentRecords, tournamentId }) {
  // a public call takes ids, not the state or checks the factory's own callers hand a method (internalParams.ts)
  const internal = internalParamsRefusal(methodName, params);
  if (internal) return internal;
  const footprintError = checkLoadedFootprint({ methodName, params, tournamentRecords, tournamentId });
  if (footprintError) return footprintError;

  const augmentedParams = params ? paramsMiddleware(tournamentRecords, params, methodName) : undefined;
  if (augmentedParams?.error) return augmentedParams;
  const resolved = augmentedParams as { tournamentRecord?: Tournament } | undefined;
  const tournamentRecord = resolved?.tournamentRecord ?? getTournamentRecord(tournamentId);

  const lockError = checkMutationLock(methodName, augmentedParams, tournamentRecord);
  if (lockError) return lockError;

  return invoke({ params: augmentedParams, tournamentRecords, tournamentRecord, methodName, method });
}

function invoke({ tournamentRecords, tournamentRecord, params, methodName, method }) {
  // every method is entered here, so this is the one boundary at which an engine caller's exclusion is applied
  const run = () => withContextExclusion({ tournamentRecords, tournamentRecord, ...params }, method);
  if (getDevContext()) {
    return run();
  } else {
    try {
      return run();
    } catch (err) {
      return caughtErrorResult({ methodName, params, err });
    }
  }
}

/**
 * The result of a method that threw, outside devContext. The state provider's `handleCaughtError` reports it and
 * shapes the envelope, but a provider whose handler returns nothing (the reference async provider did, and so does
 * any copy of it) would turn a throw into `{}`: no error, so no refusal, no rollback, and the partial write
 * notified as if the call had run. Whatever the handler returns, the result carries an `error`.
 */
export function caughtErrorResult({
  methodName,
  params,
  err,
}: {
  params?: Record<string, any>;
  methodName: string;
  err: unknown;
}): ReturnType<typeof handleCaughtError> {
  const caught: Record<string, any> | undefined = handleCaughtError({
    engineName: 'engine',
    methodName,
    params: params ?? {},
    err,
  });
  const error = typeof err === 'string' ? err.toUpperCase() : ((err as Error)?.message ?? 'UNKNOWN_ERROR');
  const result = caught?.error ? caught : { ...caught, error };
  thrownResults.add(result);
  return result;
}

// The envelopes of methods that threw. A throw can come partway through a write, so a rollback that took no snapshot
// (rollbackSnapshot.ts) cannot claim to have restored one. Kept by identity: the envelope's shape is the provider's.
const thrownResults = new WeakSet<object>();

/** true when `result` is the envelope of a method that threw, not a refusal it returned */
export function isThrownResult(result: unknown): boolean {
  return typeof result === 'object' && result !== null && thrownResults.has(result);
}
