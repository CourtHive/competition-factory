import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { methodImporter } from '@Assemblies/engines/parts/methodImporter';
import { processResult } from '@Assemblies/engines/parts/processResult';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { buildQueryFacade, inspect } from '@Forge/index';
import {
  setDeepCopy,
  setDevContext,
  getDevContext,
  setSchemaWriteMode,
  getSchemaWriteMode,
  setSaveDrawDeletions,
  getSaveDrawDeletions,
  setAuditAuthorityServer,
  getAuditAuthorityServer,
  removeTournamentRecord,
  setTournamentRecords,
  setTournamentId,
  getTournamentId,
} from '@Global/state/globalState';
import {
  getState,
  getTournament,
  removeUnlinkedTournamentRecords,
  setState,
  setTournamentRecord,
} from '@Assemblies/engines/parts/stateMethods';

// constants and types
import { FactoryEngine } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function engineStart(engine: FactoryEngine, engineInvoke: any): void {
  engine.importMethods = (methods, collections, depth, global) =>
    methodImporter(engine, engineInvoke, methods, collections, depth, global);
  engine.getTournament = (params?) => getTournament(params);
  engine.getState = (params?) =>
    getState({
      convertExtensions: params?.convertExtensions,
      removeExtensions: params?.removeExtensions,
    });
  engine.version = () => factoryVersion();
  engine.reset = () => {
    setTournamentRecords({});
    return processResult(engine);
  };
  engine.devContext = (contextCriteria) => {
    setDevContext(contextCriteria);
    return processResult(engine);
  };
  engine.getDevContext = (contextCriteria) => getDevContext(contextCriteria);
  engine.schemaWriteMode = (mode) => {
    const result = setSchemaWriteMode(mode);
    return processResult(engine, result);
  };
  engine.getSchemaWriteMode = () => getSchemaWriteMode();
  engine.saveDrawDeletions = (flag) => {
    const result = setSaveDrawDeletions(flag);
    return processResult(engine, result);
  };
  engine.getSaveDrawDeletions = () => getSaveDrawDeletions();
  engine.auditAuthorityServer = (flag) => {
    const result = setAuditAuthorityServer(flag);
    return processResult(engine, result);
  };
  engine.getAuditAuthorityServer = () => getAuditAuthorityServer();
  engine.newTournamentRecord = (params = {}) => {
    const result = createTournamentRecord(params);
    const tournamentId = result.tournamentId;
    if (result.error) return result;
    setTournamentRecord(result);
    setTournamentId(tournamentId);
    return { ...SUCCESS, tournamentId };
  };
  engine.setState = (records, deepCopyOption, deepCopyAttributes) => {
    setDeepCopy(deepCopyOption, deepCopyAttributes);
    const result = setState(records, deepCopyOption);
    return processResult(engine, result);
  };
  engine.setTournamentId = (tournamentId) => setTournamentId(tournamentId);
  engine.getTournamentId = () => getTournamentId();
  engine.setTournamentRecord = (tournamentRecord, deepCopyOption, deepCopyAttributes) => {
    setDeepCopy(deepCopyOption, deepCopyAttributes);
    const result = setTournamentRecord(tournamentRecord, deepCopyOption);
    return processResult(engine, result);
  };
  engine.removeTournamentRecord = (tournamentId) => {
    const result = removeTournamentRecord(tournamentId);
    return processResult(engine, result);
  };
  engine.removeUnlinkedTournamentRecords = () => {
    const result = removeUnlinkedTournamentRecords();
    return processResult(engine, result);
  };
  // Developer-JOY facades (forge) — see `src/forge/q.ts` and `src/forge/inspect.ts`.
  // The query facade is built lazily-wired: it holds a closure over `engine`,
  // so it picks up governor methods that get added after engineStart returns.
  engine.q = buildQueryFacade(engine);
  engine.inspect = () => inspect();
}
