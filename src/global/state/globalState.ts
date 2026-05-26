import { isFunction, isObject } from '@Tools/objects';
import syncGlobalState from './syncGlobalState';
import { intersection } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';

// constants and types
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { DUAL, LEGACY, NATIVE, SchemaWriteMode, schemaWriteModes } from '@Constants/schemaWriteModeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_ASYNC_STATE_PROVIDER,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

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
  if (typeof globalStateProvider !== 'object') {
    throw new Error(`Global state provider can not be undefined or null`);
  } else {
    const providerMethods = intersection(Object.keys(globalStateProvider), requiredStateProviderMethods);
    if (providerMethods.length !== requiredStateProviderMethods.length) {
      throw new Error('Global state provider is missing required methods');
    } else {
      _globalStateProvider = globalStateProvider;
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

export function writeNativeEnabled(): boolean {
  return globalState.schemaWriteMode === NATIVE || globalState.schemaWriteMode === DUAL;
}

export function writeLegacyEnabled(): boolean {
  return globalState.schemaWriteMode === LEGACY || globalState.schemaWriteMode === DUAL;
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
  return _globalStateProvider.setMethods(params);
}

export function cycleMutationStatus() {
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

export function getNotices(params: GetNoticesArgs): string[] {
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

export function getTopics() {
  return _globalStateProvider.getTopics();
}

export function hasTopic(topic) {
  return getTopics()?.topics?.includes(topic);
}

export type CallListenerArgs = {
  notices: Notice[];
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
