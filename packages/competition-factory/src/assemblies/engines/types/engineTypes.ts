import type { FactoryEngineMethod, ResultType, TournamentRecords } from '@Types/factoryTypes';
import type { LoadedFootprint } from '@Global/state/loadedFootprint';
import type { setClock, setCompetitionClock } from '@Tools/clock';
import type { MethodSignatures } from './methodSignatures';
import type { Tournament } from '@Types/tournamentTypes';
import type { setRandomSource } from '@Tools/prng';
import type * as Forge from '../../../forge';
import type {
  DeepCopyAttributes,
  DevContextType,
  getSchemaWriteMode,
  getStampScope,
  setTournamentId,
} from '@Global/state/globalState';

/**
 * Hint keys consumers pass instead of the fully-resolved entities. The
 * middleware looks these up against state and populates the resolved keys.
 * Universally accepted (and ignored when irrelevant), so the typed surface
 * never blocks a call that names a draw / event / matchUp / structure
 * directly.
 */
type EngineHintKeys = {
  /** Presented to unlock a mutation-locked element; read by the engine's checkMutationLock on every mutation. */
  lockToken?: string;
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
  matchUpId?: string;
  structureId?: string;
};

/**
 * Transform a source function signature into its engine-call-surface
 * signature. Source functions declare params from the perspective of "I
 * receive everything fully resolved" (because the engine guarantees that).
 * Engine consumers call from the OPPOSITE perspective — "I have IDs in
 * state; resolve everything for me."
 *
 * EngineMethod relaxes the param shape so it matches the contract the
 * engine actually offers:
 *   - First param is optional (0-arg calls work for state-only methods)
 *   - All keys in the first param become optional (`Partial<P>`) because
 *     the engine populates auto-resolved entities from state and the
 *     source's own `requireParams()` checks the rest at runtime
 *   - EngineHintKeys (drawId, eventId, matchUpId, structureId, tournamentId)
 *     are admitted universally — they're the lookup keys consumers actually
 *     pass
 *
 * Tradeoff: TS no longer flags missing source-required keys at the type
 * level (e.g. `engine.generateDrawDefinition()` with no drawSize compiles).
 * The source's `requireParams` / nullability checks surface the same issue
 * as a runtime error envelope `{ error: MISSING_X }`. This honest contract
 * matches every documented engine call site in the ecosystem.
 */
export type EngineMethod<F> = F extends (firstParam: infer P, ...rest: infer R) => infer Ret
  ? // `[P] extends [object]` prevents distribution when source declares
    // `(params?: T) => R` — there, `P` infers as `T | undefined`, and the
    // naked-conditional `P extends object` would split the result into a
    // union of two function shapes, which TS then intersects at the call
    // site, putting the un-`Partial`-ed `T` back. The bracketed form keeps
    // `P` whole so the consumer-facing param stays uniformly `Partial<P>`.
    [NonNullable<P>] extends [object]
    ? (params?: Partial<NonNullable<P>> & EngineHintKeys, ...rest: R) => Ret
    : F
  : F;

/**
 * Names of methods provided by the developer-JOY facades (`engine.q`,
 * `engine.on/once/off/waitFor`, `engine.inspect`, `engine.build`). These
 * names also appear in `FactoryEngineMethod` because `gen:engine-methods`
 * walks the runtime engine, so we have to exclude them from the
 * `(...args: any[]) => any` fallback or the open shape competes with the
 * facades' precise generics in the intersection and TS picks `any`.
 */
type FacadeMethodNames = 'q' | 'on' | 'once' | 'off' | 'waitFor' | 'inspect' | 'build' | 'dryRun' | 'explain';

type CopyArgs = [deepCopyOption?: boolean, deepCopyAttributes?: DeepCopyAttributes];
type ReadOptions = { convertExtensions?: boolean; removeExtensions?: boolean };

/**
 * The setup and state methods `engineStart` mounts on every engine, typed once for both engines. `Engine` is what the
 * chaining ones return: the engine itself, with `error` and `success` set from the call (`processResult`).
 * `outcomePipeline` / `getOutcomePipeline` are typed by each engine on its own.
 */
