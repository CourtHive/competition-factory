import { getSideExitProvenance, isPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { BYE } from '@Constants/matchUpStatusConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

/** one walk: the answers already given, and the first refusal met (a malformed round link downstream) */
type Walk = { seen: Map<string, boolean>; refused?: ResultType };

/**
 * Whether anything downstream of the matchUp is active, as a boolean. A downstream structure whose
 * links cannot be read (a malformed round link, CA 2026-10-06) reads as ACTIVE here, never as
 * "nothing downstream". A caller that returns results asks `getTargetsDownstream`, which returns that
 * refusal as an error instead.
 */
export function isActiveDownstream(params): boolean {
  return activeBelow(params, { seen: new Map() });
}

/**
 * A matchUp's position targets, and whether anything downstream of it is active, in one call. Either can
 * meet a malformed round link (CA, 2026-10-06: an error): the matchUp's own, or one in a structure it feeds.
 * Either way that error is the answer.
 */
export function getTargetsDownstream(params: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpId: string;
}): ResultType & { targetData?: ReturnType<typeof positionTargets>; activeDownstream?: boolean } {
  const targetData = positionTargets(params);
  if (targetData.error) return decorateResult({ result: targetData, stack: 'isActiveDownstream' });
  const walk: Walk = { seen: new Map() };
  const activeDownstream = activeBelow({ ...params, targetData }, walk);
  if (walk.refused) return walk.refused;
  return { targetData, activeDownstream };
}

function refuse(walk: Walk, targetData: ResultType): boolean {
  walk.refused ??= decorateResult({ result: targetData, stack: 'isActiveDownstream' });
  return true;
}

/**
 * A MATCHUP REACHED DOWN TWO PATHS IS ASKED ONCE.
 *
 * The walk below follows a matchUp's winner target and its loser target, and in a draw whose
 * structures re-join — DOUBLE_ELIMINATION's final, COMPASS's later directions — the same matchUp is
 * reached down both, and everything below it was walked again each time. Measured 2026-10-01
 * (`pipelineCost.test.ts`): 9,384 recursive calls of `positionTargets` from here, 4% of everything
 * `setMatchUpStatus` spent.
 *
 * A matchUp's answer depends on two things only: WHICH matchUp it is — its targets are derived from
 * the one view the whole walk shares — and the condition of the link it was reached through, which
 * the FIRST_MATCHUP BYE test reads. So the answer is kept for one walk, keyed on both, and never
 * beyond it: the next call takes a new view and a new map.
 */
function visit({ matchUpId, relevantLink, targetData, inContextDrawMatchUps, drawDefinition, walk }: any): boolean {
  const key = `${matchUpId}|${relevantLink?.linkCondition ?? ''}`;
  if (walk.seen.has(key)) return walk.seen.get(key);

  const resolvedTargetData = targetData ?? positionTargets({ matchUpId, inContextDrawMatchUps, drawDefinition });
  const active = !!activeBelow(
    { targetData: resolvedTargetData, inContextDrawMatchUps, drawDefinition, relevantLink },
    walk,
  );
  walk.seen.set(key, active);
  return active;
}

