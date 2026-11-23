/**
 * The contract a state provider meets to be installed with `setStateProvider`.
 *
 * Members are loosely typed in 7.x so every existing provider keeps compiling; the type documents which members a
 * provider must carry and which it may add. `setStateProvider` still checks the required members at runtime.
 * The built-in providers are the synchronous default and the async provider in `examples/asyncEngine`.
 */
// any function is assignable to this: parameters are contravariant, so `never[]` accepts every signature
type ProviderMember = (...args: never[]) => unknown;

/** Required: `setStateProvider` refuses a provider missing any of these. */
export interface RequiredStateProviderMembers {
  addNotice: ProviderMember;
  callListener: ProviderMember;
  cycleMutationStatus: ProviderMember;
  deleteNotice: ProviderMember;
  deleteNotices: ProviderMember;
  disableNotifications: ProviderMember;
  enableNotifications: ProviderMember;
  getMethods: ProviderMember;
  getNotices: ProviderMember;
  getTopics: ProviderMember;
  getTournamentId: ProviderMember;
  getTournamentRecord: ProviderMember;
  getTournamentRecords: ProviderMember;
  removeTournamentRecord: ProviderMember;
  setSubscriptions: ProviderMember;
  setTournamentId: ProviderMember;
  setTournamentRecord: ProviderMember;
  setTournamentRecords: ProviderMember;
}

/** Optional: each is called only when the provider has it. */
export interface OptionalStateProviderMembers {
  /** with `setCapturedClock`, lets an engine call hold one instant; without them a warning is logged at install */
  getCapturedClock: ProviderMember;
  setCapturedClock: ProviderMember;
  getCapturedCompetitionClock: ProviderMember;
  setCapturedCompetitionClock: ProviderMember;
  getCapturedStamps: ProviderMember;
  setCapturedStamps: ProviderMember;
  getCallRandomSource: ProviderMember;
  setCallRandomSource: ProviderMember;
  /** draw-level stamps under `stampScope('modified')` */
  markModified: ProviderMember;
  cycleModifiedTopics: ProviderMember;
  cycleModifiedTournamentIds: ProviderMember;
  createInstanceState: ProviderMember;
  getNoticeBuffer: ProviderMember;
  setNoticeBuffer: ProviderMember;
  getNoticeState: ProviderMember;
  getPayloads: ProviderMember;
  handleCaughtError: ProviderMember;
  setMethods: ProviderMember;
  setMutationStatus: ProviderMember;
}

export type StateProvider = RequiredStateProviderMembers &
  Partial<OptionalStateProviderMembers> & { [key: string]: unknown };
