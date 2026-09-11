import { engineLogging } from '@Global/state/engineLogging';
import { checkMutationLock } from './checkMutationLock';
import { paramsMiddleware } from './paramsMiddleware';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getDevContext,
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

  // ENSURE that logged params are not mutated by middleware
  const paramsToLog = params ? makeDeepCopy(params, undefined, true) : undefined;
  const augmentedParams = params ? paramsMiddleware(tournamentRecords, params) : undefined;
  if (augmentedParams?.error) return augmentedParams;

  const lockError = checkMutationLock(methodName, augmentedParams, tournamentRecord);
  if (lockError) return lockError;

  const result = invoke({
    params: augmentedParams,
    tournamentRecords,
    tournamentRecord,
    methodName,
    method,
  });
  const elapsed = Date.now() - start;
  engineLogging({ result, methodName, elapsed, params: paramsToLog, engineType, dryRun: options?.dryRun });

  return result;
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
