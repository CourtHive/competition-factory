export const IN_PROGRESS = 'IN_PROGRESS';
export const ABANDONED = 'ABANDONED';
export const CANCELLED = 'CANCELLED';
export const COMPLETED = 'COMPLETED';
export const ACTIVE = 'ACTIVE';

// Canonical tournament status values. Excludes TOURNAMENT_IMAGE_RESOURCE_NAME, which is a
// resource name grouped into tournamentConstants for namespacing, not a status. Both
// TournamentStatusUnion (the type) and setTournamentStatus (the validator) derive from this
// so the accepted values and the type can never disagree.
export const tournamentStatuses = [ACTIVE, IN_PROGRESS, COMPLETED, ABANDONED, CANCELLED] as const;

export const TOURNAMENT_IMAGE_RESOURCE_NAME = 'tournamentImage';

export const tournamentConstants = {
  TOURNAMENT_IMAGE_RESOURCE_NAME,
  IN_PROGRESS,
  ABANDONED,
  CANCELLED,
  COMPLETED,
  ACTIVE,
} as const;
