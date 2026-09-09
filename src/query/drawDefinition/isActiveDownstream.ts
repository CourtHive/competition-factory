import { positionTargets } from '@Query/matchUp/positionTargets';
import { isExit } from '@Validators/isExit';

// constants
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

export function isActiveDownstream(params) {
  // relevantLink is passed in iterative calls (see below)
  const { inContextDrawMatchUps, targetData, drawDefinition, relevantLink } = params;

  const fmlcBYE = relevantLink?.linkCondition === FIRST_MATCHUP && targetData?.matchUp?.matchUpStatus === BYE;
  if (fmlcBYE) {
    // A fed FMLC BYE is normally inert. EXCEPTION: a propagated exit can advance THROUGH
    // this BYE into a downstream walkover that has since been RESOLVED — a real
    // participant fell through into the empty winner slot and advanced. That downstream
    // is genuinely active, so do NOT short-circuit; fall through to the recursion.
    const byeWinnerMatchUp = targetData?.targetMatchUps?.winnerMatchUp;
    const byeWinnerResolvedExit =
      byeWinnerMatchUp?.winningSide &&
      isExit(byeWinnerMatchUp.matchUpStatus) &&
      !!byeWinnerMatchUp.sides?.find((s: any) => s?.sideNumber === byeWinnerMatchUp.winningSide)?.participant;
    if (!byeWinnerResolvedExit) return false;
  }

  const {
    targetMatchUps: { loserMatchUp, winnerMatchUp },
    targetLinks,
  } = targetData;

  const loserTargetData =
    loserMatchUp &&
    positionTargets({
      matchUpId: loserMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
    });

  // NOTE: produced WALKOVER, DEFAULTEED fed into consolation structures should NOT be considered active
  // IF: the loserMatchUp has no further downstream matchUps or there is no propagated loserParticipant (e.g. DOUBLE_EXIT)
  const loserExitPropagation = loserTargetData?.targetMatchUps?.loserMatchUp;
  const loserIndex = loserTargetData?.targetMatchUps?.loserMatchUpDrawPositionIndex;
  const propagatedLoserParticipant = loserExitPropagation?.sides[loserIndex]?.participant;
  const isLoserMatchUpWO = isExit(loserMatchUp?.matchUpStatus);
  const loserMatchUpExit = isLoserMatchUpWO && !propagatedLoserParticipant;

  //to identify a propagated exit (WO/DEFAULT) for matches that are WO/DEFAULT, have a winning side,
  //and have only one participant (the WO/DF player).
  const loserMatchUpParticipantsCount = loserMatchUp?.sides?.filter((s: any) => s?.participant).length ?? 0;
  const isLoserMatchUpWalkoverWithOnePlayer =
    //this catches downstream matches marked as WO with only one participant
    loserMatchUp?.winningSide && isLoserMatchUpWO && loserMatchUpParticipantsCount === 1;

  const winnerDrawPositionsCount = winnerMatchUp?.drawPositions?.filter(Boolean).length || 0;

  // A propagated exit whose winning side has been RESOLVED — a real participant fell
  // through into the empty winner slot and advanced — is genuinely active and must
  // block. Only a PENDING/produced exit (empty winner slot) is excluded below. This
  // mirrors the winnerAssigned check in isActiveMatchUp.
  // NOTE: a normally scored exit always has a participant on its winning side
  // (checkParticipants requires two participants unless propagateExitStatus), so an
  // exit with an unoccupied winning side can only be a pending propagated exit. The
  // cascade can deposit one on a natural (non-feed) round -- e.g. a COMPASS back draw,
  // where the exit advances through BYEs into a round that halves -- so this must not
  // be conditioned on feedRound.
  const winnerSideResolved = !!winnerMatchUp?.sides?.find((s: any) => s?.sideNumber === winnerMatchUp.winningSide)
    ?.participant;

  // if a winnerMatchUp contains a WALKOVER and its source matchUps have no winningSides it cannot be considered active
  // unless one of its downstream matchUps is active
  if (
    !isLoserMatchUpWalkoverWithOnePlayer &&
    ((loserMatchUp?.winningSide && !loserMatchUpExit) ||
      (winnerMatchUp?.winningSide &&
        winnerDrawPositionsCount === 2 &&
        (!isExit(winnerMatchUp?.matchUpStatus) || winnerSideResolved)))
  ) {
    return true;
  }

  const winnerTargetData =
    winnerMatchUp &&
    positionTargets({
      matchUpId: winnerMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
    });

  const loserActive =
    loserTargetData &&
    isActiveDownstream({
      relevantLink: targetLinks?.loserTargetLink,
      targetData: loserTargetData,
      inContextDrawMatchUps,
      drawDefinition,
    });

  const winnerActive =
    winnerTargetData &&
    isActiveDownstream({
      targetData: winnerTargetData,
      inContextDrawMatchUps,
      drawDefinition,
    });

  return !!(winnerActive || loserActive);
}
