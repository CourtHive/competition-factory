import { isFunction, isObject } from '@Tools/objects';
import syncGlobalState from './syncGlobalState';
import { isNumeric } from '@Tools/math';

// constants and types
import { OUTCOME_PIPELINE_V1, OutcomePipelineMode, outcomePipelineModes } from '@Constants/outcomePipelineConstants';
import { BRIDGE, LEGACY, NATIVE, SchemaWriteMode, schemaWriteModes } from '@Constants/schemaWriteModeConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_ASYNC_STATE_PROVIDER,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// Re-exported so any OTHER implementation of the notice buffer — competition-factory-server supplies
// its own provider for per-request async isolation — calls THIS merge rather than copying it.
export { preserveNoticeIdentity, NOTICE_IDENTITY_FIELDS } from './noticeIdentity';

export type Notice = {
  topic: string;
  payload: any;
  key?: string;
};

type TimerType = {
  elapsedTime: number;
  startTime?: number;
  state?: string;
};
type timersType = {
  [key: string]: TimerType;
  default: TimerType;
};

type DeepCopyType = {
  threshold?: number;
  modulate?: any;
  stringify: string[];
  ignore: any;
  toJSON: string[];
};

export type DevContextType =
  | {
      errors?: boolean | string[]; // log errors for all methods or specified methods
      params?: boolean | string[]; // log params for all methods or specified methods
      result?: boolean | string[]; // log result for all methods or specified methods
      exclude?: string[]; // exclude logging for specified methods
      [key: string]: any;
    }
  | boolean;

type GlobalStateTypes = {
  globalSubscriptions: { [key: string]: any };
  globalMethods: { [key: string]: any };
  deepCopyAttributes: DeepCopyType;
  devContext?: DevContextType; // devContext is used to control logging
  schemaWriteMode: SchemaWriteMode; // controls extension vs first-class write behavior
  outcomePipeline: OutcomePipelineMode; // which outcome pipeline decides: v1, v2, or both (differential)
  saveDrawDeletions: boolean; // opt-in: persist drawDeletions audit on the record
  auditAuthorityServer: boolean; // true on server engines — suppresses local audit writes
  timers: timersType; // timers are used to track elapsed time for methods
  deepCopy: boolean;
  globalLog?: any;
};

export type ImplemtationGlobalStateTypes = {
  tournamentRecords: TournamentRecords;
  subscriptions: { [key: string]: any };
  methods: { [key: string]: any };
  disableNotifications: boolean;
  tournamentId?: string;
  notices: Notice[];
  modified: boolean;
  capturedClock?: number; // epoch ms an outer engine call captured; see tools/clock.ts
  capturedCompetitionClock?: number; // likewise, when a competition provider is installed
  capturedStamps?: WeakSet<object>; // the entities an outer engine call has stamped `updatedAt` on; see tools/clock.ts
  callRandomSource?: () => number; // a seeded engine call's stream for unthreaded draws; see tools/prng.ts
};

const globalState: GlobalStateTypes = {
  timers: { default: { elapsedTime: 0 } },
  globalSubscriptions: {},
  deepCopyAttributes: {
    stringify: [],
    ignore: [],
    toJSON: [],
  },
  globalMethods: [],
  schemaWriteMode: NATIVE,
  outcomePipeline: OUTCOME_PIPELINE_V1,
  saveDrawDeletions: false,
  auditAuthorityServer: false,
  deepCopy: true,
};

let _globalStateProvider: any = syncGlobalState;

const requiredStateProviderMethods = [
  'addNotice',
  'callListener',
  'cycleMutationStatus',
  'deleteNotice',
  'deleteNotices',
  'disableNotifications',
  'enableNotifications',
  'getMethods',
  'getNotices',
  'getTopics',
  'getTournamentId',
  'getTournamentRecord',
  'getTournamentRecords',
  'removeTournamentRecord',
  'setSubscriptions',
  'setTournamentId',
  'setTournamentRecord',
  'setTournamentRecords',
];

