import { claimAssignment, claimEdges } from '../plan/placementClaims';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { BYE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { isExit } from '@Validators/isExit';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { Frame } from './dependencies';

/** The stored mark follows the losing entrant, not the advancing BYE match. Rebuild both
 * physical places. The alternative path through the donor's winner cannot carry this loser. */
export function holdsRelayedLoser(
  frame: Frame,
  target: HydratedMatchUp,
  sideNumber: number,
  mark: SideExitProvenanceEntry,
) {
  if (frame.drawDefinition.drawType !== FIRST_MATCH_LOSER_CONSOLATION || !isExit(mark.previousMatchUpStatus))
    return false;
  const donor = frame.inContextDrawMatchUps.find((m) => m.matchUpId === mark.sourceMatchUpId);
  const side = target.sides?.find((s) => s.sideNumber === sideNumber);
  if (
    !donor?.winningSide ||
    donor.roundNumber !== 1 ||
    donor.structureId === target.structureId ||
    !side?.drawPosition ||
    !side.participantId ||
    side.bye ||
    side.qualifier ||
    target.sides?.filter((s) => s.participantId === side.participantId).length !== 1 ||
    donor.sides?.filter((s) => s.participantId === side.participantId).length !== 1 ||
    donor.matchUpStatus !== mark.previousMatchUpStatus ||
    carriedExitStatus(mark) !== (donor.matchUpStatus === RETIRED ? WALKOVER : donor.matchUpStatus)
  )
    return false;
  const losing = donor.sides?.find((s) => s.sideNumber === 3 - donor.winningSide!);
  if (
    !losing?.drawPosition ||
    losing.participantId !== side.participantId ||
    claimAssignment(frame, donor, losing.drawPosition)?.participantId !== side.participantId
  )
    return false;
  const placement = claimEdges(frame, donor);
  const relay = placement.targetMatchUps?.loserMatchUp;
  if (
    !placement.targetLinks?.loserTargetLink ||
    !relay ||
    relay.structureId !== target.structureId ||
    relay.matchUpStatus !== BYE ||
    checkScoreHasValue({ score: relay.score }) ||
    relay.sides?.filter((s) => s.participantId).length !== 1
  )
    return false;
  const occupant = relay.sides?.find((s) => s.participantId === side.participantId);
  const vacancy = relay.sides?.find((s) => s.sideNumber !== occupant?.sideNumber && s.bye && !s.participantId);
  if (
    !occupant?.drawPosition ||
    occupant.bye ||
    occupant.qualifier ||
    (relay.winningSide && relay.winningSide !== occupant.sideNumber) ||
    !vacancy?.drawPosition ||
    !claimAssignment(frame, relay, vacancy.drawPosition)?.bye ||
    occupant.drawPosition !== placement.targetMatchUps?.loserTargetDrawPosition ||
    occupant.drawPosition !== side.drawPosition ||
    claimAssignment(frame, target, side.drawPosition)?.participantId !== side.participantId
  )
    return false;
  const advance = claimEdges(frame, relay);
  return (
    !advance.targetLinks?.winnerTargetLink && advance.targetMatchUps?.winnerMatchUp?.matchUpId === target.matchUpId
  );
}
