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
  if (isDoubleExit(request.matchUpStatus)) return { projectedWinningSide: undefined, score: request.score };
  const { winningSide, scoreStringSide1, scoreStringSide2, set } = generateTieMatchUpScore(args);
  const missingTeams = !!winningSide && !bothTeamsAssigned(args);
  return {
    missingTeams,
    projectedWinningSide: winningSide,
    score: { scoreStringSide1, scoreStringSide2, sets: set ? [set] : [] },
  };
}

/** A line-up can exist before the participant arrives. Read bracket seats from their draw assignments. */
function bothTeamsAssigned({ matchUp, structure, drawDefinition }: Parameters<typeof generateTieMatchUpScore>[0]) {
  if (isAdHoc({ structure }))
    return [1, 2].every((number) =>
      matchUp.sides?.some((side) => side.sideNumber === number && side.participantId && !side.bye),
    );
  const positions = matchUp.drawPositions;
  if (positions?.length !== 2 || positions[0] === positions[1]) return false;
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structure });
  return positions.every(
    (position) =>
      !!position && positionAssignments.some((a) => a.drawPosition === position && a.participantId && !a.bye),
  );
}