export function setStateProvider(globalStateProvider?: { [key: string]: any }) {
  // isObject, not `typeof === 'object'`: null passed that test and then threw an incidental TypeError
  if (!globalStateProvider || !isObject(globalStateProvider)) {
    throw new Error(`Global state provider can not be undefined or null`);
  } else {
    // presence, not callability: a provider that never calls a method it stubs has always installed
    const providerMethods = requiredStateProviderMethods.filter((name) => name in globalStateProvider);
    if (providerMethods.length !== requiredStateProviderMethods.length) {
      throw new Error('Global state provider is missing required methods');
    } else {
      _globalStateProvider = globalStateProvider;
      // optional, so a provider that predates them still installs; but without them an engine call
      // cannot hold one instant (tools/clock.ts), and that must not degrade silently
      if (!isFunction(globalStateProvider.getCapturedClock) || !isFunction(globalStateProvider.setCapturedClock)) {
        console.warn(
          '[globalState] the state provider has no getCapturedClock/setCapturedClock: engine calls will read ' +
            'the clock per call site instead of capturing one instant per call. See tools/clock.ts.',
        );
      }
      return { success: true };
    }
  }
}

export function createInstanceState() {
  //Only applicable for async
  if (_globalStateProvider.createInstanceState) {
    try {
      _globalStateProvider.createInstanceState();
    } catch (error) {
      return { error };
    }
    return { success: true };
  } else {
    return { error: MISSING_ASYNC_STATE_PROVIDER };
  }
}

/**
 * if contextCriteria, check whether all contextCriteria keys values are equivalent with globalState.devContext object
 */
export function getDevContext(contextCriteria?: { [key: string]: any }): DevContextType {
  if (!contextCriteria || typeof contextCriteria !== 'object') {
    return globalState.devContext ?? false;
  } else {
    if (typeof globalState.devContext !== 'object') return false;
    return (
      Object.keys(contextCriteria).every((key) => globalState.devContext?.[key] === contextCriteria[key]) &&
      globalState.devContext
    );
  }
}

export function timeKeeper(action: string = 'reset', timer: string = 'default'): any {
  const timeNow = Date.now();

  if (action === 'report') {
    if (timer === 'allTimers') {
      const timers = Object.keys(globalState.timers);
      return timers
        .filter((timer) => timer !== 'default' || globalState.timers[timer].startTime)
        .map((timer) => {
          const currentTimer = globalState.timers[timer];
          const elapsedPeriod =
            currentTimer.state === 'stopped' ? 0 : (timeNow - (currentTimer?.startTime ?? 0)) / 1000;

          const elapsedTime = currentTimer.elapsedTime + elapsedPeriod;
          return {
            state: globalState.timers[timer].state,
            elapsedTime: elapsedTime.toFixed(2),
            timer,
          };
        });
    } else {
      const elapsedPeriod =
        globalState.timers[timer].state === 'stopped'
          ? 0
          : (timeNow - (globalState.timers[timer]?.startTime ?? 0)) / 1000;

      const elapsedTime = globalState.timers[timer].elapsedTime + elapsedPeriod;

      return {
        state: globalState.timers[timer].state,
        elapsedTime: elapsedTime.toFixed(2),
        timer,
      };
    }
  }

  if (!globalState.timers[timer] || action === 'reset') {
    if (timer === 'allTimers') {
      globalState.timers = { default: { elapsedTime: 0 } };
      return true;
    } else {
      globalState.timers[timer] = {
        startTime: timeNow,
        state: 'active',
        elapsedTime: 0,
      };
    }
  }

  if (!globalState.timers[timer].elapsedTime) globalState.timers[timer].elapsedTime = 0;

  action === 'stop' &&
    globalState.timers[timer].state !== 'stopped' &&
    (globalState.timers[timer].state = 'stopped') &&
    (globalState.timers[timer].elapsedTime += (timeNow - (globalState.timers[timer]?.startTime ?? 0)) / 1000);
  action === 'start' && (globalState.timers[timer].startTime = timeNow) && (globalState.timers[timer].state = 'active');

  return globalState.timers[timer];
}

export function setGlobalLog(loggingFx?: any) {
  if (isFunction(loggingFx)) {
    globalState.globalLog = loggingFx;
  } else {
    delete globalState.globalLog;
  }
}

