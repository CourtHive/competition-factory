import type { AsyncEngineDirectMethod } from './asyncEngineDirectMethods';
import type { Directives, FactoryEngineMethod, ResultType } from '@Types/factoryTypes';
import type { getOutcomePipeline } from '@Global/state/globalState';
import type { EngineSetup, FactoryEngineTyped } from './engineTypes';
import type { MethodSignatures } from './methodSignatures';

/** Always a Promise, even when a source signature currently returns any. */
export type AsyncEngineMethod<F> = F extends (...args: infer Args) => infer Result
  ? (...args: Args) => Promise<AsyncEngineResult<Awaited<Result>>>
  : never;

// Some source annotations omit shared envelope fields (for example addEvent's
// success flag). Admit those optional fields without promising they are present.
type AsyncEngineResult<Result> = Result extends object ? Result & Pick<ResultType, 'success' | 'error'> : Result;

/** These synchronous facades do not await governor calls and are not async-safe. */
export type AsyncEngineUnsupportedFacade = 'q' | 'build';

type PreviewResult<Method extends 'dryRun' | 'explain'> = ReturnType<FactoryEngineTyped[Method]>;
type MaybeAsync<Result> = Result | Promise<Result>;

/** Direct engineStart mounts: synchronous setup/readback, plus the existing event bus. */
export interface AsyncEngineSetup
  extends EngineSetup<AsyncFactoryEngine>, Pick<FactoryEngineTyped, 'on' | 'once' | 'off' | 'waitFor' | 'inspect'> {
  /** Await the result when a registered directive may return a Promise. */
  dryRun(directives: Directives): MaybeAsync<PreviewResult<'dryRun'>>;
  explain(method: string, params?: Record<string, any>): MaybeAsync<PreviewResult<'explain'>>;
  version(): string;
  outcomePipeline(mode: ReturnType<typeof getOutcomePipeline>): AsyncFactoryEngine;
  getOutcomePipeline: typeof getOutcomePipeline;
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
