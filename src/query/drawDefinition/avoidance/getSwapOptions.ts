import { getAvoidanceConflicts } from './getAvoidanceConflicts';

function getPotentialOpponentDrawPosition(drawPositionGroups: any[], possibleDrawPosition: any): any {
  const pair = drawPositionGroups.find((pair) => pair.includes(possibleDrawPosition));
  if (!pair) return undefined;
  return pair.find((drawPosition) => drawPosition !== possibleDrawPosition);
}

function findParticipantByDrawPosition(positionedParticipants: any[], drawPosition: any): any {
  return positionedParticipants.find((placement) => placement.drawPosition === drawPosition);
}

function hasNoConflict({
  moveableParticipant,
  possibleDrawPosition,
  positionedParticipants,
  drawPositionGroups,
  isRoundRobin,
  getAvoidanceConflicts,
}: {
  moveableParticipant: any;
  possibleDrawPosition: any;
  positionedParticipants: any[];
  drawPositionGroups: any[];
  isRoundRobin: boolean;
  getAvoidanceConflicts: (params: { isRoundRobin: boolean; groupedParticipants: any[][] }) => any[];
}): boolean {
  // A swap exchanges two participants: `moveableParticipant` goes from its current position to
  // `possibleDrawPosition`, and whoever occupies `possibleDrawPosition` goes the other way. Both
  // halves must be checked against the opponent each one FACES AFTER the swap.
  const potentialOpponentDrawPosition = getPotentialOpponentDrawPosition(drawPositionGroups, possibleDrawPosition);
  const potentialOpponent = findParticipantByDrawPosition(positionedParticipants, potentialOpponentDrawPosition);
  const possibleDrawPositionGroup = [moveableParticipant, potentialOpponent];
  const conflictPotential = getAvoidanceConflicts({
    isRoundRobin,
    groupedParticipants: [possibleDrawPositionGroup],
  });

  // The swapped-out participant inherits the position `moveableParticipant` vacates, so it faces
  // that position's opponent. Checking it against `potentialOpponent` instead would evaluate the
  // pairing it is being moved OUT of — which is the pre-swap state of the target match. That test
  // rejects every swap into an already-conflicted match, and when all first-round matches are
  // conflicted it rejects every swap there is, leaving the conflicts unrepaired.
  const vacatedOpponentDrawPosition = getPotentialOpponentDrawPosition(
    drawPositionGroups,
    moveableParticipant.drawPosition,
  );
  const vacatedOpponent = findParticipantByDrawPosition(positionedParticipants, vacatedOpponentDrawPosition);
  const swappedParticipant = findParticipantByDrawPosition(positionedParticipants, possibleDrawPosition);
  const possibleExistingOpponentGroup = [swappedParticipant, vacatedOpponent];
  const existingOpponentConflictPotential = getAvoidanceConflicts({
    isRoundRobin,
    groupedParticipants: [possibleExistingOpponentGroup],
  });
  return !conflictPotential.length && !existingOpponentConflictPotential.length;
}

export function getSwapOptions({
  positionedParticipants,
  potentialDrawPositions,
  drawPositionGroups,
  avoidanceConflicts,
  isRoundRobin,
}) {
  return avoidanceConflicts.flatMap((conflict) => {
    const drawPositions = conflict.map((c) => c.drawPosition);
    const moveableParticipants = conflict.filter((placedParticipant) =>
      potentialDrawPositions.includes(placedParticipant.drawPosition),
    );
    return moveableParticipants
      .map((moveableParticipant) => {
        const possibleDrawPositions = potentialDrawPositions.filter((position) => !drawPositions?.includes(position));

        const possibleDrawPositionsNoConflict = possibleDrawPositions.filter((possibleDrawPosition) =>
          hasNoConflict({
            moveableParticipant,
            possibleDrawPosition,
            positionedParticipants,
            drawPositionGroups,
            isRoundRobin,
            getAvoidanceConflicts,
          }),
        );

        if (possibleDrawPositionsNoConflict.length) {
          return {
            drawPosition: moveableParticipant.drawPosition,
            possibleDrawPositions: possibleDrawPositionsNoConflict,
          };
        }

        return undefined;
      })
      .filter(Boolean);
  });
}
