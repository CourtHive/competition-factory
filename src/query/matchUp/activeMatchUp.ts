import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { isActiveMatchUpStatus } from '@Query/matchUp/checkStatusType';

// constants and types
import { DEFAULTED, IN_PROGRESS, WALKOVER } from '@Constants/matchUpStatusConstants';
import { Score } from '@Types/tournamentTypes';

// an active matchUp is one that has a winningSide, more than one set, or a single set with any score value greater than zero
// when { matchUpType: TEAM } the child tieMatchUps must be checked as well
// scoreStrings are not reliable because TEAM matchUps can have scoreString '0-0'

type IsActiveMatchUpArgs = {
  matchUpStatus?: string;
  winningSide?: number;
  tieMatchUps?: any[];
  sides?: any[];
  score?: Score;
};
export function isActiveMatchUp({ matchUpStatus, winningSide, tieMatchUps, sides, score }: IsActiveMatchUpArgs) {
  // A matchUp is active via winningSide only when the WINNING side actually holds a
  // participant. A "produced" WALKOVER (no participants) or a propagated exit whose
  // winning side is still an empty feed slot — e.g. a cascaded consolation WALKOVER
  // awaiting the participant who will fall through into it — must NOT read as active,
  // otherwise it marks the feeding drawPositions active and blocks that participant
  // from advancing into the slot (ERR_ACTIVE_DRAW_POSITION).
  const winnerAssigned = !!winningSide && !!sides?.find((side) => side.sideNumber === winningSide)?.participantId;
  const activeTieMatchUps = tieMatchUps?.filter(isActiveMatchUp)?.length;
  const scoreExists = checkScoreHasValue({ score });

  return (
    scoreExists ||
    activeTieMatchUps ||
    winnerAssigned ||
    // must exclude IN_PROGRESS as this is automatically set by updateTieMatchUpScore
    // must exclude WALKOVER and DEFAULTED as "produced" scenarios do not imply a winningSide
    (matchUpStatus &&
      isActiveMatchUpStatus({ matchUpStatus }) &&
      ![DEFAULTED, WALKOVER, IN_PROGRESS].includes(matchUpStatus))
  );
}