export function setDevContext(value?: DevContextType) {
  globalState.devContext = value;
}

/**
 * An observer of every engine method execution, process-wide. `executeFunction` (the common path
 * for direct calls, `executionQueue` directives and the async engine) reports `before` with the
 * caller's params and `after` with the result. Nothing in production sets it; the golden corpus
 * recorder does, to harvest the test suite into scenarios. An observer may call engine queries
 * from the `after` phase; it must guard its own re-entrancy, because those calls are observed too.
 * `setInvokeObserver()` with no argument removes it.
 */
export type InvokeEvent = {
  phase: 'before' | 'after';
  methodName: string;
  engineType: string;
  params?: any;
  result?: any;
};
export type InvokeObserver = (event: InvokeEvent) => void;

let invokeObserver: InvokeObserver | undefined;

export function setInvokeObserver(observer?: InvokeObserver): { success?: boolean; error?: ErrorType } {
  if (observer !== undefined && typeof observer !== 'function') return { error: INVALID_VALUES };
  invokeObserver = observer;
  return { ...SUCCESS };
}

export function getInvokeObserver(): InvokeObserver | undefined {
  return invokeObserver;
}

/**
 * The instant an outer engine call captured (tools/clock.ts `withCapturedClock`). Optional provider
 * hooks: a provider without them captures nothing. Deliberately NOT a process-wide fallback, which
 * would hand one request's instant to every request running concurrently with it.
 */
export function getCapturedClock(): number | undefined {
  return _globalStateProvider.getCapturedClock?.();
}

export function setCapturedClock(timeStamp?: number) {
  _globalStateProvider.setCapturedClock?.(timeStamp);
}

/**
 * The competition instant an outer engine call captured, held only while a competition provider is
 * installed (tools/clock.ts `setCompetitionClock`). Optional hooks like the two above; a provider
 * without them makes competition reads go to the provider at each call.
 */
export function getCapturedCompetitionClock(): number | undefined {
  return _globalStateProvider.getCapturedCompetitionClock?.();
}

export function setCapturedCompetitionClock(timeStamp?: number) {
  _globalStateProvider.setCapturedCompetitionClock?.(timeStamp);
}

/**
 * The entities an outer engine call has stamped `updatedAt` on, so each is stamped once per call (F2 (i), CA
 * 2026-10-19). Opened and released with the captured clock. Optional hooks like it: a provider without them has no
 * ledger, and an entity is then stamped at each notice, as before.
 */
export function getCapturedStamps(): WeakSet<object> | undefined {
  return _globalStateProvider.getCapturedStamps?.();
}

export function setCapturedStamps(stamps?: WeakSet<object>) {
  _globalStateProvider.setCapturedStamps?.(stamps);
}

/**
 * The random stream a seeded engine call scoped for the draws its seed does not reach through `random`
 * (tools/prng.ts `withCallRandomSource`). Optional provider hooks, like the captured clock: a provider without
 * them scopes nothing, and is deliberately NOT given a process-wide fallback, which would hand one request's
 * seeded stream to every request running concurrently with it.
 */
export function getCallRandomSource(): (() => number) | undefined {
  return _globalStateProvider.getCallRandomSource?.();
}

export function setCallRandomSource(source?: () => number) {
  _globalStateProvider.setCallRandomSource?.(source);
}

export function setSchemaWriteMode(mode?: SchemaWriteMode): {
  success?: boolean;
  error?: ErrorType;
} {
  if (mode === undefined) {
    globalState.schemaWriteMode = NATIVE;
    return { ...SUCCESS };
  }
  if (!schemaWriteModes.includes(mode)) return { error: INVALID_VALUES };
  globalState.schemaWriteMode = mode;
  return { ...SUCCESS };
}

export function getSchemaWriteMode(): SchemaWriteMode {
  return globalState.schemaWriteMode;
}

