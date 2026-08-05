import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

export const ABANDONED = 'ABANDONED';
export const AWAITING_RESULT = 'AWAITING_RESULT';
export const BYE = 'BYE';
export const CANCELLED = 'CANCELLED';
export const COMPLETED = 'COMPLETED';
export const DEAD_RUBBER = 'DEAD_RUBBER';
export const DEFAULTED = 'DEFAULTED';
export const DOUBLE_DEFAULT = 'DOUBLE_DEFAULT';
export const DOUBLE_WALKOVER = 'DOUBLE_WALKOVER';
export const IN_PROGRESS = 'IN_PROGRESS';
export const INCOMPLETE = 'INCOMPLETE';
export const NOT_PLAYED = 'NOT_PLAYED';
export const RETIRED = 'RETIRED';
export const SUSPENDED = 'SUSPENDED';
export const TO_BE_PLAYED = 'TO_BE_PLAYED';
export const WALKOVER = 'WALKOVER';

export const recoveryTimeRequiredMatchUpStatuses: MatchUpStatusUnion[] = [
  AWAITING_RESULT,
  COMPLETED,
  DEFAULTED,
  IN_PROGRESS,
  INCOMPLETE,
  RETIRED,
  SUSPENDED,
];

export const particicipantsRequiredMatchUpStatuses: MatchUpStatusUnion[] = [
  AWAITING_RESULT,
  COMPLETED,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  IN_PROGRESS,
  INCOMPLETE,
  RETIRED,
  SUSPENDED,
  WALKOVER,
];

export const validMatchUpStatuses: MatchUpStatusUnion[] = [
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  IN_PROGRESS,
  INCOMPLETE,
  NOT_PLAYED,
  RETIRED,
  SUSPENDED,
  TO_BE_PLAYED,
  WALKOVER,
];

export const directingMatchUpStatuses: MatchUpStatusUnion[] = [
  BYE,
  DOUBLE_WALKOVER, // directing because of a produced WALKOVER
  DOUBLE_DEFAULT, // directing because of a produced WALKOVER
  COMPLETED,
  DEFAULTED,
  RETIRED,
  WALKOVER,
];

export const nonDirectingMatchUpStatuses: (MatchUpStatusUnion | undefined)[] = [
  ABANDONED,
  AWAITING_RESULT,
  CANCELLED,
  DEAD_RUBBER,
  IN_PROGRESS,
  INCOMPLETE,
  NOT_PLAYED,
  SUSPENDED,
  TO_BE_PLAYED,
  undefined,
];

export const completedMatchUpStatuses: MatchUpStatusUnion[] = [
  CANCELLED,
  ABANDONED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  RETIRED,
  WALKOVER,
];

export const activeMatchUpStatuses: MatchUpStatusUnion[] = [
  ABANDONED,
  COMPLETED,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  IN_PROGRESS,
  RETIRED,
  WALKOVER,
];

export const upcomingMatchUpStatuses: MatchUpStatusUnion[] = [IN_PROGRESS, INCOMPLETE, SUSPENDED, TO_BE_PLAYED];

export const matchUpStatusConstants = {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  IN_PROGRESS,
  INCOMPLETE,
  NOT_PLAYED,
  RETIRED,
  SUSPENDED,
  TO_BE_PLAYED,
  WALKOVER,
};
