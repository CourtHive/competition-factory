import {
  ABANDONED,
  AWAITING_RESULT,
  BYE,
  CANCELLED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  INCOMPLETE,
  NOT_PLAYED,
  RETIRED,
  SUSPENDED,
  TO_BE_PLAYED,
  WALKOVER,
} from './matchUpStatusValues';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

// primitive matchUp-status consts are generated from MatchUpStatusEnum (see
// matchUpStatusValues.ts); the semantic groupings below are hand-authored.
export * from './matchUpStatusValues';

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
} as const;