export function setOutcomePipeline(mode?: OutcomePipelineMode): { success?: boolean; error?: ErrorType } {
  if (mode === undefined) {
    globalState.outcomePipeline = OUTCOME_PIPELINE_V1;
    return { ...SUCCESS };
  }
  if (!outcomePipelineModes.includes(mode)) return { error: INVALID_VALUES };
  globalState.outcomePipeline = mode;
  return { ...SUCCESS };
}

export function getOutcomePipeline(): OutcomePipelineMode {
  return globalState.outcomePipeline;
}

export function writeNativeEnabled(): boolean {
  return globalState.schemaWriteMode === NATIVE || globalState.schemaWriteMode === BRIDGE;
}

export function writeLegacyEnabled(): boolean {
  return globalState.schemaWriteMode === LEGACY || globalState.schemaWriteMode === BRIDGE;
}

export function setSaveDrawDeletions(flag?: boolean): { success?: boolean; error?: ErrorType } {
  if (flag === undefined) {
    globalState.saveDrawDeletions = false;
    return { ...SUCCESS };
  }
  if (typeof flag !== 'boolean') return { error: INVALID_VALUES };
  globalState.saveDrawDeletions = flag;
  return { ...SUCCESS };
}

export function getSaveDrawDeletions(): boolean {
  return globalState.saveDrawDeletions;
}

export function setAuditAuthorityServer(flag?: boolean): { success?: boolean; error?: ErrorType } {
  if (flag === undefined) {
    globalState.auditAuthorityServer = false;
    return { ...SUCCESS };
  }
  if (typeof flag !== 'boolean') return { error: INVALID_VALUES };
  globalState.auditAuthorityServer = flag;
  return { ...SUCCESS };
}

export function getAuditAuthorityServer(): boolean {
  return globalState.auditAuthorityServer;
}

export function disableNotifications() {
  _globalStateProvider.disableNotifications();
}

export function enableNotifications() {
  _globalStateProvider.enableNotifications();
}

export type DeepCopyAttributes = {
  threshold?: number;
  stringify?: string[];
  ignore?: string[];
  toJSON?: string[];
};

export function setDeepCopy(value: boolean, attributes: DeepCopyAttributes) {
  if (typeof value === 'boolean') globalState.deepCopy = value;
  if (typeof attributes === 'object') {
    if (Array.isArray(attributes.ignore)) globalState.deepCopyAttributes.ignore = attributes.ignore;
    if (Array.isArray(attributes.toJSON)) globalState.deepCopyAttributes.toJSON = attributes.toJSON;
    if (Array.isArray(attributes.stringify)) globalState.deepCopyAttributes.stringify = attributes.stringify;
    if (attributes.threshold) globalState.deepCopyAttributes.threshold = attributes.threshold;
  }
}

export function deepCopyEnabled() {
  return {
    enabled: globalState.deepCopy,
    ...globalState.deepCopyAttributes,
  };
}

export function setGlobalSubscriptions(params: any) {
  if (!params?.subscriptions) return { error: MISSING_VALUE, info: 'missing subscriptions' };

  Object.keys(params.subscriptions).forEach((subscription) => {
    globalState.globalSubscriptions[subscription] = params.subscriptions[subscription];
  });

  return { ...SUCCESS };
}

export function setSubscriptions(params: any) {
  if (!params?.subscriptions) return { error: MISSING_VALUE, info: 'missing subscriptions' };
  return _globalStateProvider.setSubscriptions({ subscriptions: params.subscriptions });
}

export function setGlobalMethods(params?: { [key: string]: any }) {
  if (!params) return { error: MISSING_VALUE, info: 'missing method declarations' };
  if (typeof params !== 'object') return { error: INVALID_VALUES };
  Object.keys(params).forEach((methodName) => {
    if (!isFunction(params[methodName])) return;
    globalState.globalMethods[methodName] = params[methodName];
  });

  return { ...SUCCESS };
}

export function setMethods(params?: { [key: string]: any }) {
  if (!params) return { error: MISSING_VALUE, info: 'missing method declarations' };
  if (typeof params !== 'object') return { error: INVALID_VALUES };
  // not in requiredStateProviderMethods, so a provider may lack it: refuse rather than throw
  if (!isFunction(_globalStateProvider.setMethods))
    return { error: INVALID_VALUES, info: 'provider has no setMethods' };
  return _globalStateProvider.setMethods(params);
}

