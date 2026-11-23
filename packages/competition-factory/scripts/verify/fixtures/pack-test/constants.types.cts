import constants = require('tods-competition-factory/constants');

const completed: 'COMPLETED' = constants.matchUpStatusConstants.COMPLETED;
const basis: constants.HomeParticipantBasis = constants.homeParticipantConstants.EXPLICIT;
export const read = [completed, basis] as const;
