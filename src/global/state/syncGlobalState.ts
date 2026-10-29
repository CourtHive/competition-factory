import { modifiedTournamentId, noticeModifies, preserveNoticeIdentity, UNNAMED_TOURNAMENT } from './noticeIdentity';
import {
  CallListenerArgs,
  DeleteNoticeArgs,
  GetNoticesArgs,
  HandleCaughtErrorArgs,
  ImplemtationGlobalStateTypes,
  Notice,
} from './globalState';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import {
  INVALID_TOURNAMENT_RECORD,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';

const syncGlobalState: ImplemtationGlobalStateTypes = {
  disableNotifications: false,
  tournamentId: undefined,
  tournamentRecords: {},
  subscriptions: {},
  modified: false,
  modifiedTournamentIds: new Set(),
  methods: {},
  notices: [],
};

export default {
  addNotice,
  callListener,
  cycleMutationStatus,
  cycleModifiedTournamentIds,
  markModified,
  getCapturedClock,
  setCapturedClock,
  getCapturedCompetitionClock,
  setCapturedCompetitionClock,
  getCapturedStamps,
  setCapturedStamps,
  getCallRandomSource,
  setCallRandomSource,
  deleteNotice,
  deleteNotices,
  disableNotifications,
  enableNotifications,
  getMethods,
  getNoticeBuffer,
  getNotices,
  getPayloads: getNotices, // canonical alias for the deprecated `getNotices`
  getTopics,
  getTournamentId,
  getTournamentRecord,
  getTournamentRecords,
  removeTournamentRecord,
  setMethods,
  setNoticeBuffer,
  setMutationStatus,
  setSubscriptions,
  setTournamentId,
  setTournamentRecord,
  setTournamentRecords,
  handleCaughtError,
};

export function getCapturedClock(): number | undefined {
  return syncGlobalState.capturedClock;
}

export function setCapturedClock(timeStamp?: number): void {
  syncGlobalState.capturedClock = timeStamp;
}

export function getCapturedCompetitionClock(): number | undefined {
  return syncGlobalState.capturedCompetitionClock;
}

export function setCapturedCompetitionClock(timeStamp?: number): void {
  syncGlobalState.capturedCompetitionClock = timeStamp;
}

export function getCapturedStamps(): WeakSet<object> | undefined {
  return syncGlobalState.capturedStamps;
}

export function setCapturedStamps(stamps?: WeakSet<object>): void {
  syncGlobalState.capturedStamps = stamps;
}

export function getCallRandomSource(): (() => number) | undefined {
  return syncGlobalState.callRandomSource;
}

export function setCallRandomSource(source?: () => number): void {
  syncGlobalState.callRandomSource = source;
}

export function disableNotifications(): void {
  syncGlobalState.disableNotifications = true;
}

export function enableNotifications(): void {
  syncGlobalState.disableNotifications = false;
}

export function getTournamentId(): string | undefined {
  return syncGlobalState.tournamentId;
}

export function getTournamentRecord(tournamentId): Tournament {
  return syncGlobalState.tournamentRecords[tournamentId];
}

export function getTournamentRecords() {
  return syncGlobalState.tournamentRecords;
}

export function setTournamentRecord(tournamentRecord) {
  const tournamentId = tournamentRecord?.tournamentId;
  if (tournamentId) {
    syncGlobalState.tournamentRecords[tournamentId] = tournamentRecord;
    return { success: true };
  } else {
    return { error: INVALID_TOURNAMENT_RECORD };
  }
}

export function setTournamentId(tournamentId) {
  if (!tournamentId) {
    syncGlobalState.tournamentId = undefined;
    return { success: true };
  }
  if (syncGlobalState.tournamentRecords[tournamentId]) {
    syncGlobalState.tournamentId = tournamentId;
    return { success: true };
  } else {
    return { error: MISSING_TOURNAMENT_RECORD };
  }
}

export function setTournamentRecords(tournamentRecords: { [key: string]: Tournament }): void {
  syncGlobalState.tournamentRecords = tournamentRecords;
  const tournamentIds = Object.keys(tournamentRecords);
  if (tournamentIds.length === 1) {
    syncGlobalState.tournamentId = tournamentIds[0];
  } else if (!tournamentIds.length) {
    syncGlobalState.tournamentId = undefined;
  }
}

export function removeTournamentRecord(tournamentId) {
  if (typeof tournamentId !== 'string') return { error: INVALID_VALUES };
  if (!syncGlobalState.tournamentRecords[tournamentId]) return { error: NOT_FOUND };

  delete syncGlobalState.tournamentRecords[tournamentId];
  const tournamentIds = Object.keys(syncGlobalState.tournamentRecords);
  if (tournamentIds.length === 1) {
    syncGlobalState.tournamentId = tournamentIds[0];
  } else if (!tournamentIds.length) {
    syncGlobalState.tournamentId = undefined;
  }
  return { success: true };
}

export function setSubscriptions(params: any) {
  if (params.subscriptions === null || Object.keys(params.subscriptions).length === 0) {
    syncGlobalState.subscriptions = {};
    return { ...SUCCESS };
  }
  if (typeof params.subscriptions !== 'object') return { error: INVALID_VALUES };

  Object.keys(params.subscriptions).forEach((subscription) => {
    if (typeof params.subscriptions[subscription] === 'function') {
      syncGlobalState.subscriptions[subscription] = params.subscriptions[subscription];
    } else {
      delete syncGlobalState.subscriptions[subscription];
    }
  });

  return { ...SUCCESS };
}

export function setMethods(params: { [key: string]: any }) {
  if (typeof params !== 'object') return { error: INVALID_VALUES };

  Object.keys(params).forEach((methodName) => {
    if (typeof params[methodName] !== 'function') return;
    syncGlobalState.methods[methodName] = params[methodName];
  });
  return { ...SUCCESS };
}

export function cycleMutationStatus() {
  const status = syncGlobalState.modified;
  syncGlobalState.modified = false;
  return status;
}

// optional: the tournaments the call modified, cleared as they are read (see getMutationStatus)
export function cycleModifiedTournamentIds(): Set<string> {
  const tournamentIds = syncGlobalState.modifiedTournamentIds ?? new Set<string>();
  syncGlobalState.modifiedTournamentIds = new Set();
  return tournamentIds;
}

// optional: marks a write modified without announcing it (a write made with suppressNotifications), the tournament
// named, or every loaded record when none is
export function markModified(tournamentId?: string) {
  syncGlobalState.modified = true;
  syncGlobalState.modifiedTournamentIds ??= new Set();
  syncGlobalState.modifiedTournamentIds.add(tournamentId || UNNAMED_TOURNAMENT);
}

// optional: sets the flag back to a value `cycleMutationStatus` returned (see globalState.readMutationStatus)
export function setMutationStatus(status: boolean) {
  syncGlobalState.modified = status;
}

export function addNotice({ topic, payload, key }: Notice, isGlobalSubscription?: boolean) {
  if (typeof topic !== 'string' || typeof payload !== 'object') return;
  // if there is a notice then the state has been modified, regardless of whether there is a subscription: the
  // tournament it names (every loaded record when it names none), unless it only reports
  if (!syncGlobalState.disableNotifications && noticeModifies(topic)) markModified(modifiedTournamentId(payload));
  if (syncGlobalState.disableNotifications || (!syncGlobalState.subscriptions[topic] && !isGlobalSubscription)) return;

  let outgoing = payload;

  if (key) {
    const retained: any[] = [];
    for (const notice of syncGlobalState.notices) {
      if (notice.topic === topic && notice.key === key) {
        // superseded — but its identity is still true of this key, so do not discard it
        outgoing = preserveNoticeIdentity(outgoing, notice.payload);
      } else {
        retained.push(notice);
      }
    }
    syncGlobalState.notices = retained;
  }

  syncGlobalState.notices.push({ topic, payload: outgoing, key });

  return { ...SUCCESS };
}

export function getMethods() {
  return syncGlobalState.methods ?? {};
}

export function getNotices({ topic }: GetNoticesArgs) {
  return syncGlobalState.notices.filter((notice) => notice.topic === topic).map((notice) => notice.payload);
}

export function deleteNotices() {
  syncGlobalState.notices = [];
}

// The whole buffer, for an operation that must restore it on rollback: a refused write's notices
// must not survive it, and an enclosing operation's earlier notices must. Notices are never edited
// in place (a keyed add rebuilds the array), so a shallow copy is a faithful capture.
export function getNoticeBuffer(): Notice[] {
  return [...syncGlobalState.notices];
}

export function setNoticeBuffer(notices: Notice[]) {
  syncGlobalState.notices = [...notices];
}

export function deleteNotice({ topic, key }: DeleteNoticeArgs) {
  // Delete only notices matching the key AND (when a topic is supplied) that
  // topic. The prior form `(!topic || topic===) && key!==` deleted every notice
  // of OTHER topics whenever a topic was passed — a footgun for any caller that
  // scopes a purge by topic. No-topic behaviour (purge by key across all topics)
  // is unchanged.
  syncGlobalState.notices = syncGlobalState.notices.filter(
    (notice) => !((!topic || notice.topic === topic) && notice.key === key),
  );
}

export function getTopics(): { topics: string[] } {
  const topics: string[] = Object.keys(syncGlobalState.subscriptions);
  return { topics };
}

export function callListener({ topic, payloads, notices }: CallListenerArgs, globalSubscriptions?: any) {
  // back-compat: accept either `payloads` (canonical) or `notices` (deprecated alias).
  const data = payloads ?? notices ?? [];
  const method = syncGlobalState.subscriptions[topic];
  if (method && typeof method === 'function') method(data);
  const globalMethod = globalSubscriptions?.[topic];
  if (globalMethod && typeof globalMethod === 'function') globalMethod(data);
}

export function handleCaughtError({ engineName, methodName, params, err }: HandleCaughtErrorArgs) {
  let error;
  if (typeof err === 'string') {
    error = err.toUpperCase();
  } else if (err instanceof Error) {
    error = err.message;
  }

  // Engine-level error sink, like globalState's own. It must NOT route through pushGlobalLog:
  // globalLog imports getDevContext from globalState, and globalState imports THIS module, so that
  // edge closes a cycle (globalState -> syncGlobalState -> globalLog -> globalState) which rollup
  // reports on every build.
  // eslint-disable-next-line no-console
  console.log('ERROR', {
    tournamentId: getTournamentId(),
    params: JSON.stringify(params),
    engine: engineName,
    methodName,
    error,
  });

  return { error };
}
