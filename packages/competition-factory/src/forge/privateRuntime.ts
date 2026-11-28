import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { caughtErrorResult, resolveEngineMethod } from '@Assemblies/engines/parts/executeMethod';
import { getState, getTournament } from '@Assemblies/engines/parts/stateMethods';
import { ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { engineLogging, paramsMayBeLogged } from '@Global/state/engineLogging';
import { getCapturedClock } from '@Global/state/globalState';
import { keepWrites } from '@Assemblies/engines/parts/keepWrites';
import { settleNestedQueue } from './settlePreviewQueue';
import type { EmittedNotice } from './dryRun';
import { finishPreview, type QueueOutcome } from './finishPreview';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { copyPreviewValue, type PrivateState } from './previewState';
import { resolvePreviewDirectives, type PreviewParams, type PrivatePreviewEngine } from './previewBindings';
import {
  getCallRandomSource,
  setCallRandomSource,
  getDevContext,
  getTournamentId,
  getTournamentRecords,
} from '@Global/state/globalState';
import type { Directives } from '@Assemblies/engines/types/engineTypes';

type Bindings = NonNullable<ReturnType<typeof resolvePreviewDirectives>['methods']>;

export function runPrivatePreview(
  state: PrivateState,
  engine: object,
  bindings: Bindings,
  nestedMethods: Record<string, unknown>,
  awaitMethods: boolean,
  snapshotStart: number,
) {
  const executeStart = Date.now();
  const delivered: EmittedNotice[] = [];
  let active = true;
  let customCalled = false;
  function checkScope() {
    if (!active || !state.isCurrent()) throw new Error('Private preview receiver is outside its call');
  }
  const receiver: PrivatePreviewEngine = {
    getState() {
      checkScope();
      return getState({});
    },
    getTournament(params) {
      checkScope();
      return getTournament({ tournamentId: params?.tournamentId });
    },
    executionQueue(nested) {
      checkScope();
      let owned: Directives<string>;
      try {
        owned = copyPreviewValue(nested);
      } catch {
        return { error: ROLLBACK_UNAVAILABLE };
      }
      const invalid = validateDirectives(owned, nestedMethods);
      if (invalid) return invalid;
      const bindings = resolvePreviewDirectives(engine, owned, nestedMethods);
      if (bindings.error) return { error: bindings.error };
      const timeStamp = getCapturedClock()!;
      const settle = (outcome: QueueOutcome) => {
        checkScope();
        return settleNestedQueue(outcome, owned, timeStamp, delivered);
      };
      const onThrow = (error: unknown): never => {
        if (active && state.isCurrent()) keepWrites(timeStamp);
        throw error;
      };
      let result: QueueOutcome | Promise<QueueOutcome>;
      try {
        result = runDirectives(owned, bindings.methods);
      } catch (error) {
        return onThrow(error);
      }
      return result instanceof Promise ? result.then(settle, onThrow) : settle(result);
    },
  };

  function runDirectives(queue: Directives<string>, bindings: Bindings) {
    const results: any[] = [];
    function dispatch(start: number): QueueOutcome | Promise<QueueOutcome> {
      for (let i = start; i < queue.length; i++) {
        checkScope();
        const methodName = queue[i].method;
        const binding = bindings.get(methodName)!;
        const method =
          'builtin' in binding
            ? binding.builtin
            : (params: PreviewParams) => {
                customCalled = true;
                return binding.custom(params, receiver);
              };
        const { params, unthreadedSource } = prepareDirective(queue[i], results);
        const tournamentId = getTournamentId();
        params.activeTournamentId = tournamentId;
        const previous = getCallRandomSource();
        if (unthreadedSource) setCallRandomSource(unthreadedSource);
        const release = () => {
          if (unthreadedSource) setCallRandomSource(previous);
        };
        const started = Date.now();
        const paramsToLog = paramsMayBeLogged(methodName) ? makeDeepCopy(params, undefined, true) : undefined;
        let result;
        try {
          result = resolveEngineMethod({
            method,
            params,
            methodName,
            tournamentId,
            tournamentRecords: getTournamentRecords(),
          });
        } catch (error) {
          release();
          throw error;
        }
        engineLogging({
          result,
          methodName,
          elapsed: Date.now() - started,
          params: paramsToLog,
          engineType: awaitMethods ? 'async' : 'sync',
          dryRun: true,
        });
        if (typeof result?.then === 'function') {
          if (!awaitMethods) {
            release();
            // The sync provider cannot keep a child active across an await.
            Promise.resolve(result).catch(() => undefined);
            return { results, error: ROLLBACK_UNAVAILABLE };
          }
          return Promise.resolve(result)
            .catch((err) => {
              if (getDevContext()) throw err;
              return caughtErrorResult({ methodName, params, err });
            })
            .finally(release)
            .then((settled) => {
              checkScope();
              results.push({ ...settled, methodName });
              return settled?.error ? { results, error: settled.error, refusal: settled } : dispatch(i + 1);
            });
        }
        release();
        results.push({ ...result, methodName });
        if (result?.error) return { results, error: result.error, refusal: result };
      }
      return { results, success: results.every((r) => r.success) };
    }
    return dispatch(0);
  }

  const finish = (outcome: QueueOutcome) => {
    // A registered implementation can retain a reference to its private params after returning.
    // Detach its published results and notices before its descendants can modify them.
    try {
      const result = finishPreview(state, outcome, awaitMethods, snapshotStart, executeStart, delivered);
      return customCalled ? copyPreviewValue(result) : result;
    } catch (error) {
      if (!customCalled) throw error;
      return {
        wouldSucceed: false,
        results: [],
        patch: [],
        willEmitNotices: [],
        error: ROLLBACK_UNAVAILABLE,
        rolledBack: true as const,
      };
    }
  };
  let pending = false;
  try {
    const result = runDirectives(state.directives, bindings);
    if (result instanceof Promise) {
      pending = true;
      return result.then(finish).finally(() => {
        active = false;
      });
    }
    return finish(result);
  } finally {
    if (!pending) active = false;
  }
}
