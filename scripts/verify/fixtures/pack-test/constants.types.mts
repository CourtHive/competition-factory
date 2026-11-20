import { matchUpStatusConstants, homeParticipantConstants } from 'tods-competition-factory/constants';
import type { HomeParticipantBasis } from 'tods-competition-factory/constants';

const completed: 'COMPLETED' = matchUpStatusConstants.COMPLETED;
const basis: HomeParticipantBasis = homeParticipantConstants.EXPLICIT;
export const read = [completed, basis] as const;
