export const QUALIFYING_PARTICIPANT_METHOD = 'qualifierDrawPositionAssignment';
export const WITHDRAW_PARTICIPANT_METHOD = 'withdrawParticipantAtDrawPosition';
export const ALTERNATE_PARTICIPANT_METHOD = 'alternateDrawPositionAssignment';
export const LUCKY_PARTICIPANT_METHOD = 'luckyLoserDrawPositionAssignment';
export const REMOVE_ASSIGNMENT_METHOD = 'removeDrawPositionAssignment';
export const SWAP_PARTICIPANT_METHOD = 'swapDrawPositionAssignments';
export const MODIFY_PAIR_ASSIGNMENT_METHOD = 'modifyPairAssignment';
export const SWAP_ADHOC_PARTICIPANT_METHOD = 'adHocPositionSwap';
export const ADD_NICKNAME_METHOD = 'modifyParticipantOtherName';
export const ASSIGN_PARTICIPANT_METHOD = 'assignDrawPosition';
export const REMOVE_SEED_METHOD = 'removeSeededParticipant';
export const ASSIGN_BYE_METHOD = 'assignDrawPositionBye';
export const SEED_VALUE_METHOD = 'modifySeedAssignment';
export const SEED_CASCADE_METHOD = 'seedWithdrawalCascade';
export const ADD_PENALTY_METHOD = 'addPenalty';

export const MODIFY_PAIR_ASSIGNMENT = 'MODIFY_PAIR';
export const QUALIFYING_PARTICIPANT = 'QUALIFIER';
export const ALTERNATE_PARTICIPANT = 'ALTERNATE';
export const WITHDRAW_PARTICIPANT = 'WITHDRAW';
export const ASSIGN_PARTICIPANT = 'ASSIGN';
export const REMOVE_ASSIGNMENT = 'REMOVE';
export const LUCKY_PARTICIPANT = 'LUCKY';
export const REMOVE_SEED = 'REMOVE_SEED';
export const SWAP_PARTICIPANTS = 'SWAP';
export const ADD_NICKNAME = 'NICKNAME';
export const SEED_VALUE = 'SEED_VALUE';
export const ADD_PENALTY = 'PENALTY';
export const SEED_CASCADE = 'SEED_CASCADE';
export const ASSIGN_BYE = 'BYE';

export const positionActionConstants = {
  MODIFY_PAIR_ASSIGNMENT,
  QUALIFYING_PARTICIPANT,
  ALTERNATE_PARTICIPANT,
  WITHDRAW_PARTICIPANT,
  ASSIGN_PARTICIPANT,
  LUCKY_PARTICIPANT,
  REMOVE_ASSIGNMENT,
  SWAP_PARTICIPANTS,
  ADD_NICKNAME,
  REMOVE_SEED,
  ADD_PENALTY,
  ASSIGN_BYE,
  SEED_CASCADE,
  SEED_VALUE,
};

export default positionActionConstants;
