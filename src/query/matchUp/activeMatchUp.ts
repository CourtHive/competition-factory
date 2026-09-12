import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { isActiveMatchUpStatus } from '@Query/matchUp/checkStatusType';

// constants and types
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, IN_PROGRESS, WALKOVER } from '@Constants/matchUpStatusConstants';
import { Score } from '@Types/tournamentTypes';

// an active matchUp is one that has a winningSide, more than one set, or a single set with any score value greater than zero
// when { matchUpType: TEAM } the child tieMatchUps must be checked as well
// scoreStrings are not reliable because TEAM matchUps can have scoreString '0-0'

type IsActiveMatchUpArgs = {
  matchUpStatus?: string;
  collectionId?: string;
  winningSide?: number;
  tieMatchUps?: any[];
  sides?: any[];
  score?: Score;
};
export function isActiveMatchUp({
  collectionId,
  matchUpStatus,
  winningSide,
  tieMatchUps,
  sides,
  score,
}: IsActiveMatchUpArgs) {
  // A double exit is PENDING while either side is unfilled: nothing can have won it (a double exit
  // carries no winningSide), so its drawPositions must not read as active. `activeMatchUpStatuses`
  // contains DOUBLE_WALKOVER and DOUBLE_DEFAULT and the status exclusion list omits both, so such a
  // matchUp otherwise reads ACTIVE purely from its status — marking its feeding drawPositions active
  // and blocking the very arrival it waits for (ERR_ACTIVE_DRAW_POSITION) — the same failure the
  // `winnerAssigned` guard below was written to prevent, which cannot cover this shape because a
  // double exit has no `winningSide` for it to inspect.
  //
  // COLLECTION matchUps are excluded, and that exclusion is load-bearing rather than defensive: a
  // rubber inside a TEAM tie carries its participants on `lineUp`, not on `sides[].participantId`,
  // so every collection matchUp looks unpopulated by this test. Without the exclusion a
  // DOUBLE_WALKOVER rubber stops making its tie IN_PROGRESS, which `teamAdvancement` asserts.
  const isDoubleExit = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus as any);
  if (isDoubleExit && !collectionId && sides?.length) {
    const populatedSides = sides.filter((side) => side?.participantId).length;
    if (populatedSides < 2) return false;
  }

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
