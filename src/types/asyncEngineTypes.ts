import type { AsyncEngineDirectMethod } from './asyncEngineDirectMethods';
import type { setClock, setCompetitionClock } from '../tools/clock';
import type { setRandomSource } from '../tools/prng';
import type { Tournament } from './tournamentTypes';
import type {
  FactoryEngineTyped,
  MethodSignatures,
  FactoryEngineMethod,
  Directives,
  ResultType,
  TournamentRecords,
} from './factoryTypes';
import type {
  DeepCopyAttributes,
  DevContextType,
  getOutcomePipeline,
  getSchemaWriteMode,
  getStampScope,
  setTournamentId,
} from '../global/state/globalState';

/** Always a Promise, even when a source signature currently returns any. */
export type AsyncEngineMethod<F> = F extends (...args: infer Args) => infer Result
  ? (...args: Args) => Promise<AsyncEngineResult<Awaited<Result>>>
  : never;

// Some source annotations omit shared envelope fields (for example addEvent's
// success flag). Admit those optional fields without promising they are present.
type AsyncEngineResult<Result> = Result extends object ? Result & Pick<ResultType, 'success' | 'error'> : Result;

/** These synchronous facades do not await governor calls and are not async-safe. */
export type AsyncEngineUnsupportedFacade = 'q' | 'build' | 'dryRun' | 'explain';

type CopyArgs = [deepCopyOption?: boolean, deepCopyAttributes?: DeepCopyAttributes];
type ReadOptions = { convertExtensions?: boolean; removeExtensions?: boolean };

/** Direct engineStart mounts: synchronous setup/readback, plus the existing event bus. */
export interface AsyncEngineSetup extends Pick<FactoryEngineTyped, 'on' | 'once' | 'off' | 'waitFor' | 'inspect'> {
  error?: unknown;
  success?: boolean;
  version(): string;
  importMethods(
    methods: Record<string, unknown>,
    collections?: boolean | string[],
    depth?: number,
    global?: boolean,
  ): ResultType;
  getState(params?: ReadOptions): { tournamentId: string | undefined; tournamentRecords: TournamentRecords };
  getTournament(params?: ReadOptions & { tournamentId?: string }): { tournamentRecord?: Tournament };
  getTournamentId(): string | undefined;
  setTournamentId: typeof setTournamentId;
  reset(): AsyncFactoryEngine;
  setState(records?: Tournament | Tournament[] | TournamentRecords, ...copy: CopyArgs): AsyncFactoryEngine;
  setTournamentRecord(record?: Tournament, ...copy: CopyArgs): AsyncFactoryEngine;
  removeTournamentRecord(tournamentId: string): AsyncFactoryEngine;
  removeUnlinkedTournamentRecords(): AsyncFactoryEngine;
  newTournamentRecord(params?: Partial<Tournament>): ResultType & { tournamentId?: string };
  devContext(criteria?: DevContextType): AsyncFactoryEngine;
  getDevContext(criteria?: DevContextType): DevContextType;
  schemaWriteMode(mode: ReturnType<typeof getSchemaWriteMode>): AsyncFactoryEngine;
  getSchemaWriteMode: typeof getSchemaWriteMode;
  outcomePipeline(mode: ReturnType<typeof getOutcomePipeline>): AsyncFactoryEngine;
  getOutcomePipeline: typeof getOutcomePipeline;
  stampScope(scope?: ReturnType<typeof getStampScope>): AsyncFactoryEngine;
  getStampScope: typeof getStampScope;
  saveDrawDeletions(flag?: boolean): AsyncFactoryEngine;
  getSaveDrawDeletions(): boolean;
  auditAuthorityServer(flag?: boolean): AsyncFactoryEngine;
  getAuditAuthorityServer(): boolean;
  setRandomSource(source?: Parameters<typeof setRandomSource>[0]): AsyncFactoryEngine;
  setClock(clock?: Parameters<typeof setClock>[0]): AsyncFactoryEngine;
  setCompetitionClock(provider?: Parameters<typeof setCompetitionClock>[0]): AsyncFactoryEngine;
}

type GovernorNames = Exclude<FactoryEngineMethod, AsyncEngineDirectMethod | 'execute' | 'executionQueue'>;
type TypedGovernorNames = Extract<GovernorNames, keyof MethodSignatures>;

/**
 * Public async surface. Governor methods and dispatch return Promises; direct
 * setup methods retain their actual synchronous contract. No string index or
 * bare-any fallback can hide a missing await. Unresolved results are unknown.
 */
export type AsyncFactoryEngine = AsyncEngineSetup & {
  [Name in TypedGovernorNames]: AsyncEngineMethod<MethodSignatures[Name]>;
} & {
  [Name in Exclude<GovernorNames, keyof MethodSignatures>]: (...args: unknown[]) => Promise<unknown>;
} & {
  executionQueue(
    directives: Directives,
    rollbackOnError?: boolean,
  ): Promise<ResultType & { results?: unknown[]; rolledBack?: boolean }>;
  execute(args: Record<string, unknown>): Promise<unknown>;
};

/** The constructor can refuse when the state provider cannot create an instance. */
export type AsyncEngineInitializationError = { error: unknown };

export interface AsyncEngineFactory {
  (test: true): AsyncFactoryEngine;
  (test?: boolean): AsyncFactoryEngine | AsyncEngineInitializationError;
}
