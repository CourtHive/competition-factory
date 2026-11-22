import { generateTieMatchUpScore } from './generateTieMatchUpScore';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isDoubleExit } from '@Validators/isExit';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';

/** An explicit double exit withdraws both teams and keeps the score allowed by the requested status. */
export function projectTeamOutcome(
  args: Parameters<typeof generateTieMatchUpScore>[0],
  request: { matchUpStatus?: MatchUpStatusUnion; score?: Score },
) {
  const missingTeams = !bothTeamsAssigned(args);
  if (isDoubleExit(request.matchUpStatus))
    return { missingTeams, projectedWinningSide: undefined, score: request.score };
  const { winningSide, scoreStringSide1, scoreStringSide2, set } = generateTieMatchUpScore(args);
  return {
    missingTeams,
    projectedWinningSide: winningSide,
    score: { scoreStringSide1, scoreStringSide2, sets: set ? [set] : [] },
  };
}

/** A line-up can exist before the participant arrives. Read bracket seats from their draw assignments. */
function bothTeamsAssigned({ matchUp, structure, drawDefinition }: Parameters<typeof generateTieMatchUpScore>[0]) {
  const seats = isAdHoc({ structure })
    ? [1, 2].map((number) => matchUp.sides?.find((side) => side.sideNumber === number))
    : bracketSeats({ matchUp, structure, drawDefinition });
  const [first, second] = seats;
  return (
    !!first?.participantId &&
    !!second?.participantId &&
    !first.bye &&
    !second.bye &&
    first.participantId !== second.participantId
  );
}

function bracketSeats({ matchUp, structure, drawDefinition }: Parameters<typeof generateTieMatchUpScore>[0]) {
  if (matchUp.drawPositions?.length !== 2) return [];
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structure });
  return matchUp.drawPositions.map((position) => positionAssignments.find((seat) => seat.drawPosition === position));
}
