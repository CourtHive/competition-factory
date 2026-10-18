import {
  hasEarnedResult,
  loserPlayedOn,
  onlyThisCarry,
  standingMatchUp,
  winnerPlayedOn,
} from '@Mutate/matchUps/drawPositions/relabelLoserExit';

// constants and types
import type { DrawDefinition, DrawLink, MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * # A recorded result downstream fixes the KIND of the outcome that sent the loser there (P52; CA, 2026-10-11)
 *
 * > if there is a result someone recorded in the consolation then it implies something was really played and it
 * > shouldn't be removed. the assumption is that the person who recorded the score simply didn't realize that the
 * > incorrect player had previously been advanced. therefore, changing the upstream match to a DIFFERENT KIND of
 * > outcome is invalid, but simply changing the winningSide is not invalid.
 *
 * - **The kind** is whether the outcome CARRIES an exit downstream under the draw's settings: WALKOVER and DEFAULTED
 *   do, RETIRED only with `propagateRetirementAsExit`; anything else is played. With `propagateExitStatus` off nothing
 *   is carried, so every outcome is the same kind and nothing is refused.
 * - **A recorded result** is one a director entered, played or not (a recorded double walkover counts), as opposed to
 *   what the cascade derived: a carried exit, or the award it gives whoever arrives at a pending exit
 *   (`hasEarnedResult`). It counts where the loser stands, onward from there in a structure their loss there fed, and
 *   — when the outcome being corrected is a carried exit — onward from the matchUp that exit decided.
 * - **It applies both ways and to both corrections**: played → exit and exit → played; a winner flip and a
 *   status-only correction alike. A plain winner flip keeps the kind, and stays accepted: the recorded result becomes
 *   the new loser's.
 *
 * With nothing recorded the correction is accepted, and the carry is re-derived from the corrected result, so the draw
 * is the one forward play reaches.
 *
 * Returns the matchUp whose recorded result blocks the correction, or undefined.
 */
export function correctionKindChange(params: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  propagateRetirementAsExit?: boolean;
  matchUpStatus?: MatchUpStatusUnion;
  propagateExitStatus?: boolean;
  drawDefinition: DrawDefinition;
  loserTargetLink?: DrawLink;
  winningSide?: number;
  matchUp?: MatchUp;
}): { blockingMatchUpId: string } | undefined {
  const { matchUp, winningSide, inContextMatchUp, drawDefinition, inContextDrawMatchUps } = params;
  // a decided result replaced by another decided result, on a matchUp that directs a loser
  if (!params.propagateExitStatus || !matchUp?.winningSide || !winningSide || matchUp.collectionId) return undefined;

  const carries = (status?: string) =>
    status === WALKOVER || status === DEFAULTED || (status === RETIRED && !!params.propagateRetirementAsExit);
  // the resulting record: a flip with no status keeps the status it had; the same winner with no status is a played
  // result, scored or not. Read as keeping its status, a walkover re-entered as a bare win for the same winner passed
  // as no change of kind, while the write made it COMPLETED: the carried walkover stayed standing from a match now
  // played (census 20496362, OLYMPIC 16/16, `East|1|7`, with Uhura's recorded `South|2|1` onward).
  const flip = winningSide !== matchUp.winningSide;
  const resultingStatus = params.matchUpStatus ?? (flip ? matchUp.matchUpStatus : COMPLETED);
  const wasCarried = carries(matchUp.matchUpStatus);
  if (wasCarried === carries(resultingStatus)) return undefined;

  const targetStructureId = params.loserTargetLink?.target?.structureId;
  // the loser's slot is relabelled by a flip, not moved, so the PREVIOUS loser's place is the one asked about
  const loserParticipantId = inContextMatchUp?.sides?.find(
    (side) => side?.sideNumber !== matchUp.winningSide,
  )?.participantId;
  if (!targetStructureId || !loserParticipantId) return undefined;

  const standing = standingMatchUp(inContextDrawMatchUps, targetStructureId, loserParticipantId);
  if (!standing) return undefined;

  const playedOnFromTheLoss = loserPlayedOn(standing, inContextDrawMatchUps, drawDefinition, loserParticipantId);
  if (wasCarried && onlyThisCarry(standing, loserParticipantId, matchUp.matchUpId)) {
    // the matchUp holds only the carried exit: what blocks is a result recorded by the exit's winner onward
    const onward = winnerPlayedOn(standing, inContextDrawMatchUps, drawDefinition, { byeClaims: true });
    if (onward.error || onward.playedOn || playedOnFromTheLoss) return { blockingMatchUpId: standing.matchUpId };
    return undefined;
  }
  if (hasEarnedResult(standing) || playedOnFromTheLoss) return { blockingMatchUpId: standing.matchUpId };
  return undefined;
}
