import type { FactoryEngineMethod } from '@Types/factoryEngineMethods';
import type { MethodSignatures } from './methodSignatures';
import type { Directives } from '@Types/factoryTypes';
import type * as Forge from '../../../forge';

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

/**
 * Closed engine surface for consumers — every method name comes from
 * `factoryEngineMethods.ts`, which is regenerated from the live engine via
 * `pnpm gen:engine-methods`. Has no index signature, so calls like
 * `engine.findEvent(...)` (where `findEvent` is not a registered method)
 * fail at compile time.
 *
 * Methods listed in `MethodSignatures` carry real param + return types lifted
 * from the source declaration via `typeof`. Methods NOT listed there fall
 * through to the `(...args: any[]) => any` fallback so the surface stays
 * complete during the incremental signature roll-out. Adding a method to
 * `MethodSignatures` is purely additive and never breaks existing callers.
 *
 * Opt in at the consumer boundary:
 *
 *   import { tournamentEngine, FactoryEngineTyped } from 'tods-competition-factory';
 *   const engine = tournamentEngine as FactoryEngineTyped;
 */
export type FactoryEngineTyped = MethodSignatures &
  Record<Exclude<FactoryEngineMethod, keyof MethodSignatures | FacadeMethodNames>, (...args: any[]) => any> & {
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
    dryRun(directives: Directives): Forge.DryRunResult;

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
