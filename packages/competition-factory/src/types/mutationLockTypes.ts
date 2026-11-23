export type MutationLockScope =
  | 'SCHEDULING'
  | 'SCORING'
  | 'DRAWS'
  | 'MATCHUPS'
  | 'PARTICIPANTS'
  | 'ENTRIES'
  | 'EVENTS'
  | 'VENUES'
  | 'PUBLISHING'
  | 'TOURNAMENT'
  | 'TIE_FORMAT'
  | 'POLICY'
  | 'COMPETITION'
  | 'RANKING';

export interface MutationLock {
  lockId: string;
  lockToken: string;
  scope: MutationLockScope;
  methods?: string[]; // optional: only these methods within scope are locked
  expiresAt: string | null; // ISO 8601 GMT or null for permanent
  createdAt: string;
}

export interface MutationLocksValue {
  enabled?: boolean; // only on tournamentRecord; acts as feature gate
  locks: MutationLock[];
}
