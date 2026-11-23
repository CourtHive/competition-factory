/**
 *
 * @param {object[]} matchUps
 * @param {object[]} positionAssignments - assignment objects which associate drawPositions with participantIds
 *
 * Returns an array of drawPositions which have not been filled
 */

export function getUnfilledPositions({ drawPositionGroups, positionAssignments }) {
  const assignmentMap = Object.assign(
    {},
    ...positionAssignments.map((assignment) => ({
      [assignment.drawPosition]: assignment,
    })),
  );

  return drawPositionGroups
    .map((drawPositions) => {
      return drawPositions
        .filter(Boolean)
        .map((drawPosition) => assignmentMap[drawPosition])
        .filter(Boolean)
        .filter((assignment) => !assignment.participantId && !assignment.bye)
        .map((assignment) => assignment.drawPosition);
    })
    .flat()
    .filter(Boolean);
}