export interface EngineSetup<Engine> {
  error?: unknown;
  success?: boolean;
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
  reset(): Engine;
  setState(records?: Tournament | Tournament[] | TournamentRecords, ...copy: CopyArgs): Engine;
  setTournamentRecord(record?: Tournament, ...copy: CopyArgs): Engine;
  removeTournamentRecord(tournamentId: string): Engine;
  removeUnlinkedTournamentRecords(): Engine;
  newTournamentRecord(params?: Partial<Tournament>): ResultType & { tournamentId?: string };
  devContext(criteria?: DevContextType): Engine;
  getDevContext(criteria?: DevContextType): DevContextType;
  schemaWriteMode(mode: ReturnType<typeof getSchemaWriteMode>): Engine;
  getSchemaWriteMode: typeof getSchemaWriteMode;
  stampScope(scope?: ReturnType<typeof getStampScope>): Engine;
  getStampScope: typeof getStampScope;
  loadedFootprint(footprint?: LoadedFootprint, tournamentId?: string): Engine;
  getLoadedFootprint(tournamentId?: string): LoadedFootprint | undefined;
  saveDrawDeletions(flag?: boolean): Engine;
  getSaveDrawDeletions(): boolean;
  auditAuthorityServer(flag?: boolean): Engine;
  getAuditAuthorityServer(): boolean;
  setRandomSource(source?: Parameters<typeof setRandomSource>[0]): Engine;
  setClock(clock?: Parameters<typeof setClock>[0]): Engine;
  setCompetitionClock(provider?: Parameters<typeof setCompetitionClock>[0]): Engine;
}

/** The keys of the previous directive's result that a directive copies into its own params. */
export type DirectivePipe = { [key: string]: boolean };

/** A queued method's params: its first parameter when that is a plain object, else an open object. */
type DirectiveParams<F> = F extends (...args: infer A) => unknown
  ? [NonNullable<A[0]>] extends [readonly unknown[]]
    ? Record<string, unknown>
    : [NonNullable<A[0]>] extends [object]
      ? A[0]
      : Record<string, unknown>
  : Record<string, unknown>;

/** A directive for a method without a typed signature: `params` is an open object. */
type OpenDirective<Name extends string> = { method: Name; params?: Record<string, unknown>; pipe?: DirectivePipe };

/** Registered methods without a typed signature: the availability helpers and the outcome pipeline selectors. */
type OpenMethodName = Exclude<FactoryEngineMethod, keyof MethodSignatures | FacadeMethodNames | SyncEngineSetupName>;

/**
 * One `executionQueue` / `dryRun` directive. For a method with a typed signature, `params` is that method's
 * parameter object, as a direct call takes it. A registered method without one takes an open `params` object, and so
 * does a method the caller registered with `importMethods`, named by `Custom`.
 */
export type Directive<Custom extends string = never> =
  | {
      [M in keyof MethodSignatures]: { method: M; params?: DirectiveParams<MethodSignatures[M]>; pipe?: DirectivePipe };
    }[keyof MethodSignatures]
  | OpenDirective<OpenMethodName | Custom>;

export type Directives<Custom extends string = never> = Directive<Custom>[];

/**
 * What a queue accepts. `Custom` is inferred from the method names the caller passes; a name with a typed signature is
 * removed from it, so that directive's `params` is checked against the signature.
 */
export type QueueDirectives<Custom extends string> = Directives<Exclude<Custom, keyof MethodSignatures>>;

/** The synchronous engines' setup methods, returning the typed engine. */
export type SyncEngineSetup = EngineSetup<FactoryEngineTyped> & {
  /** Run the directives in order as one call; with `rollbackOnError`, a refusal restores the records it started from. */
  executionQueue<Custom extends string = never>(
    directives: QueueDirectives<Custom>,
    rollbackOnError?: boolean,
  ): ResultType & { results?: unknown[]; rolledBack?: boolean };
  /** Run one registered method by name: `{ method, params }`. */
  execute(args: Record<string, unknown>): unknown;
};

/** Named apart from `SyncEngineSetup` so `FactoryEngineTyped` can exclude them without reading its own members. */
type SyncEngineSetupName = keyof EngineSetup<unknown> | 'executionQueue' | 'execute';

/**
 * Closed engine surface for consumers — every method name comes from
 * `factoryEngineMethods.ts`, which is regenerated from the live engine via
 * `pnpm gen:engine-methods`. Has no index signature, so calls like
 * `engine.findEvent(...)` (where `findEvent` is not a registered method)
 * fail at compile time.
 *
 * Methods listed in `MethodSignatures` carry real param + return types lifted
 * from the source declaration via `typeof`, and the setup methods `engineStart`
 * mounts are typed by `SyncEngineSetup`. A method in neither falls through to
 * the `(...args: any[]) => any` fallback: only the availability helpers that
 * leave the engine at 8.0.0 and the outcome pipeline selectors.
 *
 * Opt in at the consumer boundary:
 *
 *   import { tournamentEngine, FactoryEngineTyped } from 'tods-competition-factory';
 *   const engine = tournamentEngine as FactoryEngineTyped;
 */
