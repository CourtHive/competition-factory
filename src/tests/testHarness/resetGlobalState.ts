import { resetSanctioningState } from '@Assemblies/engines/sanctioning/sanctioningState';
import { resetOfficiatingState } from '@Assemblies/engines/officiating/officiatingState';
import { policyRegistry } from '@Global/policyRegistry';
import {
  setAuditAuthorityServer,
  setCapturedCompetitionClock,
  setSaveDrawDeletions,
  setCallRandomSource,
  enableNotifications,
  clearMutationStatus,
  setTournamentRecords,
  setCapturedStamps,
  setInvokeObserver,
  setCapturedClock,
  setSubscriptions,
  setNoticeBuffer,
  setDevContext,
  deleteNotices,
  setGlobalLog,
  setDeepCopy,
} from '@Global/state/globalState';

/**
 * Vitest setupFiles hook, listed FIRST: every test file starts from the engine's default global state.
 *
 * Global state is module state. Under per-file isolation each file re-imports the engine and starts clean; on a run
 * with `isolate: false` (PRs into dev, see vitest.config.mts) a worker keeps its modules across files, so whatever one
 * file left set (a dev context, a captured clock, a loaded tournament, a subscription, a disabled notification
 * channel) reaches the next. Setup files re-run before every file either way, so this restores the defaults that the
 * public setters can reach. A file that changes any of these should still restore them itself; this guarantees the
 * next file does not depend on it.
 *
 * Also reset: the policy registry and the officiating and sanctioning record stores. Not reachable here, because their
 * setters only merge: global subscriptions, global methods and the sync provider's methods (setGlobalSubscriptions,
 * setGlobalMethods, setMethods). A file that needs an engine with none of those runs isolated (vitest.config.mts).
 * The setup files after this one own the schema write mode, the outcome pipeline, the factory backend and the state
 * provider.
 */
setDevContext(undefined);
setGlobalLog(undefined);
setInvokeObserver(undefined);
setCapturedClock(undefined);
setCapturedCompetitionClock(undefined);
setCapturedStamps(undefined);
setCallRandomSource(undefined);
setSaveDrawDeletions(undefined);
setAuditAuthorityServer(undefined);
setDeepCopy(true, { stringify: [], ignore: [], toJSON: [], threshold: undefined });

setTournamentRecords({});
setSubscriptions({ subscriptions: {} });
setNoticeBuffer(undefined);
deleteNotices();
clearMutationStatus();
enableNotifications();

// module state outside globalState: registered policies, and the declaration engines' record stores (their reset also
// drops imported methods, as a fresh process would start without them)
policyRegistry.clear();
resetOfficiatingState();
resetSanctioningState();
