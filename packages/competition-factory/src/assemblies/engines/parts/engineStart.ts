import { buildQueryFacade, buildFacade, createEventBus, inspect, dryRun, explain } from '@Forge/index';
import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { setClock, setCompetitionClock, type CompetitionTimeProvider } from '@Tools/clock';
import { getLoadedFootprint, markLoadedFootprint } from '@Global/state/loadedFootprint';
import { methodImporter } from '@Assemblies/engines/parts/methodImporter';
import { processResult } from '@Assemblies/engines/parts/processResult';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { setRandomSource } from '@Tools/prng';
import {
  getState,
  getTournament,
  removeUnlinkedTournamentRecords,
  setState,
  setTournamentRecord,
} from '@Assemblies/engines/parts/stateMethods';
import {
  setDeepCopy,
  setDevContext,
  getDevContext,
  setSchemaWriteMode,
  getSchemaWriteMode,
  setOutcomePipeline,
  getOutcomePipeline,
  setStampScope,
  getStampScope,
  setSaveDrawDeletions,
  getSaveDrawDeletions,
  setAuditAuthorityServer,
  getAuditAuthorityServer,
  removeTournamentRecord,
  setTournamentRecords,
  setTournamentId,
  getTournamentId,
  getTournamentRecord,
} from '@Global/state/globalState';

// constants and types
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { LoadedFootprint } from '@Global/state/loadedFootprint';
import type { StampScope } from '@Constants/stampScopeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { FactoryEngine } from '@Types/factoryTypes';

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
  engine.outcomePipeline = (mode) => {
    const result = setOutcomePipeline(mode);
    return processResult(engine, result);
  };
  engine.getOutcomePipeline = () => getOutcomePipeline();
  engine.stampScope = (scope?: StampScope) => {
    const result = setStampScope(scope);
    return processResult(engine, result);
  };
  engine.getStampScope = () => getStampScope();
  // partial-record mode: mark the active record (or `tournamentId`'s) as holding only `footprint`; none clears the mark
  engine.loadedFootprint = (footprint?: LoadedFootprint, tournamentId?: string) => {
    const record = getTournamentRecord(tournamentId ?? getTournamentId());
    if (!record) return processResult(engine, { error: MISSING_TOURNAMENT_RECORD });
    if (footprint !== undefined && !Array.isArray(footprint?.shards))
      return processResult(engine, { error: INVALID_VALUES });
    markLoadedFootprint(record, footprint);
    return processResult(engine, { ...SUCCESS });
  };
  engine.getLoadedFootprint = (tournamentId?: string) =>
    getLoadedFootprint(getTournamentRecord(tournamentId ?? getTournamentId()));
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
  // Determinism hooks (golden corpus C1b). Process-wide, like schemaWriteMode: a run
  // configuration, not request state. No argument restores the default.
  engine.setRandomSource = (source) => {
    const result = setRandomSource(source);
    return processResult(engine, result);
  };
  engine.setClock = (clock) => {
    const result = setClock(clock);
    return processResult(engine, result);
  };
  engine.setCompetitionClock = (provider?: CompetitionTimeProvider) => {
    const result = setCompetitionClock(provider);
    return processResult(engine, result);
  };
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
  // Developer-JOY facades (forge) — see `src/forge/{q,inspect,bus}.ts`.
  // The query facade is built lazily-wired: it holds a closure over `engine`,
  // so it picks up governor methods that get added after engineStart returns.
  engine.q = buildQueryFacade(engine);
  engine.inspect = () => inspect();
  // Preview + preflight. Both restore state before returning; subscribers
  // are NOT notified. See `src/forge/{dryRun,explain}.ts`.
  engine.dryRun = (directives) => dryRun(engine, directives);
  engine.explain = (method, params) => explain(engine, method, params);
  const bus = createEventBus();
  engine.on = bus.on;
  engine.once = bus.once;
  engine.off = bus.off;
  engine.waitFor = bus.waitFor;
  engine.build = buildFacade(engine);
}
