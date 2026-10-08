import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { overlap } from '@Tools/arrays';

// constants and types
import { BYE, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { TeamLevel } from '@Acquire/teamLevelMatchUps';
import type { HydratedMatchUp } from '@Types/hydrated';

type IncludesMatchUpStatusesArgs = {
  drawPositionMatchUps?: TeamLevel<HydratedMatchUp>[];
  sourceMatchUps: TeamLevel<HydratedMatchUp>[];
  matchUpStatuses?: string[];
  loserDrawPosition?: number;
};

// a later round than `than`; false when either round is unknown, as the untyped `>` it replaces was
const isLaterRound = (matchUp: HydratedMatchUp, than: HydratedMatchUp) =>
  matchUp.roundNumber !== undefined && than.roundNumber !== undefined && matchUp.roundNumber > than.roundNumber;

// `some`, not `includes`: with no drawPosition it matches an open slot, exactly as `includes(undefined)` did untyped
const holdsDrawPosition = (matchUp: HydratedMatchUp, drawPosition?: number) =>
  !!matchUp.drawPositions?.some((position) => position === drawPosition);

export function includesMatchUpStatuses({
  matchUpStatuses = [BYE, WALKOVER, DEFAULTED],
  drawPositionMatchUps,
  loserDrawPosition,
  sourceMatchUps,
}: IncludesMatchUpStatusesArgs) {
  // Only TEAM-level matchUps, by contract (`teamLevelMatchUps`) and filtered again for an untyped caller. In context a
  // TEAM matchUp's tieMatchUps carry its drawPositions, so a rubber's WALKOVER read as the team's: clearing a round 2
  // result whose winner took its round 1 dual with a walkover rubber removed the FIRST_MATCH_LOSER_CONSOLATION BYE
  // reserved for that slot.
  const dualMatchUps = teamLevelMatchUps(drawPositionMatchUps);
  const structureMatchUps = teamLevelMatchUps(sourceMatchUps);

  const sourceMatchUp = dualMatchUps.reduce<HydratedMatchUp | undefined>(
    (sourceMatchUp, matchUp) => (!sourceMatchUp || isLaterRound(matchUp, sourceMatchUp) ? matchUp : sourceMatchUp),
    undefined,
  );
  const winnerDrawPosition = sourceMatchUp?.drawPositions?.find((drawPosition) => drawPosition !== loserDrawPosition);

  // How each side REACHED the source matchUp: a later round says nothing about that. The winner of a matchUp being
  // unwound can still stand in a later round, and a produced exit awarded there (a DEFAULTED opposite a double exit)
  // read as a first-round walkover, so the FIRST_MATCHUP reservation BYE their first-round win had earned was removed
  // and never restored (census 20064548, FIRST_MATCH_LOSER_CONSOLATION 8/8: `Main|2|1` re-scored from a played win to a
  // DOUBLE_DEFAULT stripped `Consolation|2|1`'s BYE, and its consolation participant then waited on nobody).
  const reachedSource = structureMatchUps.filter((matchUp) => !sourceMatchUp || !isLaterRound(matchUp, sourceMatchUp));

  const winnerMatchUpStatuses = reachedSource
    .filter((matchUp) => holdsDrawPosition(matchUp, winnerDrawPosition))
    .map((matchUp) => matchUp.matchUpStatus);

  const loserMatchUpStatuses = reachedSource
    .filter((matchUp) => holdsDrawPosition(matchUp, loserDrawPosition))
    .map((matchUp) => matchUp.matchUpStatus);

  const winnerHadMatchUpStatus = overlap(winnerMatchUpStatuses ?? [], matchUpStatuses);

  const loserHadMatchUpStatus = overlap(loserMatchUpStatuses ?? [], matchUpStatuses);

  return {
    sourceMatchUp,
    winnerHadMatchUpStatus,
    winnerMatchUpStatuses,
    loserHadMatchUpStatus,
    loserMatchUpStatuses,
  };
}