export function cycleMutationStatus() {
  return _globalStateProvider.cycleMutationStatus();
}

/**
 * The mutation flag as it stands, read WITHOUT clearing it, for an operation that may need to restore it (a
 * differential divergence). `undefined` when the provider cannot set the flag back (the optional `setMutationStatus`):
 * reading it through `cycleMutationStatus` alone would clear it.
 */
export function readMutationStatus(): boolean | undefined {
  if (!isFunction(_globalStateProvider.setMutationStatus)) return undefined;
  const status = _globalStateProvider.cycleMutationStatus();
  _globalStateProvider.setMutationStatus(status);
  return status;
}

/**
 * Restores a flag captured by `readMutationStatus`. Without the optional hook the flag is cleared, as a rollback
 * clears it: a record left unstamped after an enclosing write is the lesser fault, beside stamping one left unchanged.
 */
export function restoreMutationStatus(status?: boolean) {
  if (status !== undefined && isFunction(_globalStateProvider.setMutationStatus))
    return _globalStateProvider.setMutationStatus(status);
  return _globalStateProvider.cycleMutationStatus();
}

export function addNotice(notice: Notice) {
  if (typeof notice?.topic !== 'string') return;
  const isGlobalSubscription = globalState.globalSubscriptions[notice.topic];
  return _globalStateProvider.addNotice(notice, isGlobalSubscription);
}

export type GetNoticesArgs = {
  topic: string;
};

export function getMethods(): { [key: string]: any } {
  return { ...globalState.globalMethods, ..._globalStateProvider.getMethods() };
}

/**
 * Returns the buffered payloads for `topic` (one per addNotice call since the
 * last `deleteNotices`). Despite the historic name, the returned array is NOT
 * `Notice[]` — each entry is the unwrapped `Notice.payload`. Prefer
 * `getPayloads` in new code.
 *
 * @deprecated Use `getPayloads`.
 */
export function getNotices(params: GetNoticesArgs): any[] {
  return getPayloads(params);
}

/**
 * Returns the buffered payloads for `topic`. Each entry is the `payload` field
 * from a Notice that `addNotice` accumulated since the last `deleteNotices`.
 *
 * Falls back to the provider's `getNotices` method when `getPayloads` is not
 * exposed (back-compat with pre-5.0.0 providers).
 */
export function getPayloads(params: GetNoticesArgs): any[] {
  if (typeof _globalStateProvider.getPayloads === 'function') {
    return _globalStateProvider.getPayloads(params);
  }
  return _globalStateProvider.getNotices(params);
}

export type DeleteNoticeArgs = {
  topic?: string;
  key: string;
};
export function deleteNotice({ key, topic }: DeleteNoticeArgs) {
  return _globalStateProvider.deleteNotice({ key, topic });
}

export function deleteNotices() {
  return _globalStateProvider.deleteNotices();
}

/**
 * The notice buffer as it stands, for an operation that may need to restore it (rollback, dryRun).
 * `undefined` when the provider cannot expose it; `setNoticeBuffer` then falls back to deleting.
 */
export function getNoticeBuffer(): Notice[] | undefined {
  return isFunction(_globalStateProvider.getNoticeBuffer) ? _globalStateProvider.getNoticeBuffer() : undefined;
}

/**
 * Restores a buffer captured by `getNoticeBuffer`. A provider without the optional pair cannot restore,
 * so the buffer is emptied instead: losing an enclosing operation's notices is the lesser fault, beside
 * delivering a notice for a write that was rolled back.
 */
export function setNoticeBuffer(notices?: Notice[]) {
  if (notices && isFunction(_globalStateProvider.setNoticeBuffer)) return _globalStateProvider.setNoticeBuffer(notices);
  return _globalStateProvider.deleteNotices();
}

/**
 * Every topic a notice can be delivered on: the provider's subscriptions AND the global ones.
 * `addNotice` buffers for a global-only subscription, so a topic list without them buffered
 * notices that `notifySubscribers` then never delivered.
 */
