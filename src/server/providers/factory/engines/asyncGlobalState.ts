import { executionAsyncId, createHook } from 'node:async_hooks';
import {
  CallListenerArgs,
  GetNoticesArgs,
  HandleCaughtErrorArgs,
  ImplemtationGlobalStateTypes,
  Notice,
} from '@Global/state/globalState';

// constants
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD, NOT_FOUND } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * This code enables "global" state for each async execution context.
 * Creates instance state for each async execution context to support multiple concurrent requests.
 * Sample on this page: https://stackabuse.com/using-async-hooks-for-request-context-handling-in-node-js/
 */

const asyncCtxStateMap = new Map();

const asyncHook = createHook({
  init: (asyncId, _, _triggerAsyncId) => {
    if (asyncCtxStateMap.has(_triggerAsyncId)) {
      asyncCtxStateMap.set(asyncId, asyncCtxStateMap.get(_triggerAsyncId));
    }
  },
  destroy: (asyncId) => {
    if (asyncCtxStateMap.has(asyncId)) {
      asyncCtxStateMap.delete(asyncId);
    }
  },
});

asyncHook.enable();

function createInstanceState() {
  const asyncId = executionAsyncId();
  const instanceState: ImplemtationGlobalStateTypes = {
    disableNotifications: false,
    tournamentId: undefined,
    tournamentRecords: {},
    subscriptions: {},
    modified: false,
    notices: [],
    methods: {},
  };

  asyncCtxStateMap.set(asyncId, instanceState);
}

function getInstanceState() {
  const asyncTaskId = executionAsyncId();
  const instanceState = asyncCtxStateMap.get(asyncTaskId);

  if (!instanceState) throw new Error(`Can not get instance state for async task ${asyncTaskId}`);

  return instanceState;
}

export default {
  addNotice,
  callListener,
  createInstanceState,
  cycleMutationStatus,
  deleteNotice,
  deleteNotices,
  disableNotifications,
  enableNotifications,
  getMethods,
  getNotices,
  getPayloads: getNotices, // canonical alias for the deprecated `getNotices`
  getTopics,
  getTournamentId,
  getTournamentRecord,
  getTournamentRecords,
  removeTournamentRecord,
  setMethods,
  setSubscriptions,
  setTournamentId,
  setTournamentRecord,
  setTournamentRecords,
  handleCaughtError,
};

export function disableNotifications() {
  const instanceState = getInstanceState();
  instanceState.disableNotifications = true;
}

export function enableNotifications() {
  const instanceState = getInstanceState();
  instanceState.disableNotifications = false;
}

export function getTournamentId() {
  const instanceState = getInstanceState();
  return instanceState.tournamentId;
}

export function getTournamentRecord(tournamentId) {
  const instanceState = getInstanceState();
  return instanceState.tournamentRecords[tournamentId];
}

export function getTournamentRecords() {
  const instanceState = getInstanceState();
  return instanceState.tournamentRecords;
}

export function setTournamentRecord(tournamentRecord) {
  const tournamentId = tournamentRecord?.tournamentId;
  const instanceState = getInstanceState();
  instanceState.tournamentRecords[tournamentId] = tournamentRecord;
  return { ...SUCCESS };
}

export function setTournamentId(tournamentId) {
  const instanceState = getInstanceState();
  if (!tournamentId) {
    instanceState.tournamentId = undefined;
    return { ...SUCCESS };
  }
  if (instanceState.tournamentRecords[tournamentId]) {
    instanceState.tournamentId = tournamentId;
    return { ...SUCCESS };
  } else {
    return { error: MISSING_TOURNAMENT_RECORD };
  }
}

export function setTournamentRecords(tournamentRecords) {
  const instanceState = getInstanceState();
  instanceState.tournamentRecords = tournamentRecords;
  const tournamentIds = Object.keys(tournamentRecords);
  if (tournamentIds.length === 1) {
    instanceState.tournamentId = tournamentIds[0];
  } else if (!tournamentIds.length) {
    instanceState.tournamentId = undefined;
  }
}

