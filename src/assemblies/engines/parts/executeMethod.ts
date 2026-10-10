import { engineLogging, paramsMayBeLogged } from '@Global/state/engineLogging';
import { checkMutationLock } from './checkMutationLock';
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
  delete engine.success;
  delete engine.error;

  const start = Date.now();
  const tournamentId = getTournamentId();
  if (params) params.activeTournamentId = tournamentId;

  const tournamentRecord = params?.tournamentRecord || getTournamentRecord(tournamentId);

  const tournamentRecords =
    (typeof params?.tournamentRecord === 'object' && {
      [params?.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ||
    getTournamentRecords();

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

  const result = resolve({ method, params, methodName, tournamentRecords, tournamentRecord });
  const elapsed = Date.now() - start;
  engineLogging({ result, methodName, elapsed, params: paramsToLog, engineType, dryRun: options?.dryRun });

  return result;
}

function resolve({ method, params, methodName, tournamentRecords, tournamentRecord }) {
  const augmentedParams = params ? paramsMiddleware(tournamentRecords, params) : undefined;
  if (augmentedParams?.error) return augmentedParams;

  const lockError = checkMutationLock(methodName, augmentedParams, tournamentRecord);
  if (lockError) return lockError;

  return invoke({ params: augmentedParams, tournamentRecords, tournamentRecord, methodName, method });
}

function invoke({ tournamentRecords, tournamentRecord, params, methodName, method }) {
  if (getDevContext()) {
    return method({ tournamentRecords, tournamentRecord, ...params });
  } else {
    try {
      return method({ tournamentRecords, tournamentRecord, ...params });
    } catch (err) {
      return handleCaughtError({
        engineName: 'engine',
        methodName,
        params,
        err,
      });
    }
  }
}