export function getTopics(): { topics: string[] } {
  const topics: string[] = _globalStateProvider.getTopics()?.topics ?? [];
  const globalTopics = Object.keys(globalState.globalSubscriptions).filter(
    (topic) => isFunction(globalState.globalSubscriptions[topic]) && !topics.includes(topic),
  );
  return { topics: [...topics, ...globalTopics] };
}

export function hasTopic(topic) {
  return getTopics()?.topics?.includes(topic);
}

/**
 * Argument shape for the subscription dispatch.
 *
 * `payloads` is an array of `payload` values (one per buffered notice for the
 * topic in this dispatch cycle) — NOT `Notice[]`. Each subscription callback
 * receives this array as its sole argument; see `callListener` in
 * `syncGlobalState.ts` for the actual fan-out.
 *
 * `notices` is a back-compat alias for `payloads`, retained because external
 * providers (e.g. competition-factory-server's local async provider) used to
 * destructure that name. New code should use `payloads`; the deprecated alias
 * will be removed in a future major.
 */
export type CallListenerArgs = {
  payloads: any[];
  /** @deprecated alias for `payloads`; kept for back-compat with pre-5.0.0 providers. */
  notices?: any[];
  topic: string;
};
export async function callListener(payload) {
  return _globalStateProvider.callListener(payload, globalState.globalSubscriptions);
}

export function getTournamentId() {
  return _globalStateProvider.getTournamentId();
}

export function getTournamentRecord(tournamentId: string) {
  return _globalStateProvider.getTournamentRecord(tournamentId);
}

export function getTournamentRecords() {
  return _globalStateProvider.getTournamentRecords();
}

export function setTournamentRecord(tournamentRecord: ResultType) {
  return _globalStateProvider.setTournamentRecord(tournamentRecord);
}

export function setTournamentRecords(tournamentRecords: any) {
  return _globalStateProvider.setTournamentRecords(tournamentRecords);
}

export function setTournamentId(tournamentId?: string): {
  success?: boolean;
  error?: ErrorType;
} {
  return _globalStateProvider.setTournamentId(tournamentId);
}

export function removeTournamentRecord(tournamentId: string) {
  return _globalStateProvider.removeTournamentRecord(tournamentId);
}

export function getProvider() {
  return _globalStateProvider;
}

export type HandleCaughtErrorArgs = {
  engineName?: string;
  methodName: string;
  params: any;
  err: any;
};

export function handleCaughtError({ engineName, methodName, params, err }: HandleCaughtErrorArgs) {
  const caughtErrorHandler =
    (isFunction(_globalStateProvider.handleCaughtError) && _globalStateProvider.handleCaughtError) ||
    syncGlobalState.handleCaughtError;

  // do not return tournamentRecord in error log if it was passed in params
  const { tournamentRecord, ...rest } = params;
  !!tournamentRecord;

  return caughtErrorHandler({
    params: rest,
    engineName,
    methodName,
    err,
  });
}

export function globalLog(log: any, engine?: string) {
  if (globalState.globalLog) {
    try {
      globalState.globalLog({ log, engine });
    } catch (error) {
      console.log('globalLog error', error);
      console.log(engine, log);
      setGlobalLog(); // delete failing custom globalLog
    }
  } else {
    console.log(engine, log);
  }
}

export function setStateMethods(submittedMethods, traverse, maxDepth, global) {
  if (!isObject(submittedMethods)) return { error: INVALID_VALUES };
  if (!isNumeric) maxDepth = 1;

  const collectionFilter = Array.isArray(traverse) ? traverse : [];
  const methods = {};
  const attrWalker = (obj, depth = 0) => {
    Object.keys(obj).forEach((key) => {
      if (isFunction(obj[key])) {
        methods[key] = obj[key];
      } else if (
        isObject(obj[key]) &&
        (traverse === true || collectionFilter?.includes(key)) &&
        (maxDepth === undefined || depth < maxDepth)
      ) {
        attrWalker(obj[key], depth + 1);
      }
    });
  };
  attrWalker(submittedMethods);

  global ? setGlobalMethods(methods) : setMethods(methods);

  return { methods };
}