export function removeTournamentRecord(tournamentId) {
  const instanceState = getInstanceState();
  if (typeof tournamentId !== 'string') return { error: INVALID_VALUES };
  if (!instanceState.tournamentRecords[tournamentId]) return { error: NOT_FOUND };

  delete instanceState.tournamentRecords[tournamentId];
  const tournamentIds = Object.keys(instanceState.tournamentRecords);
  if (tournamentIds.length === 1) {
    instanceState.tournamentId = tournamentIds[0];
  } else if (!tournamentIds.length) {
    instanceState.tournamentId = undefined;
  }
  return { ...SUCCESS };
}

function setSubscriptions(params) {
  if (typeof params?.subscriptions !== 'object') return { error: INVALID_VALUES };

  const instanceState = getInstanceState();

  Object.keys(params.subscriptions).forEach((subscription) => {
    if (typeof params.subscriptions[subscription] === 'function') {
      instanceState.subscriptions[subscription] = params.subscriptions[subscription];
    } else {
      delete instanceState.subscriptions[subscription];
    }
  });
  return { ...SUCCESS };
}

function setMethods(params) {
  if (typeof params !== 'object') return { error: INVALID_VALUES };
  const instanceState = getInstanceState();

  Object.keys(params).forEach((methodName) => {
    if (typeof params[methodName] !== 'function') return;
    instanceState.methods[methodName] = params[methodName];
  });
  return { ...SUCCESS };
}

function cycleMutationStatus() {
  const instanceState = getInstanceState();
  const status = instanceState.modified;
  instanceState.modified = false;
  return status;
}

function addNotice({ topic, payload, key }: Notice, isGlobalSubscription?: boolean) {
  if (typeof topic !== 'string' || typeof payload !== 'object') return;
  const instanceState = getInstanceState();
  // if there is a notice then the state has been modified, regardless of whether there is a subscription
  if (!instanceState.disableNotifications) instanceState.modified = true;
  if (instanceState.disableNotifications || (!instanceState.subscriptions[topic] && !isGlobalSubscription)) return;

  if (key) {
    instanceState.notices = instanceState.notices.filter((notice) => !(notice.topic === topic && notice.key === key));
  }
  // NOTE: when backend does not recognize undefined for updates
  // params = undefinedToNull(params) // => see object.js utils

  instanceState.notices.push({ topic, payload, key });

  return { ...SUCCESS };
}

function getMethods() {
  const instanceState = getInstanceState();
  return instanceState.methods ?? {};
}

function getNotices({ topic }: GetNoticesArgs) {
  const instanceState = getInstanceState();
  return instanceState.notices.filter((notice) => notice.topic === topic).map((notice) => notice.payload);
}

function deleteNotices() {
  const instanceState = getInstanceState();
  instanceState.notices = [];
}

function deleteNotice({ key, topic }) {
  const instanceState = getInstanceState();
  // Delete only notices matching the key AND (when a topic is supplied) that
  // topic. The prior form `(!topic || topic===) && key!==` deleted every notice
  // of OTHER topics whenever a topic was passed. No-topic behaviour (purge by
  // key across all topics) is unchanged. Mirrors syncGlobalState.deleteNotice.
  instanceState.notices = instanceState.notices.filter(
    (notice) => !((!topic || notice.topic === topic) && notice.key === key),
  );
}

function getTopics() {
  const instanceState = getInstanceState();
  const topics = Object.keys(instanceState.subscriptions);
  return { topics };
}

async function callListener({ topic, payloads, notices }: CallListenerArgs, globalSubscriptions?: any) {
  // back-compat: accept either `payloads` (canonical) or `notices` (deprecated alias).
  const data = payloads ?? notices ?? [];
  const instanceState = getInstanceState();
  const method = instanceState.subscriptions[topic];
  if (method && typeof method === 'function') await method(data);
  const globalMethod = globalSubscriptions?.[topic];
  if (globalMethod && typeof globalMethod === 'function') await globalMethod(data);
}

export function handleCaughtError({ engineName, methodName, params, err }: HandleCaughtErrorArgs) {
  let error;
  if (typeof err === 'string') {
    error = err.toUpperCase();
  } else if (err instanceof Error) {
    error = err.message;
  }

  console.log('ERROR', {
    tournamentId: getTournamentId(),
    params: JSON.stringify(params),
    engine: engineName,
    methodName,
    error,
  });
}