export type FactoryEngineTyped = MethodSignatures &
  SyncEngineSetup &
  Record<
    Exclude<FactoryEngineMethod, keyof MethodSignatures | FacadeMethodNames | SyncEngineSetupName>,
    (...args: any[]) => any
  > & {
    /**
     * Developer-JOY unwrap query facade — see `src/forge/q.ts`.
     *
     * Returns the unwrapped primary payload of common queries directly:
     *
     *   const events = engine.q.events();          // Event[]
     *   const event  = engine.q.event({ eventId }); // Event | undefined
     *
     * Replaces the `tournamentEngine.getEvents()?.events ?? []` boilerplate.
     * Per-method arg shapes are still `any`; typed signatures are a follow-up.
     */
    q: Forge.QueryFacade;

    /**
     * Developer-JOY typed event bus — see `src/forge/bus.ts`.
     *
     * Multi-subscriber ergonomic surface over the legacy `setSubscriptions`
     * single-callback system. Handlers receive one payload per call (the bus
     * iterates the underlying notice array); ~12 topics are precisely typed
     * via `TopicPayloadMap`, the rest fall through to `unknown`.
     *
     *   const off = engine.on('addMatchUps', e => relay.publish(e.matchUps));
     *   const m   = await engine.waitFor('modifyMatchUp', p => p.matchUp.matchUpId === id);
     */
    // Inline the bus generics directly (rather than `EventBus['on']` lookups)
    // so contextual inference flows through in consumer code under strict.
    // The handler param picks up its TopicPayloadMap[T] type from the topic
    // literal without an explicit annotation.
    on<T extends Forge.Topic>(topic: T, handler: (payload: Forge.TopicPayloadMap[T]) => void): Forge.Unsubscribe;
    once<T extends Forge.Topic>(topic: T, handler: (payload: Forge.TopicPayloadMap[T]) => void): Forge.Unsubscribe;
    off<T extends Forge.Topic>(topic: T, handler?: (payload: Forge.TopicPayloadMap[T]) => void): void;
    waitFor<T extends Forge.Topic>(
      topic: T,
      predicate?: (payload: Forge.TopicPayloadMap[T]) => boolean,
    ): Promise<Forge.TopicPayloadMap[T]>;

    /**
     * Developer-JOY state-inspection snapshot — see `src/forge/inspect.ts`.
     *
     * Returns a typed snapshot of "what's loaded right now": engine version,
     * write-mode flags, loaded tournament IDs + counts, subscribed topics,
     * devContext. Side-effect-free and cheap; safe to call from hot paths.
     */
    inspect(): Forge.EngineInspection;

    /**
     * Developer-JOY fluent builders — see `src/forge/builders/`.
     *
     * Chainable composition of addEvent → generateDrawDefinition →
     * addDrawDefinition → addEventEntries (and addParticipant) into a single
     * executionQueue dispatch. Pre-assigns `eventId`/`drawId`/`participantId`
     * so callers can reference them before terminal verbs resolve.
     *
     *   const { eventId, drawIds } = engine.build.event({ eventName: 'U16 Singles' })
     *     .singles().gender('MALE').draw(32, { seedsCount: 8 }).entries(ids).create();
     *
     *   const request = engine.build.event(...).singles().draw(8).toRequest();
     *   socket.send('executionQueue', request);
     */
    build: Forge.BuildFacade;

    /**
     * Developer-JOY mutation preview — see `src/forge/dryRun.ts` (#3).
     *
     * Run the directives in a child provider scope on private copies of the loaded records.
     * Return the RFC 6902 patch, per-method results and notice payloads.
     * Subscribers are never notified. See `src/forge/dryRun.ts`.
     *
     *   const { wouldSucceed, patch, willEmitNotices } = engine.dryRun([
     *     { method: 'deleteDrawDefinition', params: { drawId } },
     *   ]);
     */
    dryRun<Custom extends string = never>(directives: QueueDirectives<Custom>): Forge.DryRunResult;

    /**
     * Developer-JOY pre-flight readiness check — see `src/forge/explain.ts` (#12).
     *
     * Project `dryRun` down to the four signals UI gating wants:
     *   `{ wouldSucceed, reason?, willEmitTopics, touchesPaths }`.
     * Plus `detail` carrying the full dryRun result for callers that
     * need the patch.
     *
     *   const { wouldSucceed, reason } = engine.explain('deleteDrawDefinition', { drawId });
     */
    explain(method: string, params?: Record<string, any>): Forge.ExplainResult;
  };
