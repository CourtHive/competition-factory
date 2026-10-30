export const REPLACE_TEAM_POSITION_METHOD = 'replaceTieMatchUpParticipantId';
export const ASSIGN_TEAM_POSITION_METHOD = 'assignTieMatchUpParticipantId';
export const REMOVE_TEAM_POSITION_METHOD = 'removeTieMatchUpParticipantId';
export const ASSIGN_SIDE_METHOD = 'assignMatchUpSideParticipant';
export const REMOVE_SIDE_METHOD = 'removeMatchUpSideParticipant';
export const SUBSTITUTION_METHOD = 'substituteParticipant';
export const REMOVE_SUBSTITUTION = 'REMOVE_SUBSTITUTION';
export const REPLACE_PARTICIPANT = 'REPLACE_PARTICIPANT';
export const REMOVE_PARTICIPANT = 'REMOVE_PARTICIPANT';
/** @deprecated the method of SCORE, CLEAR_SCORE and EXIT, misnamed: use SCORE_METHOD */
export const SCHEDULE_METHOD = 'setMatchUpStatus';
export const SCHEDULE_ITEMS_METHOD = 'addMatchUpScheduleItems';
export const SCHEDULE_LOCK_METHOD = 'setMatchUpScheduleLock';
export const CHECK_IN_METHOD = 'toggleParticipantCheckInState';
export const SCOREKEEPER_METHOD = 'assignMatchUpScorekeeper';
export const REFEREE_METHOD = 'addMatchUpOfficial';
export const SCORE_METHOD = 'setMatchUpStatus';
export const CLEAR_SCORE = 'CLEAR_SCORE';
export const SUBSTITUTION = 'SUBSTITUTION';
export const SCHEDULE = 'SCHEDULE';
export const SCHEDULE_DATE = 'SCHEDULE_DATE';
export const SCHEDULE_TIME = 'SCHEDULE_TIME';
export const SCHEDULE_LOCK = 'SCHEDULE_LOCK';
export const CLEAR_SCHEDULE = 'CLEAR_SCHEDULE';
export const SCOREKEEPER = 'SCOREKEEPER';
export const CHECK_IN = 'CHECK_IN';
export const EXIT = 'EXIT';
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
  SCHEDULE_ITEMS_METHOD,
  SCHEDULE_LOCK_METHOD,
  SCOREKEEPER_METHOD,
  CHECK_IN_METHOD,
  REFEREE_METHOD,
  SCHEDULE_METHOD,
  SCORE_METHOD,
  CLEAR_SCHEDULE,
  SCHEDULE_DATE,
  SCHEDULE_TIME,
  SCHEDULE_LOCK,
  CLEAR_SCORE,
  SUBSTITUTION,
  SCOREKEEPER,
  SCHEDULE,
  CHECK_IN,
  EXIT,
  PENALTY,
  REFEREE,
  STATUS,
  SCORE,
  START,
  END,
} as const;

export default matchUpActionConstants;
