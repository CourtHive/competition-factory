import { removeDrawPositionAssignment } from './removeDrawPositionAssignment';

// constants
import { WITHDRAWN } from '@Constants/entryStatusConstants';

/*
 *
 * @param {string} drawId - id of drawDefinition within which structure is found
 * @param {string} structureId - id of structure of drawPosition
 * @param {number} drawPosition - number of drawPosition for which actions are to be returned
 * @param {boolean} replaceWithBye - boolean whether or not to replace with BYE
 * @param {boolean} destroyPair - if { participantType: PAIR } it is possible to destroy pair entry before modifying entryStatus
 *
 */

export function withdrawParticipantAtDrawPosition(params) {
  Object.assign(params, { entryStatus: WITHDRAWN });
  return removeDrawPositionAssignment(params);
}