function activeBelow(params, walk: Walk): boolean {
  // relevantLink is passed in iterative calls (see below)
  const { inContextDrawMatchUps, targetData, drawDefinition, relevantLink } = params;
  if (targetData?.error) return refuse(walk, targetData);

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
    (side: HydratedSide) => side?.drawPosition === fedPosition && side?.participant,
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
      !!byeWinnerMatchUp.sides?.find((s: HydratedSide) => s?.sideNumber === byeWinnerMatchUp.winningSide)?.participant;
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
  if (loserTargetData?.error) return refuse(walk, loserTargetData);

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
  const loserMatchUpParticipantsCount = loserMatchUp?.sides?.filter((s: HydratedSide) => s?.participant).length ?? 0;
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
  const contestedDoubleExit = (candidate?: HydratedMatchUp) => {
    if (!isDoubleExit(candidate?.matchUpStatus)) return false;
    const occupiedSides = (candidate?.sides ?? []).filter((side) => side?.participant);
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
  /**
   * GENUINELY ACTIVE, not merely ADVANCED ACTIVE.
   *
   * This asked only whether a participant OCCUPIES the winning side. That is true of a walkover the
   * cascade itself produced and handed to whoever happened to be waiting — so a derived result blocked
   * the unwind of the cascade that derived it.
   *
   * CA, 2026-09-25: *"an advanced propagated WALKOVER where there is no participant that walkedover …
   * should be clearable"*, and on the mechanism: *"I don't think `{ allowChangePropagation: true }`
   * should be relevant … not genuinely blocked by genuinely active (as opposed to advanced active)
   * positions."* A flag is explicitly NOT the mechanism; the distinction is.
   *
   * This file already draws it and already states it — *"a status blocks only when it was earned at
   * this matchUp, never when it was propagated into it"* — and applies it on the LOSER path via
   * `isPropagatedExit` (`loserMatchUpExit`, above). The winner path did not: a presence test where its
   * sibling used a provenance test.
   *
   * ⚠️ NOT SHIPPABLE ON ITS OWN — see `derivedDownstreamNotActive.test.ts`. Permitting the clear
   * exposes an incomplete unwind: the carried walkover's status and codes are reset, but the onward
   * advancement its winner made INSIDE the same structure is not taken back, leaving a participant in
   * a later round having won nothing while `getDrawInconsistencies` still reports `valid: true`.
   * `removeLinkedWinner` handles only ACROSS-link advancement (`if (!winnerTargetLink) return`).
   */
  const winnerSideResolved =
    !!winnerMatchUp?.sides?.find((s: HydratedSide) => s?.sideNumber === winnerMatchUp.winningSide)?.participant &&
    !isPropagatedExit({ matchUp: winnerMatchUp });

  /**
   * An exit RECORDED at the winnerMatchUp is a result against this source's winner, whatever the other
   * side holds.
   *
   * The NOTE above reasons that an exit with an unoccupied side can only be a pending propagated one,
   * because `checkParticipants` wants two participants. With `propagateExitStatus` it does not: a TD
   * may award a walkover to a side still waiting on its feed (G3, `exitAwardable`). That exit names
   * THIS source's winner as the one who walked over, yet `winnerDrawPositionsCount === 2` passed it as
   * inactive, so the source's winner could be flipped under it. Census seed 9000477 (COMPASS 32/29),
   * three steps: `East|1|3` decided, `East|2|2` WALKOVER to the vacant side, `East|1|3` flipped —
   * accepted, and the walkover recorded against one player was then held by the other, while the
   * first stayed in North as its loser (WINNER_NOT_ADVANCED). Provenance is what tells the recorded
   * exit from the produced one; with both positions present `winnerSideResolved` already says so.
   */
  //
  // Recorded BEFORE the opponent arrived (CA, 2026-10-04), the walkover names only the participant already
  // there. A source that feeds the VACANT, winning side decides nothing but who arrives to take it, and may
  // change freely; only the source the exited participant came from is held. Census arm 9700004 (COMPASS
  // 8/7): a DEFAULTED recorded at `West|2|1` was "active" against `West|1|2`, which feeds its empty side,
  // and the convergence written there was refused after the draw had been mutated.
  const exitedParticipantId = winnerMatchUp?.sides?.find(
    (side: HydratedSide) => side?.sideNumber && side.sideNumber !== winnerMatchUp.winningSide,
  )?.participant?.participantId;
  const winningSideOccupied = !!winnerMatchUp?.sides?.find(
    (side: HydratedSide) => side?.sideNumber === winnerMatchUp?.winningSide,
  )?.participant;
  const exitedCameFromSource =
    !!exitedParticipantId &&
    !!targetData?.matchUp?.sides?.some(
      (side: HydratedSide) => side?.participant?.participantId === exitedParticipantId,
    );
  const recordedWinnerExit =
    !!winnerMatchUp?.winningSide &&
    isExit(winnerMatchUp.matchUpStatus) &&
    !isPropagatedExit({ matchUp: winnerMatchUp }) &&
    (winningSideOccupied || exitedCameFromSource);

  // if a winnerMatchUp contains a WALKOVER and its source matchUps have no winningSides it cannot be considered active
  // unless one of its downstream matchUps is active
  if (contestedDoubleExit(loserMatchUp) || contestedDoubleExit(winnerMatchUp)) {
    return true;
  }

  if (
    !isLoserMatchUpWalkoverWithOnePlayer &&
    ((loserMatchUp?.winningSide && !loserMatchUpExit) ||
      recordedWinnerExit ||
      (winnerMatchUp?.winningSide &&
        winnerDrawPositionsCount === 2 &&
        (!isExit(winnerMatchUp?.matchUpStatus) || winnerSideResolved)))
  ) {
    return true;
  }

  // the loser's targets are already in hand — the checks above read them. The walk is a pure read,
  // so an active loser branch answers the question and the winner branch is not walked at all; the
  // winner's targets are otherwise derived only if that matchUp has not been answered in this walk.
  const loserActive =
    loserTargetData &&
    visit({
      relevantLink: targetLinks?.loserTargetLink,
      matchUpId: loserMatchUp.matchUpId,
      targetData: loserTargetData,
      inContextDrawMatchUps,
      drawDefinition,
      walk,
    });
  if (loserActive) return true;

  return (
    !!winnerMatchUp &&
    visit({
      matchUpId: winnerMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
      walk,
    })
  );
}
