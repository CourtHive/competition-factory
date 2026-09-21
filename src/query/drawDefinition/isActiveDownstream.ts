import { getSideExitProvenance, isPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

export function isActiveDownstream(params) {
  // relevantLink is passed in iterative calls (see below)
  const { inContextDrawMatchUps, targetData, drawDefinition, relevantLink } = params;

  /**
   * A fed FMLC BYE is inert only when the FED side holds nobody. The BYE matchUp takes one of two
   * shapes: the fed loser was withheld and the fed slot itself is the BYE — inert, nobody went
   * anywhere from it — or the fed loser is PRESENT and the BYE is their opponent, so they advanced
   * through it. The second shape carries this source's loser onward, and what they played there is
   * active. Short-circuiting it let a Main re-score that removed them from the consolation go through
   * while their played consolation match stood — `DRAW_POSITION_UNASSIGNED`, census 9000458 shrunk to
   * five steps.
   *
   * Only the FED side, which is the NUMERICALLY lower drawPosition (`fedDrawPosition` in
   * `reconcileFedLoserEligibility`). The other side of a feed-round BYE matchUp routinely holds a
   * participant ADVANCED from the structure's previous round, who has nothing to do with this source:
   * treating them as fed made a first entry of a Main round-2 result "active" once the consolation
   * had been played around its BYEs.
   */
  const byeMatchUp = targetData?.matchUp;
  const fedPosition = Math.min(...((byeMatchUp?.drawPositions ?? []).filter(Boolean) as number[]));
  const fedSideHoldsParticipant = !!byeMatchUp?.sides?.some(
    (side: any) => side?.drawPosition === fedPosition && side?.participant,
  );
  const fmlcBYE =
    relevantLink?.linkCondition === FIRST_MATCHUP && byeMatchUp?.matchUpStatus === BYE && !fedSideHoldsParticipant;
  if (fmlcBYE) {
    // A fed FMLC BYE is normally inert. EXCEPTION: a propagated exit can advance THROUGH
    // this BYE into a downstream walkover that has since been RESOLVED — a real
    // participant fell through into the empty winner slot and advanced. That downstream
    // is genuinely active, so do NOT short-circuit; fall through to the recursion.
    const byeWinnerMatchUp = targetData?.targetMatchUps?.winnerMatchUp;
    // DECIDED, not merely "a resolved exit". This tested `isExit(status)`, which is
    // `[DEFAULTED, WALKOVER, RETIRED]` — so a propagated walkover downstream of the BYE blocked the
    // re-score while a match two participants had actually PLAYED did not. The severity was
    // inverted: the derived outcome protected, the real one not.
    //
    // Measured on FIRST_MATCH_LOSER_CONSOLATION 8/6 seed 20262956: `Consolation|3|1` COMPLETED with
    // `winningSide: 1`, and the short-circuit still returned false — so the dispatch took
    // `noDownstreamDependencies` and `CANNOT_CHANGE_OUTCOME` never got the chance to refuse a Main
    // re-score that un-decided that consolation match, leaving it TO_BE_PLAYED with its 6-3 score.
    const byeWinnerDecided =
      byeWinnerMatchUp?.winningSide &&
      !!byeWinnerMatchUp.sides?.find((s: any) => s?.sideNumber === byeWinnerMatchUp.winningSide)?.participant;
    if (!byeWinnerDecided) return false;
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

  /**
   * A PLAYED exit is not a propagated one, and only a propagated one may be treated as inert.
   *
   * `isExit` is a STATUS test: it is true of a walkover a referee recorded exactly as readily as of
   * one the cascade produced. Reading it alone here exempted a consolation matchUp that two
   * participants had actually played — measured on `FIRST_MATCH_LOSER_CONSOLATION` 32/27, seed
   * 9000349: the fed loser and their opponent both present, `winningSide` 2, and NO
   * `sideExitProvenance`, yet `loserMatchUpExit` came out true. `isActiveDownstream` therefore
   * returned false, `resolveAndApplyOutcome` took the `noDownstreamDependencies` branch instead of
   * `winningSideWithDownstreamDependencies`, and a winner-changing re-score of the Main matchUp was
   * ALLOWED — stripping the participant out of a consolation match they had already played and
   * leaving it `EXIT_WITHOUT_LOSER`.
   *
   * `CANNOT_CHANGE_WINNING_SIDE` is the rule that should have refused it, and it is gated on this
   * function. So the guard was not missing; it was never reached.
   *
   * The discriminator is provenance, which the cascade stamps and nothing else does — the same
   * distinction `contestedDoubleExit` below already draws, and the one this file's own comment
   * states: *a status blocks only when it was earned at this matchUp, never when it was propagated
   * into it.*
   */
  const loserMatchUpExit =
    isLoserMatchUpWO && !propagatedLoserParticipant && isPropagatedExit({ matchUp: loserMatchUp });

  //to identify a propagated exit (WO/DEFAULT) for matches that are WO/DEFAULT, have a winning side,
  //and have only one participant (the WO/DF player).
  const loserMatchUpParticipantsCount = loserMatchUp?.sides?.filter((s: any) => s?.participant).length ?? 0;
  const isLoserMatchUpWalkoverWithOnePlayer =
    //this catches downstream matches marked as WO with only one participant
    loserMatchUp?.winningSide && isLoserMatchUpWO && loserMatchUpParticipantsCount === 1;

  const winnerDrawPositionsCount = winnerMatchUp?.drawPositions?.filter(Boolean).length || 0;

  /**
   * A double exit that was EARNED here — not carried here — is active, and both tests below are
   * blind to it BY CONSTRUCTION.
   *
   * `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT` never carry a `winningSide`, because neither side
   * advances. Each test below opens with `matchUp?.winningSide`, so no double exit could ever
   * satisfy either one however real it was.
   *
   * Two conditions separate a real result from a derived one, and BOTH are needed:
   *
   *  1. **Two occupied sides.** A double exit with one occupant or none is the PENDING shape the
   *     cascade deposits ahead of an arrival. It must stay inert — that is the invariant
   *     `pendingDoubleExitNotActive.test.ts` pins, and widening to it re-blocks everything the
   *     carve-outs below exist to unblock.
   *  2. **At least one side NOT carried by propagation.** A convergence — two propagated exits
   *     arriving from different sources and collapsing into a double exit — has two occupants who
   *     never played it, and `sideExitProvenance` records BOTH sides as carried. Such a matchUp is
   *     wholly derived from upstream, so unwinding that upstream must remain permitted and this
   *     guard must stay transparent to it. Measured in `pendingDoubleExitNotActive.test.ts`: a
   *     Backdraw convergence with provenance on both sides, alongside a natively-recorded
   *     Consolation double exit with none.
   *
   * The distinction is the general one this guard already needs everywhere: a status blocks only
   * when it was earned at this matchUp, never when it was propagated into it.
   */
  const contestedDoubleExit = (candidate: any) => {
    if (!isDoubleExit(candidate?.matchUpStatus)) return false;
    const occupiedSides = (candidate?.sides ?? []).filter((side: any) => side?.participant);
    if (occupiedSides.length !== 2) return false;
    const provenance = getSideExitProvenance({ matchUp: candidate });
    return !occupiedSides.every((side: any) => provenance?.[side.sideNumber]);
  };

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
  if (contestedDoubleExit(loserMatchUp) || contestedDoubleExit(winnerMatchUp)) {
    return true;
  }

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
