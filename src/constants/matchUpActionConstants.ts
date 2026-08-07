export const REPLACE_TEAM_POSITION_METHOD = 'replaceTieMatchUpParticipantId';
export const ASSIGN_TEAM_POSITION_METHOD = 'assignTieMatchUpParticipantId';
export const REMOVE_TEAM_POSITION_METHOD = 'removeTieMatchUpParticipantId';
export const ASSIGN_SIDE_METHOD = 'assignMatchUpSideParticipant';
export const REMOVE_SIDE_METHOD = 'removeMatchUpSideParticipant';
export const SUBSTITUTION_METHOD = 'substituteParticipant';
export const REMOVE_SUBSTITUTION = 'REMOVE_SUBSTITUTION';
export const REPLACE_PARTICIPANT = 'REPLACE_PARTICIPANT';
export const REMOVE_PARTICIPANT = 'REMOVE_PARTICIPANT';
export const SCHEDULE_METHOD = 'setMatchUpStatus';
export const SUBSTITUTION = 'SUBSTITUTION';
export const SCHEDULE = 'SCHEDULE';
export const PENALTY = 'PENALTY';
export const REFEREE = 'REFEREE';
export const STATUS = 'STATUS';
export const START = 'START';
export const SCORE = 'SCORE';
export const END = 'END';

export const matchUpActionConstants = {
  REPLACE_TEAM_POSITION_METHOD,
  ASSIGN_TEAM_POSITION_METHOD,
  REMOVE_TEAM_POSITION_METHOD,
  REPLACE_PARTICIPANT,
  SUBSTITUTION_METHOD,
  REMOVE_SUBSTITUTION,
  REMOVE_PARTICIPANT,
  SCHEDULE_METHOD,
  SUBSTITUTION,
  SCHEDULE,
  PENALTY,
  REFEREE,
  STATUS,
  SCORE,
  START,
  END,
} as const;

export default matchUpActionConstants;
