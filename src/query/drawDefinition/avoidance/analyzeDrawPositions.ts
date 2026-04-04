/**
 *
 * @param {string[]} allGroups - group names derived from participant attributes which match policyAttributes
 * @param {string[]} groupsToAvoid - names of groups which contain the participantId currently being placed
 * @param {object[]} positionAssignments - array of assignment objects { drawPosition, participantId }
 *
 */
function getPositionProfiles({ participantIdGroups, positionAssignments, groupsToAvoid }) {
  return Object.assign(
    {},
    ...positionAssignments
      .filter((assignment) => assignment?.participantId)
      .map((assginment) => {
        const { drawPosition, participantId } = assginment;
        const participantGroups = participantIdGroups ? participantIdGroups[participantId] ?? [] : [];

        const includesGroupsToAvoid = !!groupsToAvoid.some((group) => participantGroups.includes(group));
        return { [drawPosition]: { participantGroups, includesGroupsToAvoid } };
      }),
  );
}

/**
 *
 * @param {string[]} allGroups - group names derived from participant attributes which match policyAttributes
 * @param {string[]} groupsToAvoid - names of groups which contain the participantId currently being placed
 * @param {number[]} unfilledPositions - drawPositions which have not been assigned a participantid
 * @param {object[]} positionAssignments - array of assignment objects { drawPosition, participantId }
 * @param {object[]} chunkedDrawPositions - array of arrays of drawPositions
 *
 * Returns different types of placement options.
 * 1. positions which are unassigned
 * 2. unassigned positions which are not paired with any other participantId
 * 3. unassigned positions which are paired and which have no conflicting groupings (groupings to avoid)
 *
 */
export function analyzeEliminationDrawPositions(params) {
  const { unfilledPositions, chunkedDrawPositions } = params;
  const profiledPositions = getPositionProfiles(params);

  const checkedChunk = chunkedDrawPositions.map((chunkedGrouping) => {
    const unassigned = unfilledPositions.filter((unfilledPosition) => chunkedGrouping.includes(unfilledPosition));
    const unpaired = unpairedPositions(unassigned);
    const paired = unassigned.filter((drawPosition) => !unpaired.includes(drawPosition));
    const pairedNoConflict = paired.filter((drawPosition) => {
      const pairedPosition = getPairedPosition(drawPosition);
      return !profiledPositions[pairedPosition]?.includesGroupsToAvoid;
    });
    return { unassigned, unpaired, pairedNoConflict };
  });

  return checkedChunk;

  function unpairedPositions(unassigned) {
    return unassigned.filter((u) => !pairAssigned(u));

    function pairAssigned(drawPosition) {
      const pairedPosition = getPairedPosition(drawPosition);
      return !unassigned.includes(pairedPosition);
    }
  }
}

/**
 *
 * @param {string[]} allGroups - group names derived from participant attributes which match policyAttributes
 * @param {string[]} groupsToAvoid - names of groups which contain the participantId currently being placed
 * @param {number[]} unfilledPositions - drawPositions which have not been assigned a participantid
 * @param {object[]} positionAssignments - array of assignment objects
 * @param {object[]} chunkedDrawPositions - array of arrays of drawPositions
 *
 * Returns different types of placement options.
 * 1. positions which are unassigned
 * 2. unassigned positions which are not paired with any other participantId
 * 3. unassigned positions which are paired and which have no conflicting groupings (groupings to avoid)
 *
 */

export function analyzeRoundRobinDrawPositions(params) {
  const { unfilledPositions, chunkedDrawPositions } = params;
  const profiledPositions = getPositionProfiles(params);

  return chunkedDrawPositions.map((chunkedGrouping) => {
    const unassigned = unfilledPositions.filter((unfilledPosition) => chunkedGrouping.includes(unfilledPosition));
    const unpaired = unassigned.length === chunkedGrouping.length ? unassigned : [];
    const conflictsCount = chunkedGrouping.filter(
      (drawPosition) => profiledPositions[drawPosition]?.includesGroupsToAvoid,
    ).length;
    const pairedNoConflict = conflictsCount ? [] : unassigned;
    return { unassigned, unpaired, pairedNoConflict, conflictsCount };
  });
}

/**
 *
 * @param {string} drawPosition
 *
 * Returns paired position for first round matches in elimination structures
 */
function getPairedPosition(drawPosition) {
  return Number(drawPosition % 2 ? drawPosition + 1 : drawPosition - 1);
}

/**
 *
 * @param {sring[]} allGroups - array of group names (attribute values) for all groups under consideration
 * @param {string} participantId - ID of the participant in question
 *
 * Returns the group name for all groups including participantid
 *
 */
export function getParticipantGroups({ allGroups, participantId }) {
  return Object.keys(allGroups).filter((key) => allGroups[key].includes(participantId));
}
