import { releaseAdvancedDrawPositionAcrossLinks } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { advanceDrawPosition, assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getPairedPreviousMatchUpIsDoubleExit } from '@Query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { assignMatchUpDrawPosition } from '@Mutate/matchUps/drawPositions/assignMatchUpDrawPosition';
import { propagatesByeOnDoubleExit } from '@Mutate/matchUps/drawPositions/propagatesByeOnDoubleExit';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { applyWithdrawnExits } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { directWinner } from '@Mutate/matchUps/drawPositions/directWinner';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getByeCrossing, matchUpHoldsBye } from '@Query/drawDefinition/getByeCrossings';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findStructure } from '@Acquire/findStructure';
import { overlap } from '@Tools/arrays';
import {
  deriveExitStateFromProvenance,
  buildCarriedExitProvenance,
  carriedExitStatus,
  recordByeClaim,
  collapseDoubleExitStatus,
  retainPolicyCodes,
  buildSideExitProvenance,
  mergeSideExitProvenance,
  withdrawProducedExits,
  clearSideExitProvenance,
  setSideExitProvenance,
  getSideExitProvenance,
  getExitSides,
  deriveStatusCodes,
  producedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { CONTAINER, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_POSITION_ASSIGNED,
  ErrorType,
  MISSING_MATCHUP,
  MISSING_STRUCTURE,
} from '@Constants/errorConditionConstants';

// types
import type { MatchUpsMap, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type {
  SideExitProvenanceEntry,
  SideExitProvenance,
  MatchUpStatusUnion,
  DrawDefinition,
  Structure,
  Tournament,
  MatchUp,
  Event,
} from '@Types/tournamentTypes';

function logAdvancement(method, details) {
  pushGlobalLog({ method, ...details });
}

export function doubleExitAdvancement(params) {
  const { tournamentRecord, appliedPolicies, drawDefinition, matchUpsMap, targetData, structure, event } = params;
  const stack = 'doubleExitAdvancement';

  if (structure.structureType === CONTAINER) return decorateResult({ result: { ...SUCCESS }, stack });

  const { matchUp: sourceMatchUp, targetMatchUps, targetLinks } = targetData;
  const { loserMatchUp, winnerMatchUp, loserTargetDrawPosition } = targetMatchUps;

  // if the loserMatchUp is a WALKOVER or DEFAULTED and has no participants assigned, then it is an 'empty' exit
  // an 'empty' exit is an exit propagated by a double walkover or double default
  const loserMatchUpIsEmptyExit =
    isExit(loserMatchUp?.matchUpStatus) &&
    !loserMatchUp.sides?.map((side) => side.participantId ?? side.participant).filter(Boolean).length;

  // `=== DOUBLE_WALKOVER` here meant "is this a double exit" while naming itself so, and a
  // DOUBLE_DEFAULT loserMatchUp took the false branch — measured 14 times over the 600-seed sweep
  // window against 33 DOUBLE_WALKOVERs.
  const loserMatchUpIsDoubleExit = isDoubleExit(loserMatchUp?.matchUpStatus);

  logAdvancement(stack, {
    newline: true,
    color: 'brightyellow',
    keyColors: { sourceMatchUpId: 'brightcyan', loserMatchUpId: 'brightmagenta', winnerMatchUpId: 'brightgreen' },
    sourceMatchUpId: sourceMatchUp?.matchUpId,
    sourceStatus: params.matchUpStatus,
    sourceDP: JSON.stringify(sourceMatchUp?.drawPositions),
    loserMatchUpId: loserMatchUp?.matchUpId,
    loserStatus: loserMatchUp?.matchUpStatus,
    loserDP: JSON.stringify(loserMatchUp?.drawPositions),
    loserTargetDP: loserTargetDrawPosition,
    loserIsEmptyExit: loserMatchUpIsEmptyExit,
    loserIsDoubleExit: loserMatchUpIsDoubleExit,
    loserSides: JSON.stringify(
      loserMatchUp?.sides?.map((s) => ({ sn: s.sideNumber, pid: s.participantId?.slice(0, 8), fed: s.participantFed })),
    ),
    winnerMatchUpId: winnerMatchUp?.matchUpId,
    winnerStatus: winnerMatchUp?.matchUpStatus,
    winnerDP: JSON.stringify(winnerMatchUp?.drawPositions),
  });

  /**
   * A loser matchUp that is ALREADY a BYE can still be owed one — and before this branch, NOTHING is what it got.
   *
   * `handleLoserMatchUp` offers a target exactly two things: a BYE (`advanceByeToLoserMatchUp`) or a
   * produced WALKOVER (`conditionallyAdvanceDrawPosition`). The guard below read
   * `matchUpStatus !== BYE` as "there is nothing to place here" and skipped the function, so on this
   * path the target received **neither** — the position a double exit was supposed to feed was left
   * vacant, and nobody could ever fill it. A matchUp is `BYE` as soon as ONE of its positions is a
   * draw BYE; the OTHER can still be that vacant slot, and that combination is the whole defect.
   *
   * CA's rule, 2026-09-18: *a DOUBLE_WALKOVER in a source structure can logically only produce a BYE
   * in a target structure* — a double exit removes BOTH competitors, so nobody will ever arrive, and
   * a position that will receive nobody is a BYE.
   *
   * ## Why this is gated on the policy, when the rule reads as universal
   *
   * Two alternatives to the gate were built and measured, and both are worse:
   *
   * 1. **Route this case through `handleLoserMatchUp` with the policy off** — it takes the
   *    produced-WALKOVER branch and writes a `winningSide` onto a matchUp that contains a BYE,
   *    AWARDING IT TO THE BYE, which `exitAwardable` forbids outright (CA, 2026-09-17). It also
   *    leaves the downstream slot unclaimable, so it fixes nothing.
   * 2. **Place the BYE unconditionally** — census over six arms: **2 closed, 11 OPENED.** Three
   *    `ERR_EXISTING_POSITION_ASSIGNMENT` after mutating, three `WINNING_SIDE_ADVANCEMENT_MISMATCH`,
   *    and a `BYE_WON` on COMPASS. A drawPosition is a number in ONE structure, and an unconditional
   *    BYE placement pushes it into occupied positions across a link — the trap #4907 closed in five
   *    other places.
   *
   * So the semantic is right, and since #5029 it is the default (`propagatesByeOnDoubleExit`); `doubleExitPropagateBye:
   * false` keeps the older behaviour. Behind
   * the policy the census is **0 closed, 0 opened, 0 changed** on all six arms.
   *
   * `assignDrawPositionBye` returns early on a position that already holds a BYE, so this is a no-op
   * wherever the slot is already settled.
   */
  const loserTargetStillOpen = !!(
    propagatesByeOnDoubleExit(appliedPolicies) &&
    loserMatchUp?.matchUpStatus === BYE &&
    loserTargetDrawPosition !== undefined &&
    !getPositionAssignments({
      structureId: targetLinks?.loserTargetLink?.target?.structureId,
      drawDefinition,
    }).positionAssignments?.find((assignment) => assignment.drawPosition === loserTargetDrawPosition)?.participantId
  );

  if (loserTargetStillOpen) {
    const result = advanceByeToLoserMatchUp({
      loserTargetLink: targetLinks?.loserTargetLink,
      loserTargetDrawPosition,
      tournamentRecord,
      drawDefinition,
      sourceMatchUp,
      loserMatchUp,
      matchUpsMap,
      event,
    });
    if (result?.error) return decorateResult({ result, stack });
  }

  /**
   * A FIRST_MATCHUP loser link carries a loser only if it WAS their first match.
   *
   * `isFedLoserEligible` states that rule — zero prior SCORED wins — and the engine applies it on
   * the ordinary loser path (`directLoser`) and on the swap path (`reconcileFedLoserEligibility`).
   * The double-exit path applied it NOWHERE, on either branch below, so a produced exit travelled a
   * first-match link for participants who had already won a match.
   *
   * Measured on FIRST_MATCH_LOSER_CONSOLATION 16/16 `nonRandom: 20324524` (2026-09-21): both of
   * `Main|2|1`'s drawPositions carry **one prior win**, so neither is a first-match loser and
   * nothing about that matchUp belongs in the consolation. Its DOUBLE_WALKOVER was carried through
   * the consolation BYE into `Consolation|3|1` anyway, taking side 1 — the very side the winner of
   * `Consolation|1|1` then advanced into. A participant and the exit that should not be there ended
   * up on the same side, and she was awarded a win that never advanced.
   *
   * `getDrawInconsistencies` reports that as `WINNER_NOT_ADVANCED` using THIS SAME predicate, which
   * is how the engine came to contradict its own integrity check: the check knew the rule and the
   * propagation did not.
   *
   * **This does not narrow CA's ruling of 2026-09-20** — *"the missing WALKOVER [must be] advanced
   * past the BYE in consolation R2P1"* — which was driven on a MAIN ROUND 1 double walkover. A
   * round-1 loser has zero prior wins, is eligible, and still carries onward exactly as certified.
   * What changes is only the case the rule was never true of.
   *
   * Prior rounds ONLY, as `reconcileFedLoserEligibility` counts them: a win in the matchUp being
   * exited is not a PRIOR win.
   */
  let loserFeedEligible = true;
  const loserTargetLink = targetLinks?.loserTargetLink;
  if (loserMatchUp && loserTargetLink?.linkCondition === FIRST_MATCHUP) {
    const { structure: sourceStructure } = findStructure({
      structureId: sourceMatchUp?.structureId,
      drawDefinition,
    });
    const { matchUps: structureMatchUps } = getAllStructureMatchUps({
      afterRecoveryTimes: false,
      structure: sourceStructure,
      inContext: true,
      drawDefinition,
      event,
    });
    const priorRounds = (structureMatchUps ?? []).filter(
      (matchUp) => (matchUp.roundNumber ?? 0) < (sourceMatchUp?.roundNumber ?? 0),
    );
    const anyEligible = (sourceMatchUp?.drawPositions ?? [])
      .filter(Boolean)
      .some((drawPosition) =>
        isFedLoserEligible({ sourceMatchUps: priorRounds, loserDrawPosition: drawPosition, loserTargetLink }),
      );

    if (!anyEligible) {
      logAdvancement(stack, {
        color: 'yellow',
        decision: 'FIRST_MATCHUP_ineligible__no_loser_propagation',
        drawPositions: JSON.stringify(sourceMatchUp?.drawPositions),
        sourceRound: sourceMatchUp?.roundNumber,
      });
      // The LOSER side only. The winner target below still advances — a double exit's winner
      // progression has nothing to do with who may be fed into a consolation.
      loserFeedEligible = false;
    }
  }

  if (loserFeedEligible && loserMatchUp && loserMatchUp.matchUpStatus !== BYE) {
    const result = handleLoserMatchUp({
      loserMatchUpIsEmptyExit,
      loserMatchUpIsDoubleExit,
      loserTargetDrawPosition,
      appliedPolicies,
      tournamentRecord,
      drawDefinition,
      sourceMatchUp,
      loserMatchUp,
      targetLinks,
      matchUpsMap,
      params,
      event,
      stack,
    });
    if (result?.error) return decorateResult({ result, stack });
  } else if (
    loserFeedEligible &&
    loserMatchUp &&
    !loserTargetStillOpen &&
    isExit(producedExitStatus(params.matchUpStatus))
  ) {
    /**
     * A LOSER TARGET THAT ALREADY HOLDS A BYE STILL RECEIVES THE EXIT — it just does not become one.
     *
     * The guard above reads `matchUpStatus !== BYE` as "there is nothing to do here", and for the
     * two things `handleLoserMatchUp` offers — placing a BYE, or awarding a produced WALKOVER —
     * that is right: a matchUp holding a BYE needs neither, and awarding it would hand the match to
     * the BYE, which `exitAwardable` forbids outright (CA, 2026-09-17). But there is a third thing
     * the target is owed, and it was getting nothing at all: THE RECORD OF THE EXIT THAT ARRIVED.
     *
     * CA, 2026-09-20, driving FIRST_MATCH_LOSER_CONSOLATION 8 in TMX with BYEs on Main
     * drawPositions 1 and 2 and `MAIN|1|2` a DOUBLE_WALKOVER: *"the DOUBLE_WALKOVER from Main R1P2
     * does not produce a WALKOVER as the matchUpStatusCode provenance for consolation dp4 as it
     * should, and also that the missing WALKOVER is not advanced past the [...] BYE in consolation
     * R2P1 which should produce a matchUpStatus: WALKOVER in consolation R3P1 with winningSide: 2."*
     *
     * `conditionallyAdvanceDrawPosition` is the same function the winner target goes through and it
     * already keeps a BYE-held target a BYE, derives the arriving side structurally and projects the
     * codes from provenance — so the loser target is handed to it rather than to a second
     * derivation of those rules. No `walkoverWinningSide` is passed: on a BYE-held target it has
     * none, and supplying one is what awarded the BYE in the alternative measured above.
     *
     * Then the exit travels, which in a consolation can mean more than one hop — `CONSOLATION|1|1`
     * and `CONSOLATION|2|1` are both BYE-held in the scenario above.
     */
    const result = stampExitOnByeHeldLoserTarget({
      loserTargetDrawPosition,
      drawDefinition,
      sourceMatchUp,
      loserMatchUp,
      matchUpsMap,
      params,
      stack,
    });
    if (result.error) return decorateResult({ result, stack });

    /**
     * AN EXIT THAT WAS NOT RECORDED HERE DOES NOT TRAVEL ON FROM HERE.
     *
     * The stamp above declines a target position that already holds a BYE — *"it is SETTLED, and the
     * BYE is its record"* — and the carry ran regardless, so an exit was carried onward from a
     * matchUp it had never been recorded on. When the loser target's own seat is the BYE, the loser
     * who will never arrive is ALREADY represented, by that BYE, and the matchUp's other side is
     * free to hold somebody real.
     *
     * Measured 2026-09-28 on MODIFIED_FEED_IN_CHAMPIONSHIP and CURTIS_CONSOLATION 16/16 with
     * `Main|1|1` and `Main|1|2` both DOUBLE_WALKOVER. `Main|2|1` converges; its loser seat,
     * Consolation drawPosition 4, has been a BYE since the first exit. The carry put an exit on
     * `Consolation|3|2` side 2 — the side `Consolation|2|4`'s survivor advances into:
     *
     *     Consolation|3|2   WALKOVER ws=1   dp=3.11   both sides hold a PARTICIPANT
     *     Consolation|4|1   TO_BE_PLAYED    dp=3.11   and both of them advanced out of it
     *
     * A played match was decided as a walkover against somebody who was there, the final filled
     * from one semifinal, and the other semifinal's score was refused with
     * `ERR_EXISTING_POSITION_ASSIGNMENT` after the mutation had written.
     */
    if (result.stamped) {
      // derived fresh: the write above changed the draw the next hop is decided on
      const refreshed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
      const carried = carryExitOnward({
        fromMatchUp: refreshed.find((m) => m.matchUpId === loserMatchUp.matchUpId) ?? loserMatchUp,
        EXIT: producedExitStatus(params.matchUpStatus),
        originMatchUpId: sourceMatchUp?.matchUpId,
        inContextDrawMatchUps: refreshed,
        drawDefinition,
        matchUpsMap,
        params,
        stack,
      });
      if (carried.error) return decorateResult({ result: carried, stack });
    }
  }
  if (winnerMatchUp) {
    logAdvancement(stack, {
      color: 'cyan',
      decision: 'conditionallyAdvanceWinner',
      winnerMatchUpId: winnerMatchUp.matchUpId,
    });
    const result = conditionallyAdvanceDrawPosition({
      ...params,
      matchUpId: winnerMatchUp.matchUpId,
      targetMatchUp: winnerMatchUp,
      tournamentRecord,
      sourceMatchUp,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

function handleLoserMatchUp({
  loserMatchUpIsEmptyExit,
  loserMatchUpIsDoubleExit,
  loserTargetDrawPosition,
  appliedPolicies,
  tournamentRecord,
  drawDefinition,
  sourceMatchUp,
  loserMatchUp,
  targetLinks,
  matchUpsMap,
  params,
  event,
  stack,
}) {
  const { loserTargetLink } = targetLinks;
  const propagateBye = propagatesByeOnDoubleExit(appliedPolicies);

  /**
   * Does this target hold a RESERVED drawPosition for the arrival the double exit will never send?
   *
   * This read `loserMatchUp.feedRound && loserMatchUp.sides?.[0]?.participantFed`, and the second
   * conjunct said nothing: `participantFed` was assigned to side 1 by `getSide` **iff** the round was
   * a feed round, so the condition tested `feedRound` twice. It is one of the two disjuncts that admit
   * a double exit's BYE into the target structure — a real decision path standing on a round-level
   * flag wearing a per-side name. Same family as punch-list P3.
   *
   * `hasFedDrawPosition` is the fact the pair was groping for, and it is not the same as `feedRound`:
   * `DOUBLE_ELIMINATION`'s Main final is a feed round that reserves nothing. See `getRoundMatchUps`.
   */
  const targetFedIn = loserMatchUp.hasFedDrawPosition;

  if (propagateBye || targetFedIn) {
    logAdvancement(stack, {
      color: 'cyan',
      decision: 'advanceByeToLoserMatchUp',
      propagateBye,
      targetFedIn: !!targetFedIn,
    });
    return advanceByeToLoserMatchUp({
      loserTargetDrawPosition,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      sourceMatchUp,
      loserMatchUp,
      matchUpsMap,
      event,
    });
  }

  if (loserMatchUpIsEmptyExit) {
    return handleEmptyExitLoser({
      loserTargetDrawPosition,
      drawDefinition,
      sourceMatchUp,
      loserMatchUp,
      matchUpsMap,
      params,
      stack,
    });
  }

  if (loserMatchUpIsDoubleExit) {
    logAdvancement(stack, {
      color: 'brightyellow',
      decision: 'SKIP_loserMatchUp_already_doubleExit',
      loserMatchUpId: loserMatchUp.matchUpId,
    });
    return { ...SUCCESS };
  }

  const { feedRound, matchUpId } = loserMatchUp;
  // the side opposite the loser's target position, read structurally: a lone position's side is not its index
  const loserTargetSide = getDrawPositionSideNumber({
    matchUp: { ...loserMatchUp, sides: undefined },
    structureId: loserMatchUp.structureId,
    drawPosition: loserTargetDrawPosition,
    drawDefinition,
  });
  const walkoverWinningSide: number | undefined = feedRound ? 2 : loserTargetSide && 3 - loserTargetSide;
  logAdvancement(stack, {
    color: 'cyan',
    decision: 'conditionallyAdvanceLoser',
    feedRound,
    walkoverWinningSide,
    loserMatchUpId: matchUpId,
  });
  return conditionallyAdvanceDrawPosition({
    ...params,
    targetMatchUp: loserMatchUp,
    walkoverWinningSide,
    tournamentRecord,
    sourceMatchUp,
    matchUpId,
  });
}

/**
 * Record an arriving exit on a loser target that already holds a BYE, WITHOUT making it one.
 *
 * The two things `handleLoserMatchUp` can offer a target — a BYE, or a produced WALKOVER — are both
 * wrong here, which is why the guard that skips this case exists. What the target is owed is the
 * third thing: the record of the exit that arrived at the drawPosition the loser link named, on
 * that position's own side, with the matchUp still reading `BYE`.
 *
 * The exiting side is derived the way this file's sibling loser paths already derive it —
 * `handleLoserMatchUp`'s `walkoverWinningSide` and `handleEmptyExitLoser`'s `exitingSideNumber` —
 * from where `loserTargetDrawPosition` sits in the target's ascending `drawPositions`, and side 1
 * on a feed round because a fed position IS side 1 (`draw-positions.md` rule 4).
 *
 * This is NOT the derivation CA rejected on 2026-09-20. That one asked which of two positions had
 * ADVANCED, a question the array genuinely cannot answer. This one is handed the drawPosition by
 * the loser link itself and only has to locate it.
 *
 * Only the arriving side is stamped. The BYE beside it has an origin too — the source structure's
 * own BYE — but establishing it needs the paired feeder's status, which is `buildSideExitProvenance`'s
 * job on the winner path and not a fact this write knows. An unattributed entry is worse than none.
 */
function stampExitOnByeHeldLoserTarget({
  loserTargetDrawPosition,
  drawDefinition,
  sourceMatchUp,
  loserMatchUp,
  matchUpsMap,
  params,
  stack,
}): { error?: ErrorType; success?: boolean; stamped?: boolean } {
  // THE TARGET POSITION MUST BE GENUINELY VACANT. A loser target drawPosition that already holds a
  // draw BYE is not an empty slot awaiting an arrival — it is SETTLED, and the BYE is its record.
  // Stamping an exit there says "this side came from a double walkover" about a side that came from
  // the draw, which is false. Measured 2026-09-20 on FIRST_MATCH_LOSER_CONSOLATION 8 with BOTH Main
  // first-round matchUps double-walked-over: `Consolation|2|1` drawPosition 1 IS a BYE, and without
  // this test it gained a WALKOVER origin that `byeMeetingAProducedExit` pins as a reserved slot.
  // A position holding a PARTICIPANT is likewise not ours — somebody already arrived there.
  const { positionAssignments } = getPositionAssignments({ structureId: loserMatchUp.structureId, drawDefinition });
  const targetAssignment = positionAssignments?.find(
    (assignment) => assignment.drawPosition === loserTargetDrawPosition,
  );
  if (targetAssignment?.bye || targetAssignment?.participantId) return { ...SUCCESS, stamped: false };

  // the loser's target side, read structurally: a lone position's side is not its index
  const targetSide = getDrawPositionSideNumber({
    matchUp: { ...loserMatchUp, sides: undefined },
    structureId: loserMatchUp.structureId,
    drawPosition: loserTargetDrawPosition,
    drawDefinition,
  });
  const exitingSideNumber = loserMatchUp.feedRound ? 1 : targetSide;
  if (!targetSide || (exitingSideNumber !== 1 && exitingSideNumber !== 2)) {
    return { ...SUCCESS, stamped: false };
  }

  const noContextLoserMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === loserMatchUp.matchUpId,
  );
  if (!noContextLoserMatchUp) return { error: MISSING_MATCHUP };

  // ACCUMULATE: the other side can already carry an origin recorded by an earlier propagation.
  const provenance = {
    ...getSideExitProvenance({ matchUp: noContextLoserMatchUp }),
    ...buildCarriedExitProvenance({
      sourceMatchUpId: sourceMatchUp?.matchUpId,
      previousMatchUpStatus: params.matchUpStatus,
      matchUpStatus: params.matchUpStatus,
      exitingSideNumber,
    }),
  };

  logAdvancement(stack, {
    color: 'brightcyan',
    keyColors: { decision: 'brightgreen' },
    decision: 'BYE_HELD_loser_target_records_exit',
    loserMatchUpId: loserMatchUp.matchUpId,
    loserTargetDrawPosition,
    exitingSideNumber,
  });

  const result = modifyMatchUpScore({
    matchUpStatusCodes: retainPolicyCodes(noContextLoserMatchUp),
    appliedPolicies: params.appliedPolicies,
    matchUpId: loserMatchUp.matchUpId,
    matchUp: noContextLoserMatchUp,
    // the BYE is untouched, and a BYE is never won
    matchUpStatus: BYE,
    removeScore: true,
    context: stack,
    drawDefinition,
  });
  if (result.error) return result;

  mergeSideExitProvenance({ matchUp: noContextLoserMatchUp, provenance });
  return { ...SUCCESS, stamped: true };
}

function handleEmptyExitLoser({
  loserTargetDrawPosition,
  drawDefinition,
  sourceMatchUp,
  loserMatchUp,
  matchUpsMap,
  params,
  stack,
}) {
  // WHICH double exit this convergence becomes, from BOTH origins rather than the arriving one
  // alone. `loserMatchUp` already carries the exit produced by the first arrival, which IS the other
  // side's origin.
  //
  // Reading only `params.matchUpStatus` made the stored status a function of ENTRY ORDER: measured
  // on SINGLE_ELIMINATION 8 and 16, the same two feeders give DOUBLE_DEFAULT one way and
  // DOUBLE_WALKOVER the other, while the per-side facts are identical in both.
  //
  // Passing the target's PRODUCED exit beside the arriving RAW status is sound because
  // `producedExitStatus` preserves the flavour family — DOUBLE_DEFAULT produces DEFAULTED, both
  // default-flavoured — so the collapse classifies them the same either way.
  const DOUBLE_EXIT = collapseDoubleExitStatus([params.matchUpStatus, loserMatchUp?.matchUpStatus]);

  const noContextLoserMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === loserMatchUp.matchUpId,
  );

  logAdvancement(stack, {
    color: 'brightred',
    decision: 'EMPTY_EXIT_converting_to_DOUBLE_EXIT',
    loserMatchUpId: loserMatchUp.matchUpId,
    currentStatus: loserMatchUp.matchUpStatus,
    newStatus: DOUBLE_EXIT,
  });

  if (noContextLoserMatchUp) {
    // This is the SECOND arrival at a convergence: the target already carries the exit the first
    // arrival produced, and — measured over the exit-propagation suite, 222 of 223 firings — already
    // carries that side's provenance. Recording the arriving side and projecting the codes from the
    // union is what makes the pair order-invariant.
    //
    // The arriving side is where the cascade is directing this loser. `loserTargetDrawPosition` names
    // that drawPosition and the target's `drawPositions` are in side order, which is the same
    // derivation the sibling non-empty branch uses for `walkoverWinningSide`. Measured across those
    // 223 firings it resolves to a valid side every time, and to the side the existing provenance
    // does NOT hold in every case but one — a re-score of the same side, where replacing is right.
    // read structurally: a lone position's side is not its index (0 when the position is absent, which the
    // provenance builder refuses, as `indexOf + 1` gave)
    const exitingSideNumber =
      getDrawPositionSideNumber({
        matchUp: { ...loserMatchUp, sides: undefined },
        structureId: loserMatchUp.structureId,
        drawPosition: loserTargetDrawPosition,
        drawDefinition,
      }) ?? 0;
    const arrivingProvenance = buildCarriedExitProvenance({
      previousMatchUpStatus: params.matchUpStatus,
      sourceMatchUpId: sourceMatchUp?.matchUpId,
      matchUpStatus: params.matchUpStatus,
      exitingSideNumber,
    });
    // `getSideExitProvenance` rather than the raw field so the union still finds the first arrival's
    // origin under LEGACY write mode, where nothing writes the native field.
    const provenance = {
      ...getSideExitProvenance({ matchUp: noContextLoserMatchUp }),
      ...arrivingProvenance,
    };

    // GENERATED, not hand-built. The previous pair was `[{ matchUpStatus: EXIT, previousMatchUpStatus:
    // DOUBLE_EXIT, sideNumber: 1 }, { matchUpStatus: EXIT, previousMatchUpStatus: params.matchUpStatus,
    // sideNumber: 2 }]`, which was wrong in three ways at once: side 1's `previousMatchUpStatus` was
    // the target's own COLLAPSED status rather than an origin, both sides took the ARRIVING exit's
    // produced status, and the write replaced an array whose other entry was still true. In the mixed
    // case that stored `{ matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_WALKOVER }` — a
    // walkover origin producing a default — and it stored the opposite in the opposite entry order.
    const matchUpStatusCodes = retainPolicyCodes(noContextLoserMatchUp);

    const result = modifyMatchUpScore({
      ...params,
      matchUp: noContextLoserMatchUp,
      matchUpId: loserMatchUp.matchUpId,
      matchUpStatus: DOUBLE_EXIT,
      matchUpStatusCodes,
      winningSide: undefined,
      removeScore: true,
      context: stack,
    });
    if (result.error) return result;

    mergeSideExitProvenance({ matchUp: noContextLoserMatchUp, provenance });

    // THE CONVERGENCE IS NOW A DOUBLE EXIT, AND A DOUBLE EXIT PRODUCES AN EXIT DOWNSTREAM.
    //
    // `doubleExitAdvancement` does exactly that for the matchUp the director scored — its winner
    // target gets a produced exit through `conditionallyAdvanceDrawPosition`. A matchUp that becomes
    // a double exit HERE, as a consequence, got nothing: the cascade treated it as a leaf and
    // stopped. So the second of two adjacent double exits converted the consolation matchUp and its
    // own winner target was never told.
    //
    // Reported from TMX 2026-09-20, FIRST_MATCH_LOSER_CONSOLATION 8, `Main|1|1` and `Main|1|2` both
    // DOUBLE_WALKOVER: `Consolation|1|1` collapses to DOUBLE_WALKOVER correctly, and
    // `Consolation|2|1` — which holds a propagated BYE on one side and the slot fed from `1|1` on
    // the other — stayed `BYE` with NO `matchUpStatusCodes` at all, so nothing reached
    // `Consolation|3|1`. CA: *"we're just missing that produced WALKOVER in r2p1 that encounters
    // the BYE."*
    //
    // The winner target is re-derived from FRESH in-context matchUps: the write above has just
    // changed this matchUp's status, and `positionTargets` reads that status.
    const onward = advanceConvergedWinner({
      convergedMatchUp: loserMatchUp,
      drawDefinition,
      matchUpsMap,
      DOUBLE_EXIT,
      params,
      stack,
    });
    if (onward?.error) return onward;

    return result;
  }

  return { ...SUCCESS };
}

/**
 * A CONVERGENCE PRODUCES AN EXIT FOR ITS WINNER TARGET, and for nothing else.
 *
 * Two routes reach a convergence and they must leave the same draw. `handleEmptyExitLoser` is taken
 * when the second exit arrives at a target nobody has ever sat in; `advanceFromTarget` is taken when
 * it arrives on a RE-SCORE, at a target whose occupant this mutation has just removed. Both call
 * this, so the onward step cannot differ between them.
 *
 * ONLY THE WINNER TARGET. The convergence's own LOSER link is deliberately not walked: whatever the
 * link feeds was already resolved when the FIRST exit arrived — a seat that can never receive a
 * loser is a BYE by then (`propagateUnfillableLoserBye`) — and the second exit changes nothing about
 * it. Walking it anyway was measured 2026-09-28 on COMPASS and OLYMPIC 16/16: recursing into
 * `doubleExitAdvancement` stamped a carried exit on `South|2|1` side 1, which is the seat the loser
 * of `West|1|2` arrives into — a real participant marked as carrying an exit nobody delivered.
 *
 * The winner target is re-derived from FRESH in-context matchUps: the convergence's status changed a
 * moment ago, and `positionTargets` reads that status.
 */
function advanceConvergedWinner({ convergedMatchUp, drawDefinition, matchUpsMap, DOUBLE_EXIT, params, stack }) {
  const refreshed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
  const convergedTargets = positionTargets({
    matchUpId: convergedMatchUp.matchUpId,
    inContextDrawMatchUps: refreshed,
    drawDefinition,
  });
  if (convergedTargets.error) return decorateResult({ result: convergedTargets, stack });
  const convergedWinnerMatchUp = convergedTargets?.targetMatchUps?.winnerMatchUp;
  if (!convergedWinnerMatchUp) return { ...SUCCESS };

  logAdvancement(stack, {
    color: 'cyan',
    decision: 'CONVERGED_advance_its_own_winner',
    from: convergedMatchUp.matchUpId,
    to: convergedWinnerMatchUp.matchUpId,
  });
  return conditionallyAdvanceDrawPosition({
    ...params,
    // derived for the matchUp the exit ARRIVED in; it names a different seat in the next one
    walkoverWinningSide: undefined,
    inContextDrawMatchUps: refreshed,
    matchUpId: convergedWinnerMatchUp.matchUpId,
    targetMatchUp: convergedWinnerMatchUp,
    sourceMatchUp: inContextLoserMatchUp(refreshed, convergedMatchUp.matchUpId) ?? convergedMatchUp,
    matchUpStatus: DOUBLE_EXIT,
    drawDefinition,
    matchUpsMap,
  });
}

/** a double exit's own position, found in its target, is taken back across the links it was advanced over (P44) */
function withdrawOwnAdvancement({
  targetMatchUpDrawPositions,
  sourceDrawPositions,
  ...release
}: Omit<Parameters<typeof releaseAdvancedDrawPositionAcrossLinks>[0], 'drawPosition'> & {
  targetMatchUpDrawPositions: number[];
  sourceDrawPositions: number[];
}) {
  for (const drawPosition of targetMatchUpDrawPositions.filter((position) => sourceDrawPositions.includes(position))) {
    releaseAdvancedDrawPositionAcrossLinks({ ...release, drawPosition });
  }
}

/** the converged matchUp as the cascade now sees it — its status changed a moment ago */
function inContextLoserMatchUp(inContextDrawMatchUps: HydratedMatchUp[], matchUpId: string) {
  return inContextDrawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
}

// 1. Assigns a WALKOVER or DEFAULTED status to the winnerMatchUp
// 2. Advances any drawPosition that is already present
function conditionallyAdvanceDrawPosition(params) {
  const { inContextDrawMatchUps, tournamentRecord, drawDefinition, sourceMatchUp, targetMatchUp, matchUpsMap } = params;

  const structure = drawDefinition.structures.find(({ structureId }) => structureId === targetMatchUp.structureId);

  // What the double exit PRODUCES, through the single implementation rather than another inline copy
  // of the mapping — it read `=== DOUBLE_DEFAULT ? DEFAULTED : WALKOVER` at both sites, two of four
  // independent derivations of one rule.
  //
  // A UNIFORM double exit produces its own flavour: DOUBLE_DEFAULT produces DEFAULTED. The
  // unattributed WALKOVER belongs to the MIXED case and is decided by `collapseDoubleExitStatus`
  // choosing DOUBLE_WALKOVER for the convergence, not here. (An earlier revision of this comment
  // said either flavour produces a WALKOVER; that over-read the ruling and the code was reverted
  // while the comment was not.)
  const EXIT = producedExitStatus(params.matchUpStatus) as string;

  const stack = 'conditionallyAdvanceDrawPosition';

  const noContextTargetMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === targetMatchUp.matchUpId,
  );
  if (!noContextTargetMatchUp) return { error: MISSING_MATCHUP };

  const sourceDrawPositions = sourceMatchUp?.drawPositions ?? [];
  let targetMatchUpDrawPositions = noContextTargetMatchUp.drawPositions?.filter(Boolean);

  const sameStructure = sourceMatchUp?.structureId === targetMatchUp.structureId;

  logAdvancement(stack, {
    newline: true,
    color: 'magenta',
    keyColors: { targetMatchUpId: 'brightcyan', sourceMatchUpId: 'brightyellow' },
    targetMatchUpId: targetMatchUp.matchUpId,
    targetStructureId: targetMatchUp.structureId?.slice(0, 8),
    targetRound: [targetMatchUp.roundNumber, targetMatchUp.roundPosition],
    targetDP: JSON.stringify(noContextTargetMatchUp.drawPositions),
    targetStatus: noContextTargetMatchUp.matchUpStatus,
    targetFeedRound: targetMatchUp.feedRound,
    sourceMatchUpId: sourceMatchUp?.matchUpId,
    sourceStructureId: sourceMatchUp?.structureId?.slice(0, 8),
    sourceRound: sourceMatchUp ? [sourceMatchUp.roundNumber, sourceMatchUp.roundPosition] : undefined,
    sourceDP: JSON.stringify(sourceDrawPositions),
    sameStructure,
    paramMatchUpStatus: params.matchUpStatus,
    EXIT,
  });

  // ensure targetMatchUp.drawPositions does not contain sourceMatchUp.drawPositions
  // this covers the case where a pre-existing advancement was made
  if (sameStructure && overlap(sourceDrawPositions, targetMatchUpDrawPositions)) {
    /**
     * A DOUBLE EXIT ADVANCES NOBODY, so a position of its own found downstream is taken back.
     *
     * **Punch-list P44.** The filter below has always known such a position can be here — *"this
     * covers the case where a pre-existing advancement was made"* — and removed it from a LOCAL
     * copy. The matchUp kept it, and `hasDrawPosition` and `walkoverWinningSide` further down are
     * read from the matchUp. Two defects followed, measured 2026-09-28 on the 192-cell matrix:
     *
     *  - ORDER DEPENDENCE, 52 cells. The position is the seat the FIRST exit's arrival advanced as
     *    the pending winner, so which seat it is depends on which double exit was entered first.
     *  - THE EXIT AWARDED ITS OWN WIN, 24 cells. With exactly one position present the winner is
     *    read off that position, and it is the exit's own: `ws=1 dp=2` with the origin on side 1.
     *
     * It was not cosmetic either. Played to exhaustion over 56 draws the position sat in a seat a
     * real participant needed: stranded participants 36 -> 12, decided matchUps 704 -> 728, 24
     * draws better, 32 unchanged, none worse.
     *
     * What the target holds instead is a PENDING exit — the produced status, the origin on its
     * side, no position and no winner — which is what a later-round target (`Main|3|1`) always
     * held. The award is made when an opponent arrives. CA, 2026-09-28: *"let's go with the
     * change."*
     *
     * `withdrawingExit` because this IS the produced exit's own advancement being taken back, which
     * is the one case `releaseAdvancedDrawPosition`'s produced-exit guard must not protect.
     */
    if (isDoubleExit(params.matchUpStatus))
      withdrawOwnAdvancement({
        fromRoundNumber: targetMatchUp.roundNumber,
        structureId: targetMatchUp.structureId,
        targetMatchUpDrawPositions,
        withdrawingExit: true,
        sourceDrawPositions,
        event: params.event,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
      });
    targetMatchUpDrawPositions = targetMatchUpDrawPositions.filter(
      (drawPosition) => !sourceDrawPositions.includes(drawPosition),
    );
  }

  // if there are 2 drawPositions in targetMatchUp, something is wrong
  if (sameStructure && targetMatchUpDrawPositions.length > 1)
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });

  const { pairedPreviousMatchUpIsDoubleExit, pairedPreviousMatchUp } = getPairedPreviousMatchUpIsDoubleExit({
    ...params,
    structure, // use locally-computed structure (from targetMatchUp.structureId)
  });

  logAdvancement(stack, {
    color: 'magenta',
    keyColors: { pairedMatchUpId: 'brightcyan' },
    pairedMatchUpId: pairedPreviousMatchUp?.matchUpId,
    pairedRound: pairedPreviousMatchUp
      ? [pairedPreviousMatchUp.roundNumber, pairedPreviousMatchUp.roundPosition]
      : undefined,
    pairedStatus: pairedPreviousMatchUp?.matchUpStatus,
    pairedStructureId: pairedPreviousMatchUp?.structureId?.slice(0, 8),
    pairedIsDoubleExit: pairedPreviousMatchUpIsDoubleExit,
  });

  // get the targets for the targetMatchUp
  const targetData = positionTargets({
    matchUpId: targetMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack });
  const { targetMatchUps, targetLinks } = targetData;

  const {
    loserTargetDrawPosition: nextLoserTargetDrawPosition,
    winnerMatchUp: nextWinnerMatchUp,
    loserMatchUp: nextLoserMatchUp,
  } = targetMatchUps;

  if (nextLoserMatchUp) {
    const { loserTargetLink } = targetLinks;
    const result = advanceByeToLoserMatchUp({
      loserTargetDrawPosition: nextLoserTargetDrawPosition,
      loserMatchUp: nextLoserMatchUp,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      sourceMatchUp,
      matchUpsMap,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  const drawPositions = noContextTargetMatchUp.drawPositions?.filter(Boolean) ?? [];

  const hasDrawPosition = drawPositions.length === 1;
  // the one position present, when it is alone: not a side read, so it holds for either stored shape
  const [lonePosition] = drawPositions;
  /**
   * A PRODUCED EXIT IS AWARDED ONLY TO AN OPPONENT IN PLACE — CA 2026-09-20, and 2026-10-03 (Q3): it lands
   * pending until the opponent arrives. The lone drawPosition here can be a seat nobody occupies yet: one a
   * BYE advanced forward, still waiting for the loser fed into it from another structure. Census w1 9000477
   * (COMPASS 32/29): `South|1|3`'s double walkover produced into `South|2|2`, whose dp 7 had been BYE-advanced
   * from `South|1|4` and held no participant; the walkover was awarded to dp 7 and advanced it on, and when
   * the seat's real occupant arrived later `South|3|1` held two positions from one feeder.
   */
  const occupiedDrawPosition = hasDrawPosition && isOccupiedSeat({ structure, drawPosition: lonePosition });
  const walkoverWinningSide =
    params.walkoverWinningSide ||
    (occupiedDrawPosition &&
      getExitWinningSide({
        drawPosition: lonePosition,
        matchUpId: targetMatchUp.matchUpId,
        inContextDrawMatchUps,
      })) ||
    undefined;

  /**
   * ALREADY AN EXIT, AND NOT THE PROVENANCE FORM OF THE QUESTION — measured, 2026-09-27.
   *
   * This reads as a STATUS test standing in for a provenance question, which is the P3 defect class,
   * and the obvious correction is to ask whether either side already carries a DELIVERED exit:
   *
   *     carriedExitStatus(prov?.[side]) && isDoubleExit(prov?.[side]?.previousMatchUpStatus)
   *
   * **Do not.** It was built and run under P37's eviction and took the suite from 4 failures to 21 —
   * `exitPropagationMatrix` alone lost 13 cells across COMPASS and FIRST_ROUND_LOSER_CONSOLATION,
   * plus three census replays. It re-routes convergences this rule has nothing to do with, which is
   * the same result P41 records for the analogous stronger form of `progressExitStatus`' RULE 4 gate.
   *
   * The state this gate MISSES is real and is tracked separately: a target holding two DELIVERED
   * double-walkover origins with `dps=[5, 6]` fails `!drawPositions.length`, so it settles as a single
   * `WALKOVER` with a `winningSide` while its own provenance describes a convergence. That is
   * pre-existing — measured identical on clean `dev` — and it wants the convergence PR and census arm
   * P41 asks for, not a rider on the eviction.
   */
  /**
   * A RECORDED exit is an exit too. A director may record a WALKOVER or DEFAULTED before the opponent arrives
   * (#5160): its lone occupant has EXITED and the winningSide names the seat still to arrive. A produced exit
   * reaching that seat meets an exit standing there, so the two converge and nobody wins (factory-e2, 2026-10-04:
   * *"a player recorded as WALKOVER/DEFAULTED has exited and can't later win that matchUp"*). Read structurally:
   * the occupant sits on the side opposite the winningSide. Without this the occupant was awarded the produced
   * exit (census arm 9700004, COMPASS 8/7: `West|2|1` DEFAULTED towards its vacant seat read WALKOVER won by the
   * defaulted participant).
   */
  const recordedExitAwaitingThisSeat =
    isExit(noContextTargetMatchUp.matchUpStatus) &&
    !!noContextTargetMatchUp.winningSide &&
    hasDrawPosition &&
    getExitWinningSide({
      drawPosition: lonePosition,
      matchUpId: targetMatchUp.matchUpId,
      inContextDrawMatchUps,
    }) !== noContextTargetMatchUp.winningSide;
  // THE OCCUPANT OPPOSITE CARRIES AN EXIT, so the exit produced here meets it and converges (RULE 4) rather than
  // awarding them. Read off provenance on the occupant's side: the fed seat the exit arrives on can still be listed
  // (a first-round seat stays in the array once its participant is removed), so a count of one position does not
  // describe it. Census 20099689 (FIRST_ROUND_LOSER_CONSOLATION 8/7, `doubleExitPropagateBye: false`): `Main|1|4`
  // re-scored from a played win to a DOUBLE_DEFAULT produced a DEFAULTED onto its old loser's seat in
  // `Consolation|1|2`, opposite `Main|1|3`'s walkover loser carrying their WALKOVER, and awarded it to that loser.
  const occupantCarriesExit =
    isExit(noContextTargetMatchUp.matchUpStatus) &&
    !!params.walkoverWinningSide &&
    !!carriedExitStatus(getSideExitProvenance({ matchUp: noContextTargetMatchUp })?.[params.walkoverWinningSide]);
  const existingExit =
    (isExit(noContextTargetMatchUp.matchUpStatus) && (!drawPositions.length || recordedExitAwaitingThisSeat)) ||
    occupantCarriesExit;

  // Derived HERE, not at the top of the function, because this is where the other origin is known:
  // `existingExit` means the target already carries the exit the first arrival produced. See
  // handleEmptyExitLoser for the order-dependence measurement this removes.
  const DOUBLE_EXIT = collapseDoubleExitStatus([params.matchUpStatus, noContextTargetMatchUp.matchUpStatus]);

  // A BYE-HELD matchUp STAYS A BYE. The exit still lands — its side is recorded below and it
  // advances onward — but the matchUp itself is a BYE because one of its drawPositions carries one,
  // and that is a fact about the DRAW, not about this cascade. Overwriting it with the produced exit
  // is how `Consolation|2|1` lost its BYE while gaining a WALKOVER nobody could play.
  //
  // Read from the positionAssignment, never from `matchUpStatus`: by the time the cascade reaches
  // here the status may already have been overwritten, which is the same reason
  // `removeDoubleExit.targetDrawPositionIsBye` reads the assignment.
  const targetHoldsBye = !!getPositionAssignments({ structure })?.positionAssignments?.some(
    (assignment) => assignment.bye && drawPositions.includes(assignment.drawPosition),
  );

  const producedStatus = existingExit ? DOUBLE_EXIT : EXIT;
  const matchUpStatus = targetHoldsBye ? BYE : producedStatus;

  /**
   * A BYE IS NEVER WON, so a BYE-held target takes no winningSide — not even one a caller supplied.
   *
   * The status above already refuses to overwrite the BYE. The winningSide beside it was left
   * alone, so the matchUp came out reading `BYE` while also naming a winner, and that winner is
   * whatever drawPosition the arithmetic landed on — which on this path is the VACANT one.
   *
   * Measured on CURTIS_CONSOLATION 8/7 (`nonRandom: 20020173`), the sweep's most-reachable
   * `BYE_WITH_WINNING_SIDE`: score `Main|1|4` a double walkover, `Main|1|3` a double default, then
   * CORRECT `Main|1|4` to an ordinary win and correct it BACK. The cascade places a propagated BYE
   * at Play Off drawPosition 2 and `handleLoserMatchUp` hands down
   * `walkoverWinningSide = 2 - drawPositions.indexOf(2) = 1`, so:
   *
   *     [Play Off]  1:-  2:BYE(propagated)
   *     Play Off|1|1   BYE   ws=1   dps=[1, 2]      <- side 1 holds NOBODY
   *
   * The rule is the engine's own and is stated in three places already: `getExitWinningSide` —
   * *"A BYE draw position can never be the winning side"* — `exitAwardable`, and the
   * `doubleExitPropagateBye` docblock's *"a matchUp containing a BYE may never carry a
   * winningSide."* Nothing enforced it at the one site that writes the status.
   *
   * `removeWinningSide` as well as withholding it: this write is reached on a RE-SCORE, where the
   * matchUp can already carry the award an earlier pass gave it, and passing `undefined` does not
   * remove one.
   */
  // a double exit has no winner: two exits meeting here (the second produced into a seat where one already stands,
  // or a held exit converging at settle) take back a winningSide the first exit had been awarded (parity, FMLC 16/16:
  // a DOUBLE_DEFAULT kept the DEFAULTED's side 2 and the two statuses' draws came apart)
  const noWinner = targetHoldsBye || recordedExitAwaitingThisSeat || isDoubleExit(matchUpStatus);
  const awardedWinningSide = noWinner ? undefined : walkoverWinningSide;

  logAdvancement(stack, {
    color: 'brightyellow',
    keyColors: { matchUpStatus: 'brightgreen', existingExit: 'brightred' },
    existingExit,
    matchUpStatus,
    targetCurrentStatus: noContextTargetMatchUp.matchUpStatus,
    targetDP: JSON.stringify(drawPositions),
    hasDrawPosition,
    walkoverWinningSide,
  });

  // a fed target round has no paired previous matchUp within this structure: its other
  // side arrives over a feed link from another structure. sourceSideNumber is then
  // derived by inferSourceSideNumber's feedRound branch, so undefined is expected here,
  // not exceptional.
  const inContextPairedPreviousMatchUp = pairedPreviousMatchUp
    ? inContextDrawMatchUps.find((candidate) => candidate.matchUpId === pairedPreviousMatchUp.matchUpId)
    : undefined;

  const sourceSideNumber = inferSourceSideNumber({
    inContextPairedPreviousMatchUp,
    pairedPreviousMatchUp,
    walkoverWinningSide,
    sourceMatchUp,
    targetMatchUp,
    stack,
  });

  const sourceMatchUpStatus = params.matchUpStatus;
  const pairedMatchUpStatus = pairedPreviousMatchUp?.matchUpStatus;

  // CODES first-class: the facts, keyed by sideNumber and attributed to their source.
  const newProvenance = keepCarriedExitOnPairedSide({
    existing: getSideExitProvenance({ matchUp: noContextTargetMatchUp }),
    built: buildSideExitProvenance({
      pairedMatchUpId: pairedPreviousMatchUp?.matchUpId,
      sourceMatchUpId: sourceMatchUp?.matchUpId,
      pairedMatchUpStatus,
      sourceMatchUpStatus,
      sourceSideNumber,
    }),
    sourceSideNumber,
  });

  // P37 MEASUREMENT: the projection is gone; the array keeps only the POLICY tenant.
  const matchUpStatusCodes = retainPolicyCodes(noContextTargetMatchUp);

  logAdvancement(stack, {
    color: 'brightgreen',
    keyColors: { matchUpStatus: 'brightcyan', winningSide: 'brightyellow' },
    action: 'modifyMatchUpScore',
    targetMatchUpId: noContextTargetMatchUp.matchUpId,
    matchUpStatus,
    winningSide: awardedWinningSide,
    matchUpStatusCodes: JSON.stringify(matchUpStatusCodes),
    sourceStatus: sourceMatchUpStatus,
    pairedStatus: pairedMatchUpStatus,
  });

  const result = modifyMatchUpScore({
    ...params,
    removeWinningSide: noWinner,
    winningSide: awardedWinningSide,
    matchUp: noContextTargetMatchUp,
    matchUpStatusCodes,
    context: stack,
    matchUpStatus,
  });
  if (result.error) return decorateResult({ result, stack });

  // ACCUMULATE, not replace: one side's origin can arrive before the other's, so a write that knows
  // only its own side must not wipe an origin recorded earlier. CA, 2026-09-12: *"provenance is
  // provenance… where did the sides come from. One origin can arrive before the other."*
  mergeSideExitProvenance({ matchUp: noContextTargetMatchUp, provenance: newProvenance });

  /**
   * TWO DELIVERED EXITS ARE A DOUBLE EXIT — reconciled AFTER the merge, because that is when both are
   * known.
   *
   * **Punch-list P42.** `existingExit` above decides whether this write produces a DOUBLE_EXIT or a
   * single one, and it decides it BEFORE `newProvenance` is merged in. On a RE-SCORE that is too early:
   * the target can already hold one side's delivered exit from an earlier propagation while this write
   * delivers the other, and `existingExit`'s `!drawPositions.length` half is false because the target
   * holds positions. So it settled as a single exit WITH a winningSide — a matchUp nobody played showing
   * a winner — while its own provenance recorded an exit delivered into both sides.
   *
   * Measured before the fix: **52 of 192 cells** across seven draw types, independent of
   * `propagateExitStatus`, and reported by `UNCOLLAPSED_CONVERGENCE` at every one. Zero on the 600-cell
   * census, because ordinary play never reaches it — it needs a single exit RE-SCORED UP to a double,
   * which is the direction `correctionDivergence` had never swept.
   *
   * ## Why AFTER the write rather than in the gate
   *
   * Changing `existingExit` to ask provenance was built and measured the same day: **4 failures to 21**,
   * losing 13 `exitPropagationMatrix` cells and three census replays. It re-routes convergences on the
   * DIRECT path too, and the sweep shows the direct path is already correct. This reconciliation cannot
   * do that: it fires only where the status and the provenance already CONTRADICT each other, which on
   * the direct path is never.
   *
   * ## Why BOTH sides must be DELIVERED
   *
   * The first version tested only that `deriveExitStateFromProvenance` disagreed with the status, and it
   * over-fired: 52 findings became 58, with six NEW divergences in SINGLE_ELIMINATION where
   * `Main|3|1` went `DEFAULTED` to `WALKOVER`. An entry whose `previousMatchUpStatus` is a single exit or
   * a `COMPLETED` records that the side's occupant ARRIVED having won upstream, not that an exit was
   * delivered into it — feeding those to the collapse applies the mixed-flavour rule to a convergence
   * that is not one. `isDoubleExit` on `previousMatchUpStatus` is the same discriminator
   * `deriveStatusCodes` and `UNCOLLAPSED_CONVERGENCE` use, so the three agree by construction.
   *
   * ## WHAT THIS DOES NOT FIX, and it is half the defect
   *
   * The status is corrected; the ONWARD PROPAGATION that should follow from it is not. The re-scored path
   * still diverges from the direct one at the next round — `correctionDivergence`'s UPGRADE arm still
   * reports **52 severe**, now on the consequence rather than the status. That is the same missing half
   * P40 names as *"cross-structure re-advancement"*, and it is why that arm's baseline is not lowered
   * here.
   */
  const merged = getSideExitProvenance({ matchUp: noContextTargetMatchUp });
  const bothDelivered = ([1, 2] as const).every((sideNumber) =>
    isDoubleExit(merged?.[sideNumber]?.previousMatchUpStatus),
  );
  /**
   * A CONVERGENCE AWARDS NOBODY, so `advanceFromTarget` must not treat one of its seats as a winner.
   *
   * **Punch-list P42, the propagation half.** The reconciliation below corrects the STATUS of a
   * convergence. It does not stop the advancement that runs immediately afterwards.
   *
   * `advanceFromTarget` picks its drawPosition as
   * `targetMatchUpDrawPositions[walkoverWinningSide - 1]`, and `handleLoserMatchUp` derives
   * `walkoverWinningSide` from where the arriving exit LANDED — `2 - drawPositions.indexOf(…)`. So
   * the second delivered exit nominates the OTHER seat as a winner, and that seat is the one the
   * FIRST exit was delivered into.
   *
   * TRACED, 2026-09-28, FIRST_ROUND_LOSER_CONSOLATION 8/8 `nonRandom: 9000230` — `Main|1|2` a single
   * WALKOVER, `Main|1|1` a DOUBLE_WALKOVER, then `Main|1|2` RE-SCORED UP to a double:
   *
   * ```text
   * step 2  exit -> Consolation dp 1;  walkoverWinningSide = 2;  dp 2 advances  (correct: the pending winner)
   * step 3  exit -> Consolation dp 2;  walkoverWinningSide = 1;  dp 1 advances  (WRONG: dp 1 carries step 2's exit)
   * ```
   *
   * The route ordinary play takes to the same convergence, `handleEmptyExitLoser`, never asks that
   * question: it hands the convergence's winner target a produced exit and stops. So on a
   * convergence this route now does exactly the same thing, through the same function
   * (`advanceConvergedWinner`), rather than a second derivation of it.
   *
   * ## Why THIS discriminator and not `existingExit`
   *
   * `existingExit` is decided before the merge and its `!drawPositions.length` half is false on a
   * first-round matchUp, whose seats exist structurally even while empty. Asking provenance THERE was
   * built and refuted — 4 failures to 21, `exitPropagationMatrix` losing 13 cells. This asks the same
   * question the reconciliation already asks, in the same place, AFTER the merge: both sides hold a
   * DELIVERED double exit. On a first arrival only one side does, so it cannot fire there.
   *
   * ## This is one of TWO changes, and this one moves nothing alone
   *
   * `correctionDivergence`'s UPGRADE arm, severe cells of 192, each measured in isolation:
   *
   * | change | alone | together |
   * |---|---|---|
   * | this routing | 52 | |
   * | `releaseAdvancedDrawPosition` keeps a seat a PRODUCED EXIT advanced | 24 | **0** |
   *
   * Alone this cannot help, because without the other change the re-scored path has already lost
   * the advancement the convergence's exit travels with. The DOWNGRADE arm is 8 throughout.
   *
   * A THIRD change was built and removed: reading `advanceByeAdvancedDrawPosition`'s occupant from the
   * positionAssignment rather than from hydrated matchUps closed 8 cells while this routing still
   * recursed into `doubleExitAdvancement`. `advanceConvergedWinner` re-hydrates before it advances,
   * which made that read fresh by construction — reverting the third change failed no test and left
   * the sweep at zero, so it is not here.
   */
  const convergedAfterMerge = bothDelivered && !targetHoldsBye;
  {
    const derived = bothDelivered ? deriveExitStateFromProvenance(merged) : undefined;
    if (derived && !targetHoldsBye && derived.matchUpStatus !== noContextTargetMatchUp.matchUpStatus) {
      const reconcile = modifyMatchUpScore({
        ...params,
        removeWinningSide: derived.winningSide === undefined,
        winningSide: derived.winningSide,
        matchUp: noContextTargetMatchUp,
        matchUpStatus: derived.matchUpStatus,
        matchUpStatusCodes: deriveStatusCodes(noContextTargetMatchUp),
        context: `${stack}-reconcile`,
      });
      if (reconcile.error) return decorateResult({ result: reconcile, stack });
    }
  }

  return advanceFromTarget({
    pairedPreviousMatchUpIsDoubleExit,
    targetMatchUpDrawPositions,
    convergedAfterMerge,
    noContextTargetMatchUp,
    inContextDrawMatchUps,
    walkoverWinningSide,
    nextWinnerMatchUp,
    drawDefinition,
    existingExit,
    // WHAT THIS TARGET PROPAGATES, WHICH IS NOT WHAT IT DISPLAYS. `advanceFromTarget` uses this
    // value for one purpose only — the status it hands to a nested `doubleExitAdvancement` — so it
    // must be the exit the target PRODUCES, never the `BYE` the target wears because one of its own
    // drawPositions carries one. `producedExitStatus(BYE)` is `BYE`, so forwarding the display
    // status wrote a BYE onto an empty downstream matchUp that the unwind could not take back:
    // measured on FIRST_MATCH_LOSER_CONSOLATION 16/16, Consolation `r4p1` went `TO_BE_PLAYED` ->
    // `BYE` on apply and stayed `BYE` after the clear. Before the BYE override was added above,
    // `matchUpStatus` and `producedStatus` were the same value and the distinction did not exist.
    matchUpStatus: producedStatus,
    targetMatchUp,
    matchUpsMap,
    targetData,
    DOUBLE_EXIT,
    structure,
    params,
    stack,
    EXIT,
  });
}

function inferSourceSideNumber({
  inContextPairedPreviousMatchUp,
  pairedPreviousMatchUp,
  walkoverWinningSide,
  sourceMatchUp,
  targetMatchUp,
  stack,
}) {
  if (!sourceMatchUp) return undefined;

  let sourceSideNumber;

  if (targetMatchUp.feedRound) {
    // A FEED ROUND FIRST, because on one the side is a CONSTANT and the roundPosition comparison
    // below is meaningless. `draw-positions.md` rule 4: *fed positions are `{ sideNumber: 1 }`*, and
    // *"the test is structural, not numeric"* — a position that played its way here from the prior
    // round of this structure is ADVANCED, one fed from elsewhere is not. So a source sharing the
    // TARGET's structure advanced into it and takes side 2; anything else was fed and takes side 1.
    //
    // THIS BRANCH WAS UNREACHABLE for a convergence advancing within one structure. Both the source
    // and the paired previous matchUp live in the consolation, so the `roundPosition` branch matched
    // first and inferred the side from round ORDER. Measured 2026-09-20 on
    // FIRST_MATCH_LOSER_CONSOLATION 8 with `Main|1|1` and `Main|1|2` both DOUBLE_WALKOVER:
    // `Consolation|2|1` holds `[1, 4]`, dp1 the BYE fed from Main and dp4 advanced from
    // `Consolation|1|1`; the roundPosition branch returned side 1, this one returns side 2.
    //
    // `feedRound`, NOT `hasFedDrawPosition`. They are two facts (`draw-positions.md` rule 4), and
    // this is the SIDE-ORDERING question — the one `feedRound` still answers. `hasFedDrawPosition`
    // answers "does this round RESERVE a slot", which is what #4932 moved `getTargetMatchUp` onto.
    //
    // Deliberately NOT derived by locating the advancing drawPosition in the array. WHICH of the two
    // consolation positions advances depends on the ORDER the director entered the two double
    // walkovers, and rule 5 forbids reading the array's shape at all: `[2, 5]` cannot say which of
    // its members was fed.
    sourceSideNumber = sourceMatchUp.structureId === targetMatchUp.structureId ? 2 : 1;
  } else if (sourceMatchUp?.structureId === inContextPairedPreviousMatchUp?.structureId) {
    // if structureIds are equivalent then sideNumber is inferred from roundPositions
    sourceSideNumber = sourceMatchUp.roundPosition < pairedPreviousMatchUp?.roundPosition ? 1 : 2;
  } else if (walkoverWinningSide) {
    sourceSideNumber = 3 - walkoverWinningSide;
  }

  logAdvancement(stack, {
    color: 'cyan',
    keyColors: { sourceSideNumber: 'brightgreen' },
    sourceSideNumber,
    sourceStructureId: sourceMatchUp.structureId?.slice(0, 8),
    pairedStructureId: inContextPairedPreviousMatchUp?.structureId?.slice(0, 8),
    targetStructureId: targetMatchUp.structureId?.slice(0, 8),
    sameStructureAsPaired: sourceMatchUp?.structureId === inContextPairedPreviousMatchUp?.structureId,
    targetFeedRound: targetMatchUp.feedRound,
    sourceRP: sourceMatchUp.roundPosition,
    pairedRP: pairedPreviousMatchUp?.roundPosition,
  });

  return sourceSideNumber;
}

function advanceFromTarget({
  pairedPreviousMatchUpIsDoubleExit,
  targetMatchUpDrawPositions,
  convergedAfterMerge,
  noContextTargetMatchUp,
  inContextDrawMatchUps,
  walkoverWinningSide,
  nextWinnerMatchUp,
  drawDefinition,
  existingExit,
  matchUpStatus,
  targetMatchUp,
  matchUpsMap,
  targetData,
  DOUBLE_EXIT,
  structure,
  params,
  stack,
  EXIT,
}) {
  // when there is an existing 'Double Exit", the created "Exit" is replaced
  // with a "Double Exit" and move on to advancing from this position
  if (convergedAfterMerge && !existingExit) {
    return advanceConvergedWinner({
      convergedMatchUp: targetMatchUp,
      drawDefinition,
      matchUpsMap,
      DOUBLE_EXIT,
      params,
      stack,
    });
  }

  if (existingExit) {
    logAdvancement(stack, {
      color: 'brightred',
      decision: 'EXISTING_EXIT_triggers_recursive_doubleExitAdvancement',
      targetMatchUpId: noContextTargetMatchUp.matchUpId,
      matchUpStatus,
    });
    return doubleExitAdvancement({
      ...params,
      matchUpStatus,
      targetData,
    });
  }

  if (!nextWinnerMatchUp) return decorateResult({ result: { ...SUCCESS }, stack });

  // any remaining drawPosition in targetMatchUp should be advanced
  const drawPositionToAdvance =
    targetMatchUpDrawPositions.length === 2
      ? targetMatchUpDrawPositions[walkoverWinningSide - 1]
      : targetMatchUpDrawPositions[0];

  const { positionAssignments } = getPositionAssignments({ structure });
  const assignment = positionAssignments?.find((a) => a.drawPosition === drawPositionToAdvance);

  const noContextNextWinnerMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === nextWinnerMatchUp.matchUpId,
  );
  const nextWinnerMatchUpDrawPositions = noContextNextWinnerMatchUp?.drawPositions?.filter(Boolean);
  const nextWinnerMatchUpHasDrawPosition = nextWinnerMatchUpDrawPositions.length === 1;

  if (drawPositionToAdvance) {
    if (assignment?.bye) {
      return advanceByeAdvancedDrawPosition({
        nextWinnerMatchUpDrawPositions,
        nextWinnerMatchUpHasDrawPosition,
        noContextNextWinnerMatchUp,
        inContextDrawMatchUps,
        nextWinnerMatchUp,
        drawDefinition,
        matchUpStatus,
        targetMatchUp,
        matchUpsMap,
        params,
        stack,
        EXIT,
      });
    }

    // A winner target in ANOTHER structure has its OWN drawPosition space. The Decider of a
    // DOUBLE_ELIMINATION holds drawPositions 1 and 2; handing it a Main-draw position is not an
    // occupied slot but a FOREIGN one, and `assignMatchUpDrawPosition` has no way to say so — it
    // reports "drawPosition already assigned", and it reports it AFTER this cascade has written
    // four structures. Measured on DOUBLE_ELIMINATION 8/8: target Decider r1p1, existing
    // drawPositions [1, 2], requested drawPosition 3.
    //
    // Cross-structure progression is the link's job, so it goes through directWinner like any
    // other linked advancement rather than through a raw drawPosition assignment.
    if (nextWinnerMatchUp.structureId !== targetMatchUp.structureId) {
      directExitWinnerAcrossLink({
        sourceStructureId: targetMatchUp.structureId,
        sourceMatchUp: noContextTargetMatchUp,
        drawPositionToAdvance,
        inContextDrawMatchUps,
        drawDefinition,
        matchUpsMap,
        targetData,
        params,
      });
      return decorateResult({ result: { ...SUCCESS }, stack });
    }

    return assignMatchUpDrawPosition({
      matchUpId: nextWinnerMatchUp.matchUpId,
      drawPosition: drawPositionToAdvance,
      inContextDrawMatchUps,
      drawDefinition,
    });
  } else if (pairedPreviousMatchUpIsDoubleExit) {
    if (!noContextNextWinnerMatchUp) return { error: MISSING_MATCHUP };

    const nextMatchUpStatus = isExit(noContextNextWinnerMatchUp.matchUpStatus) ? EXIT : DOUBLE_EXIT;

    const result = modifyMatchUpScore({
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      appliedPolicies: params.appliedPolicies,
      matchUp: noContextNextWinnerMatchUp,
      matchUpStatus: nextMatchUpStatus,
      matchUpStatusCodes: [],
      removeScore: true,
      context: stack,
      drawDefinition,
    });

    if (result.error) return decorateResult({ result, stack });

    if (nextMatchUpStatus === DOUBLE_EXIT) {
      const targetData = positionTargets({
        matchUpId: targetMatchUp.matchUpId,
        inContextDrawMatchUps,
        drawDefinition,
      });
      if (targetData.error) return decorateResult({ result: targetData, stack });
      const advancementResult = doubleExitAdvancement({
        ...params,
        matchUpId: targetMatchUp.matchUpId,
        matchUpStatus: nextMatchUpStatus,
        targetData,
      });
      if (advancementResult.error) return advancementResult;
    }
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

/**
 * THE PAIRED SIDE'S ENTRY IS AN INFERENCE; A CARRIED EXIT ALREADY ON THAT SIDE IS A FACT.
 *
 * `buildSideExitProvenance` stamps a convergence as a pair: the source's side from the source, the other side from
 * the PAIRED PREVIOUS matchUp in this structure. That is who would have arrived there by advancing — but on a fed
 * round the occupant can have arrived another way, fed over a link CARRYING an exit, and `progressExitStatus` has
 * already recorded that exit on the side. Merging the pair replaced it.
 *
 * Census 20035463 (FEED_IN_CHAMPIONSHIP 8/5, forward play only): the loser of `Main|2|2`, walked over, is fed into
 * `Consolation|2|1` and passes its BYE into `Consolation|3|1` carrying the WALKOVER. A DOUBLE_WALKOVER at
 * `Consolation|2|2` then converges there, and the pair stamp wrote side 1 as `{ BYE }` from `Consolation|2|1` — the
 * walked-over occupant's exit was erased, and `STALLED_POSITION` reported somebody who had exited as stranded
 * (CA, 2026-09-29: *"an occupant who exited is not waiting"*).
 *
 * So the paired side's entry yields to an existing entry that carries an exit, unless it carries one itself.
 */
function keepCarriedExitOnPairedSide({
  sourceSideNumber,
  existing,
  built,
}: {
  existing?: SideExitProvenance;
  built?: SideExitProvenance;
  sourceSideNumber?: number;
}): SideExitProvenance | undefined {
  if (!built || (sourceSideNumber !== 1 && sourceSideNumber !== 2)) return built;
  const pairedSideNumber = sourceSideNumber === 1 ? 2 : 1;
  if (!carriedExitStatus(existing?.[pairedSideNumber]) || carriedExitStatus(built[pairedSideNumber])) return built;
  const kept: SideExitProvenance = { ...built };
  delete kept[pairedSideNumber];
  return Object.keys(kept).length ? kept : undefined;
}

/**
 * The side a drawPosition occupies in a matchUp, read from the STORED matchUp and its structure's assignments — never
 * from a hydrated view, which a cascade can have outrun. A BYE position occupies no side: `advanceByeAdvancedDrawPosition`
 * relies on that to refuse an award to a BYE (CA, 2026-09-27: a BYE is never won).
 */
function getStructuralOccupiedSide({
  drawDefinition,
  drawPosition,
  structureId,
  matchUp,
}: {
  drawDefinition: DrawDefinition;
  drawPosition?: number;
  structureId?: string;
  matchUp: MatchUp;
}): number | undefined {
  const structure = findStructure({ drawDefinition, structureId })?.structure;
  if (!structure) return undefined;
  const assignment = getPositionAssignments({ structure })?.positionAssignments?.find(
    (candidate) => candidate.drawPosition === drawPosition,
  );
  if (assignment?.bye) return undefined;
  return getDrawPositionSideNumber({ drawDefinition, drawPosition, structureId, matchUp });
}

function advanceByeAdvancedDrawPosition({
  nextWinnerMatchUpDrawPositions,
  nextWinnerMatchUpHasDrawPosition,
  noContextNextWinnerMatchUp,
  inContextDrawMatchUps,
  nextWinnerMatchUp,
  drawDefinition,
  matchUpStatus,
  targetMatchUp,
  matchUpsMap,
  params,
  stack,
  EXIT,
}) {
  // WO/WO advanced by BYE
  const nextTargetData = positionTargets({
    matchUpId: noContextNextWinnerMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (nextTargetData.error) return decorateResult({ result: nextTargetData, stack });

  if (nextWinnerMatchUpHasDrawPosition) {
    const nextDrawPositionToAdvance = nextWinnerMatchUpDrawPositions.find(Boolean);

    // WHICH SIDE THE ADVANCING POSITION OCCUPIES — not which side wins.
    //
    // READ STRUCTURALLY, from the stored matchUp and the structure's own assignments. `inContextDrawMatchUps` is the
    // view this cascade started from, and an unwind earlier in the same cascade can have taken positions out of the
    // target since: census de 9305831 (DOUBLE_ELIMINATION 8/5, `allowChangePropagation`) re-scored `Backdraw|3|1` from
    // a win to a DOUBLE_DEFAULT, and the view still showed the Main final as `[dp3, dp4]` after dp4 had gone. The
    // positional fallback then put Ola (dp3, side 2) on side 1, awarded the final to the empty fed slot, and left Ola
    // alone in the Decider. A BYE position still occupies no side — that refusal is what this gate carries (below).
    const structuralSide = getStructuralOccupiedSide({
      drawPosition: nextDrawPositionToAdvance,
      matchUp: noContextNextWinnerMatchUp,
      structureId: nextWinnerMatchUp.structureId,
      drawDefinition,
    });
    const occupiedSide =
      structuralSide ||
      getExitWinningSide({
        drawPosition: nextDrawPositionToAdvance,
        matchUpId: noContextNextWinnerMatchUp.matchUpId,
        inContextDrawMatchUps,
      });

    // WHAT ADVANCED THROUGH THE BYE IS AN EXIT, NOT A WINNER.
    //
    // This function exists for "WO/WO advanced by BYE": the position it carries forward is a
    // PRODUCED exit, and behind it is nobody. Awarding the match to the side that position occupies
    // makes the exit itself the winner and reserves the slot against an opponent who can never
    // arrive — the dead-reservation shape. The exit belongs to that side and the OTHER side wins,
    // which is `progressExitStatus` RULE 2: *the side WITHOUT the exit wins, and it wins even while
    // still empty, because it is the side that will receive the eventual opponent.*
    //
    // CA, 2026-09-20: *"dp4's provenance was the double walkover propagated by the bye and it should
    // not be the winning side; the winningSide should be 2, the side yet to arrive."*
    //
    // A position holding a real PARTICIPANT genuinely advanced and keeps the old behaviour — that is
    // the discriminator, and it is the presence of somebody rather than the shape of the array.
    const advancingParticipantId = inContextDrawMatchUps
      .find((candidate) => candidate.matchUpId === noContextNextWinnerMatchUp.matchUpId)
      ?.sides?.find((side) => side.drawPosition === nextDrawPositionToAdvance)?.participantId;

    /**
     * WHICH SIDE THE EXIT ARRIVES ON IS A QUESTION ABOUT THE FEEDER, NOT ABOUT A DRAWPOSITION — P29.
     *
     * `occupiedSide` above is read off `nextWinnerMatchUpDrawPositions.find(Boolean)`, i.e. THE FIRST
     * DRAWPOSITION ALREADY SITTING IN THE TARGET. That is only the exit's own slot while the target
     * holds no other position — and a fed matchUp routinely does, because a feed link RESERVES its
     * drawPosition before the participant arrives. When it does, the exit is attributed to the side
     * that will be filled and the award goes to the side that can never be, which is the P29 shape:
     * *a produced WALKOVER awarded to the side that carries the exit*, so the participant who does
     * turn up loses a matchUp against nobody.
     *
     * Measured 2026-09-26 on `FEED_IN_CHAMPIONSHIP 16/16`, seeds 397-400 — `Consolation|4|1`
     * DOUBLE_WALKOVER, `Consolation|5|1` BYE-held, target `Consolation|6|1` the consolation final:
     *
     *   drawPositions [1]      dp1 is RESERVED for the LOSER of Main r4 (a BOTTOM_UP feed link)
     *   occupiedSide  1        read off dp1 -- the fed slot, not the exit's
     *   awarded       ws 2     the side the dead Consolation|5|1 would have filled
     *   then          the Main final is played, its loser arrives at dp1 / side 1, and LOSES
     *
     * `getExitArrivalSideNumber` answers the question structurally instead, of the FEEDER, and its
     * docblock already states why the position-keyed reader cannot serve here. On a feed round it
     * returns `draw-positions.md` rule 4 directly: a position fed from elsewhere is side 1, one that
     * advanced from the prior round of the SAME structure is side 2. For the cell above that is 2 —
     * the exit — so the winner is side 1, the fed slot, which is where the participant does arrive.
     *
     * RULE 2 is unchanged and so is CA's 2026-09-20 direction that the side yet to arrive wins while
     * still empty: *"dp4's provenance was the double walkover propagated by the bye and it should not
     * be the winning side; the winningSide should be 2, the side yet to arrive."* Only the
     * identification of WHICH side carries the exit changes. The positional derivation is kept as the
     * fallback for a target whose feeders cannot be resolved, so a structure this helper cannot read
     * behaves exactly as before rather than silently losing its award.
     */
    const arrivalSideNumber = getExitArrivalSideNumber({
      inContextDrawMatchUps,
      nextWinnerMatchUp,
      sourceMatchUp: targetMatchUp,
    });

    /**
     * `occupiedSide` STAYS THE GATE, because its emptiness is what carries the BYE refusal.
     *
     * `getExitWinningSide` returns `undefined` for a BYE drawPosition on purpose — *"A BYE draw
     * position can never be the winning side"* — so `!occupiedSide` was never merely a null check: it
     * is how this expression declines to award anything when the position advancing through is a BYE.
     *
     * #4988 replaced it with `!exitSideNumber`, where `exitSideNumber = arrivalSideNumber ??
     * occupiedSide`. `arrivalSideNumber` is derived structurally and resolves even when the position is
     * a BYE, so the guard stopped firing and the award landed on the BYE's own side. Measured:
     * `BYE_WON` went from **0 to 13** in `src/tests/mutations/exitPropagation` with
     * `doubleExitPropagateBye` on — *"matchUpStatus WALKOVER awards winningSide 2 to side 2, which is a
     * BYE (drawPosition 7)"* at `Backdraw|3|2`, a matchUp holding a hole and a propagated BYE and no
     * participant at all.
     *
     * CA, 2026-09-27: *"there can never be { winningSide } with a value in a matchUp with
     * matchUpStatus: BYE. If two BYEs encounter each other then a BYE is produced for the next matchUp,
     * rinse and repeat."*
     *
     * So the gate is restored and `arrivalSideNumber` is used only to choose WHICH side, once an award
     * is owed at all. P29's correction is untouched: at `FEED_IN_CHAMPIONSHIP 16/16 Consolation|6|1`
     * `occupiedSide` is 1 (a real fed position, not a BYE) and `arrivalSideNumber` is 2, so the winner
     * is still side 1 — the slot the participant arrives into.
     */
    const exitSideNumber = arrivalSideNumber ?? occupiedSide;
    const opponentPresent = !!nextWinnerMatchUp.sides?.some(
      (side) => side?.sideNumber === 3 - exitSideNumber && side?.participantId && !side?.bye,
    );

    /**
     * A PRODUCED EXIT LANDS PENDING UNTIL ITS OPPONENT ARRIVES, past a BYE as anywhere else — CA,
     * 2026-10-03 (Q3, `Mentat/planning/OUTCOME_PIPELINE_OPEN_QUESTIONS.md`): *"Yes, land pending"*.
     *
     * The 2026-09-20 rule (`carryExitOnward`: no winningSide until the opponent arrives, unless the
     * opponent is already in place) was never applied here, so an exit carried on past a BYE was
     * awarded to the side yet to arrive. At `FEED_IN_CHAMPIONSHIP 16/16 Consolation|6|1` (seeds 397-400)
     * that is drawPosition 1, RESERVED by the feed link for the loser of the Main final, with nobody in
     * it. P29 had moved the award onto the right side; the award itself was the defect. Pending, the
     * arrival resolves it, as it does on the direct path, and nothing is advanced from here: there is no
     * winner to advance yet.
     */
    const pending = !advancingParticipantId && !!occupiedSide && !opponentPresent;
    let winningSide: number | undefined;
    if (advancingParticipantId || !occupiedSide) winningSide = occupiedSide;
    else if (!pending) winningSide = 3 - exitSideNumber;

    /**
     * THE ORIGIN TRAVELS WITH THE EXIT, and until now it did not.
     *
     * This site wrote `matchUpStatusCodes: []` unconditionally and stamped no provenance, so the
     * matchUp ended up an exit WITH a winningSide and no record of where it came from.
     * `knownFailures.ts` names it — *"the hard-coded empty codes in
     * `advanceByeAdvancedDrawPosition`"* — and it is what 13 `exitPropagationMatrix` cells were
     * reporting as `EXIT_WITHOUT_LOSER`: that rule exempts a propagation-produced exit via
     * `isPropagatedExit`, which reads the PRESENCE of provenance, so an unstamped one looks exactly
     * like a genuine orphan — a walkover recorded against a drawPosition that lost its participant.
     *
     * THE EXITING SIDE IS THE SIDE THAT DID NOT WIN, derived as `3 - winningSide` rather than from
     * `occupiedSide` directly, because the two cases above resolve oppositely and this expression
     * is correct in both: where nobody advanced, the occupied position CARRIES the exit and the
     * other side wins; where a real participant advanced, they win and the exit sits on the empty
     * side they were awarded against.
     *
     * No winningSide means no attributable side, and an unattributed entry is worse than none —
     * the unwind would trust it. Same refusal as `buildSideExitProvenance`'s own.
     */
    let exitingSideNumber: number | undefined;
    if (isExit(EXIT) && winningSide) exitingSideNumber = 3 - winningSide;
    else if (isExit(EXIT) && pending) exitingSideNumber = exitSideNumber;
    const provenance = {
      ...getSideExitProvenance({ matchUp: noContextNextWinnerMatchUp }),
      ...buildCarriedExitProvenance({
        sourceMatchUpId: params.sourceMatchUp?.matchUpId,
        previousMatchUpStatus: params.matchUpStatus,
        matchUpStatus: params.matchUpStatus,
        exitingSideNumber,
      }),
    };

    /**
     * AN EXIT MEETING A BYE LEAVES A BYE, NOT AN EXIT LABEL — CA, 2026-10-02, confirming 2026-09-20:
     * *"a propagated exit encountering a BYE should be advanced. In both cases the BYE remains a BYE."*
     *
     * When the position advancing out of this matchUp is itself a BYE and nobody is here, the BYE is
     * what moves on, carrying the exit with it. Writing EXIT here left a matchUp labelled WALKOVER
     * with a BYE on one side and nobody on the other: 26 draws of the exit-propagation suite ended in
     * that shape (19 FIRST_MATCH_LOSER_CONSOLATION, 7 DOUBLE_ELIMINATION), each with the exit already
     * carried onward. `carryExitOnward` writes BYE in the same situation; this branch predates it.
     * The provenance below is still stamped, so the exit's origin stays on record, and the advance
     * that follows is unchanged.
     */
    const byeAdvances = !advancingParticipantId && matchUpHoldsBye({ drawDefinition, matchUp: nextWinnerMatchUp });
    const result = modifyMatchUpScore({
      matchUpStatusCodes: retainPolicyCodes(noContextNextWinnerMatchUp),
      appliedPolicies: params.appliedPolicies,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      matchUp: noContextNextWinnerMatchUp,
      matchUpStatus: byeAdvances ? BYE : EXIT,
      winningSide: byeAdvances ? undefined : winningSide,
      removeScore: true,
      context: stack,
      drawDefinition,
    });
    if (result.error) return decorateResult({ result, stack });

    // stamped AFTER the state write, for the reason progressExitStatus states: a write that blanks
    // the codes the provenance describes clears the provenance with them (#4816).
    mergeSideExitProvenance({ matchUp: noContextNextWinnerMatchUp, provenance });
    if (pending && !byeAdvances) return decorateResult({ result: { ...SUCCESS }, stack });

    const advanceResult = advanceDrawPosition({
      drawPositionToAdvance: nextDrawPositionToAdvance,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
    });
    if (advanceResult?.error) return decorateResult({ result: advanceResult, stack });

    directExitWinnerAcrossLink({
      drawPositionToAdvance: nextDrawPositionToAdvance,
      sourceMatchUp: noContextNextWinnerMatchUp,
      sourceStructureId: nextWinnerMatchUp.structureId,
      inContextDrawMatchUps,
      targetData: nextTargetData,
      drawDefinition,
      matchUpsMap,
      params,
    });

    return advanceResult;
  } else if (isExit(nextWinnerMatchUp.matchUpStatus)) {
    // if the next targetMatchUp is a double walkover or double default
    const result = doubleExitAdvancement({
      ...params,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      matchUpStatus,
      targetData: nextTargetData,
    });
    if (result.error) return decorateResult({ result, stack });
  } else if (isExit(EXIT) && !nextWinnerMatchUpDrawPositions?.length && !isAnyExit(nextWinnerMatchUp.matchUpStatus)) {
    // NOBODY ADVANCES, AND THE EXIT STILL TRAVELS.
    //
    // The branch above carries the exit onward by ADVANCING A POSITION — the opponent who already
    // reached the winner target. When that target is still empty there is no position to move, and
    // until now the cascade simply stopped here: measured on SINGLE_ELIMINATION 8 with a BYE forced
    // onto drawPosition 1, `MAIN|2|1` correctly became a BYE carrying the produced WALKOVER on side
    // 2 and `MAIN|3|1` received NOTHING — `TO_BE_PLAYED`, no winningSide, no codes.
    //
    // CA's rule, 2026-09-20: *"a propagated exit encountering a BYE should be advanced. In both
    // cases the BYE remains a BYE."* What must carry forward is the EXIT, not a participant — and a
    // BYE-held matchUp has no participant to offer, which is precisely why `getExitWinningSide`
    // refuses its drawPosition and why nothing moved.
    //
    // `isExit(EXIT)` FIRST, and it is not a formality. `EXIT` is `producedExitStatus` of whatever
    // status this cascade is carrying, and `advanceFromTarget`'s `existingExit` branch re-enters
    // `doubleExitAdvancement` with the BYE that `conditionallyAdvanceDrawPosition` derived for a
    // BYE-held target — so `params.matchUpStatus` can be `BYE`, and `producedExitStatus(BYE)` is
    // `BYE`. Without the test this branch wrote a BYE onto an empty downstream matchUp and the
    // unwind could not take it back: measured on FIRST_MATCH_LOSER_CONSOLATION 16/16, Consolation
    // `r4p1` went `TO_BE_PLAYED` -> `BYE` on apply and stayed `BYE` after the clear, opening both
    // `doubleExitUnwindRestoresBye` cells. There is no exit to carry here, so there is nothing to
    // do.
    return carryExitOnward({
      originMatchUpId: params.sourceMatchUp?.matchUpId,
      fromMatchUp: targetMatchUp,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
      params,
      stack,
      EXIT,
    });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

/**
 * WHICH SIDE OF A WINNER TARGET A GIVEN FEEDER ARRIVES ON.
 *
 * `getExitWinningSide` answers the same question keyed on a DRAW POSITION, and refuses a BYE
 * position outright — *"a BYE draw position can never be the winning side"*. That refusal is
 * correct and it is exactly why it cannot be used here: the only position the BYE-held matchUp
 * holds IS the BYE. What arrives downstream is the matchUp's produced exit, so the question is
 * asked of the FEEDER rather than of a position.
 *
 * A FEED ROUND FIRST, for the reason `inferSourceSideNumber` states: on one the side is structural
 * (`draw-positions.md` rule 4 — a position fed from elsewhere is side 1, one that advanced from the
 * prior round of the SAME structure is side 2) and the roundPosition ordering below says nothing.
 * Deliberately NOT derived from the target's `drawPositions` array, which rule 5 forbids reading
 * the shape of — and which is empty on this path in any case.
 */
function getExitArrivalSideNumber({ inContextDrawMatchUps, nextWinnerMatchUp, sourceMatchUp }) {
  if (!sourceMatchUp?.matchUpId || !nextWinnerMatchUp?.matchUpId) return undefined;

  if (nextWinnerMatchUp.feedRound) {
    return sourceMatchUp.structureId === nextWinnerMatchUp.structureId ? 2 : 1;
  }

  /**
   * THE SEAT IS ALREADY THERE — READ ITS SIDE, DO NOT PREDICT IT.
   *
   * A seat whose opponent is a draw BYE advances from generation, before anything is played, so the
   * target can already hold the source feeder's seat when the exit sets out. Rule 3 of
   * `draw-positions.md` then fixes the side — *"when both positions are present, side 1 is the LOWER
   * drawPosition … even where fed positions meet advanced ones"* — and the roundPosition order below
   * disagrees with it wherever fed seat numbers interleave with advanced ones.
   *
   * Measured 2026-09-30 by `correctionDivergenceDeep` on FIRST_MATCH_LOSER_CONSOLATION 8/5 with the
   * BYE policy off, `Main|2|2` a DOUBLE_WALKOVER: its loser seat, Consolation 2, sits beside the BYE
   * on seat 5 and was advanced into `Consolation|3|1` at generation, where it reads `[2, 4]` — seat 2
   * on SIDE 1. `Consolation|2|2` is the second feeder by roundPosition, so this returned 2, found the
   * `Consolation|2|1` winner sitting there and declined: *exit_not_carried_arriving_side_occupied*.
   * The exit stopped on the BYE-held `Consolation|2|2` and the semifinal waited on nobody, for ever.
   *
   * Only when BOTH real positions are present. With one, the side a seat ends on still depends on
   * the number the other arrives with, and the hydrated `sideNumber` of a lone position is not that
   * answer; the feeder-order rule stays the fallback there, exactly as before.
   */
  const sourcePositions = (sourceMatchUp.drawPositions ?? []).filter(Boolean);
  const targetPositions = (nextWinnerMatchUp.drawPositions ?? []).filter(Boolean);
  if (targetPositions.length === 2) {
    const seated = nextWinnerMatchUp.sides?.find(
      (side) => side?.sideNumber && side.drawPosition && sourcePositions.includes(side.drawPosition),
    );
    if (seated) return seated.sideNumber;
  }

  const feeders = inContextDrawMatchUps
    .filter(
      ({ winnerMatchUpId, loserMatchUpId }) =>
        winnerMatchUpId === nextWinnerMatchUp.matchUpId || loserMatchUpId === nextWinnerMatchUp.matchUpId,
    )
    // feeders MUST be sorted by roundPosition — the same ordering getExitWinningSide relies on
    .sort((a, b) => a.roundPosition - b.roundPosition);

  const index = feeders.findIndex(({ matchUpId }) => matchUpId === sourceMatchUp.matchUpId);
  return index === -1 ? undefined : index + 1;
}

/**
 * Can the OTHER feeder of this winner target still send somebody?
 *
 * Only a demonstrated dead end says no. A feeder that is an exit, or a BYE-held matchUp, and that
 * holds no participant on any side, has nobody left to advance; anything else — a matchUp still to
 * be played, one whose own feeders are undecided — is treated as live, because refusing there would
 * stop the exit travelling in the ordinary case where the opponent simply has not been played yet.
 */
function opponentFeederCanDeliver({ inContextDrawMatchUps, nextWinnerMatchUp, sourceMatchUp }) {
  const opponentFeeders = inContextDrawMatchUps.filter(
    ({ matchUpId, winnerMatchUpId, loserMatchUpId }) =>
      matchUpId !== sourceMatchUp?.matchUpId &&
      (winnerMatchUpId === nextWinnerMatchUp.matchUpId || loserMatchUpId === nextWinnerMatchUp.matchUpId),
  );
  // no identifiable opponent feeder is not a dead end — the other side may arrive over a link this
  // read cannot see, and refusing on an absence would silently stop the cascade
  if (!opponentFeeders.length) return true;

  return opponentFeeders.some((feeder) => {
    const holdsParticipant = feeder.sides?.some((side) => side.participantId);
    if (holdsParticipant) return true;
    /**
     * A `BYE` STATUS IS NOT A STATEMENT THAT THE FEEDER IS FINISHED.
     *
     * It says one of the feeder's positions is a draw BYE. The OTHER position can still be
     * unassigned and awaiting its own arrival, and such a feeder does deliver — the BYE advances
     * whoever lands there.
     *
     * CA, 2026-09-24, OLYMPIC 8/6: `West|2|1`'s opponent feeder `West|1|2` is `BYE` on drawPosition
     * 4 with drawPosition 3 still empty, waiting for `East|1|3`'s loser. Reading its status alone
     * said "no live opponent", so a `DOUBLE_WALKOVER` at `East|1|2` stamped the exit onto `West|1|1`
     * and then stopped. `West|2|1` stayed `TO_BE_PLAYED` with no record, in both entry orders.
     *
     * This is the pending-versus-dead distinction that `directLoser.ts` gets wrong the same way
     * (`if (!loserParticipantId) return SUCCESS`) and that `STALLED_POSITION` exists to name: an
     * empty seat is only dead once nothing can reach it. Where the two are indistinguishable from
     * here, prefer PENDING — carrying an exit records where it went and leaves a matchUp a director
     * can see, while refusing leaves no trace at all.
     */
    if (feeder.matchUpStatus === BYE) return !!feeder.sides?.some((side) => side && !side.participantId && !side.bye);
    return !isAnyExit(feeder.matchUpStatus);
  });
}

/**
 * Carry a produced exit onward from a matchUp that can advance nobody, through as many BYEs as it
 * takes, and write it where it comes to rest.
 *
 * CA's rule, 2026-09-20: *"a propagated exit encountering a BYE should be advanced. In both cases
 * the BYE remains a BYE."* The exit lands on the side the dead matchUp feeds, and the side YET TO
 * ARRIVE wins it — `progressExitStatus` RULE 2: *the side WITHOUT the exit wins, and it wins even
 * while still empty, because it is the side that will receive the eventual opponent.* Awarding it
 * to the arriving side instead would make the exit its own winner and reserve the slot against an
 * opponent who can never come.
 *
 * ## Why this RECURSES rather than taking a single hop
 *
 * A single hop is enough in a main draw, where the BYE-held matchUp feeds an ordinary one. It is
 * not enough in a consolation, where a BYE can meet a BYE. Measured 2026-09-20 on
 * FIRST_MATCH_LOSER_CONSOLATION 8 with BYEs forced onto Main drawPositions 1 and 2 and `MAIN|1|2`
 * a DOUBLE_WALKOVER: the exit reaches `CONSOLATION|1|1`, which is BYE-held; its winner target
 * `CONSOLATION|2|1` is ALSO BYE-held; only `CONSOLATION|3|1` can receive the walkover. Two hops,
 * and the intermediate one must be stamped rather than skipped or the record loses where the exit
 * went.
 *
 * ## What stops it
 *
 * - **A participant.** Somebody genuinely advanced into the target; the exit is not theirs to
 *   overwrite, and `advanceByeAdvancedDrawPosition`'s first branch already handles that case.
 * - **An exit already there.** Two exits MEETING is a convergence — `progressExitStatus` RULE 4,
 *   where nobody wins — and resolving it is a separate piece of work, left exactly as it was.
 * - **No live opponent.** The `winningSide` written below is the side yet to arrive, and that claim
 *   is only true while somebody still can. Measured 2026-09-20 on `exitPropagationMatrix`: without
 *   this test, FEED_IN_CHAMPIONSHIP and FEED_IN_CHAMPIONSHIP_TO_SF 16/16 open all four cells each.
 *   Consolation `r2p3` and `r2p4` are BOTH BYE-held and BOTH feed `r3p2`, so the walkover written
 *   there was owed to nobody; the phantom winner then advanced into the fed `r4p2` and the BYE at
 *   drawPosition 3 was awarded the match — `BYE_WITH_WINNING_SIDE`, four cells, all new.
 * - **No attributable side**, because an unattributed exit is worse than none: the unwind would
 *   then trust it. Same refusal as `buildSideExitProvenance`'s own.
 *
 * The ORIGIN is preserved across every hop rather than replaced by the matchUp the exit passed
 * through, which is the convention `progressExitStatus` RULE 1 already follows when it
 * re-propagates through a BYE with the same `sourceMatchUpId`. Recording the BYE as the origin
 * would say this side came from a BYE and lose the walkover entirely.
 *
 * The provenance is not decoration: `isPropagatedExit` reads its PRESENCE, and `EXIT_WITHOUT_LOSER`
 * fires on any exit matchUp that has a winningSide and no participant on the losing side unless
 * that exemption applies. Writing the status without the provenance would trade one defect for a
 * detector finding.
 */
function carryExitOnward({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  originMatchUpId,
  fromMatchUp,
  visited,
  params,
  stack,
  EXIT,
}: {
  params: {
    matchUpStatus?: MatchUpStatusUnion;
    appliedPolicies?: PolicyDefinitions;
    tournamentRecord?: Tournament;
    event?: Event;
  };
  inContextDrawMatchUps: HydratedMatchUp[];
  fromMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  EXIT?: MatchUpStatusUnion;
  originMatchUpId?: string;
  matchUpsMap: MatchUpsMap;
  visited?: Set<string>;
  stack: string;
}): ResultType {
  // a matchUp is visited at most once, so a malformed winner-target cycle cannot spin here
  const seen = visited ?? new Set<string>();
  if (!fromMatchUp?.matchUpId || seen.has(fromMatchUp.matchUpId)) {
    return decorateResult({ result: { ...SUCCESS }, stack });
  }
  seen.add(fromMatchUp.matchUpId);

  /**
   * DERIVED FRESH ON ENTRY, not only between hops.
   *
   * The recursion below already re-derived context for each subsequent hop, but the FIRST call took
   * whatever `advanceByeAdvancedDrawPosition` was handed — a view computed in
   * `conditionallyAdvanceDrawPosition` BEFORE this cascade's own writes. Every test below reads
   * that view, and one of them is "has somebody genuinely arrived here", which is precisely the
   * kind of fact the cascade changes as it runs.
   *
   * Measured on FIRST_MATCH_LOSER_CONSOLATION 8/8, `Main|1|1` DOUBLE_DEFAULT then `Main|1|2`
   * DEFAULTED/ws1: the stale view showed `CONSOLATION|3|1` holding a participant, so the carry
   * refused; the settled draw shows `sides=[{}, {}]` and no participant at all. The exit stopped at
   * `CONSOLATION|2|1` and the final stayed `TO_BE_PLAYED`.
   *
   * Same trap this file already names at `progressExitStatus`' provenance stamp — *"that one
   * predates the `setMatchUpState` above, and the objects it holds can be detached from
   * `drawDefinition.structures` by the time the write returns"* — and at `mergeSideExitProvenance`.
   * A propagation decision may only be taken on state derived after the writes that precede it.
   */
  const currentDrawMatchUps =
    getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? inContextDrawMatchUps;

  const fromTargets = positionTargets({
    inContextDrawMatchUps: currentDrawMatchUps,
    matchUpId: fromMatchUp.matchUpId,
    drawDefinition,
  });
  if (fromTargets.error) return decorateResult({ result: fromTargets, stack });
  let nextWinnerMatchUp = fromTargets.targetMatchUps?.winnerMatchUp;
  if (!nextWinnerMatchUp?.matchUpId) return decorateResult({ result: { ...SUCCESS }, stack });

  const arrivalSideNumber = getExitArrivalSideNumber({
    inContextDrawMatchUps: currentDrawMatchUps,
    sourceMatchUp: fromMatchUp,
    nextWinnerMatchUp,
  });
  if (!arrivalSideNumber) return decorateResult({ result: { ...SUCCESS }, stack });

  /**
   * SOMEBODY GOT THERE FIRST — ON THE SIDE THE EXIT IS ARRIVING AT.
   *
   * This asked whether the target held ANY participant, and refused. It is the slot the exit is
   * travelling TO that must be free; the other side routinely holds a participant who advanced from
   * the previous round of the same structure and has nothing to do with this cascade. `arrivalSideNumber`
   * is computed immediately above and was not consulted.
   *
   * Measured 2026-09-25 on CA's COMPASS 16/14 with the `DOUBLE_WALKOVER` entered LAST: `West|2|1`
   * holds the `West|1|2` winner on drawPosition 3 (side 2) while the exit travels to drawPosition 2
   * (side 1). The exit stopped at `West|1|1` and `West|2|1` stayed `TO_BE_PLAYED` forever. The same
   * guard refused OLYMPIC 8/6 with the opponent advanced first, and refused every clear-and-re-enter
   * sequence — one guard, three reported symptoms.
   *
   * `isAnyExit` is retained unchanged: two exits MEETING is a convergence, which
   * `progressExitStatus` RULE 4 owns rather than this carrier.
   */
  const arrivingSideOccupied = !!nextWinnerMatchUp.sides?.some(
    (side) => side?.sideNumber === arrivalSideNumber && side?.participantId,
  );
  if (!arrivingSideOccupied) {
    const released = releaseHoldersByeFromTarget({
      arrivalSideNumber,
      nextWinnerMatchUp,
      drawDefinition,
      fromMatchUp,
      matchUpsMap,
      params,
    });
    if (released) {
      nextWinnerMatchUp = {
        ...nextWinnerMatchUp,
        sideExitProvenance: released.sideExitProvenance,
        matchUpStatus: released.matchUpStatus,
        drawPositions: released.drawPositions,
        winningSide: undefined,
      };
    }
  }
  if (!arrivingSideOccupied && convergesAtTarget({ nextWinnerMatchUp, arrivalSideNumber })) {
    return convergeCarriedExit({
      inContextDrawMatchUps,
      arrivalSideNumber,
      nextWinnerMatchUp,
      originMatchUpId,
      drawDefinition,
      matchUpsMap,
      params,
      stack,
    });
  }
  if (arrivingSideOccupied || isAnyExit(nextWinnerMatchUp.matchUpStatus)) {
    logAdvancement(stack, {
      color: 'brightyellow',
      decision: arrivingSideOccupied ? 'exit_not_carried_arriving_side_occupied' : 'exit_not_carried_convergence',
      nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
      fromMatchUpId: fromMatchUp.matchUpId,
      arrivalSideNumber,
    });
    return decorateResult({ result: { ...SUCCESS }, stack });
  }

  const noContextNextWinnerMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === nextWinnerMatchUp.matchUpId,
  );
  if (!noContextNextWinnerMatchUp) return decorateResult({ result: { ...SUCCESS }, stack });

  // A BYE-HELD TARGET KEEPS ITS BYE and the exit keeps travelling. The arriving side is recorded so
  // the record says where the exit went; the status is not touched, because a BYE is a fact about
  // the DRAW rather than about this cascade.
  const holdsBye = matchUpHoldsBye({ drawDefinition, matchUp: nextWinnerMatchUp });

  if (
    !holdsBye &&
    !opponentFeederCanDeliver({ inContextDrawMatchUps, nextWinnerMatchUp, sourceMatchUp: fromMatchUp })
  ) {
    logAdvancement(stack, {
      color: 'brightyellow',
      decision: 'BYE_HELD_exit_not_carried_no_live_opponent',
      nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
      fromMatchUpId: fromMatchUp.matchUpId,
    });
    return decorateResult({ result: { ...SUCCESS }, stack });
  }

  /**
   * The opponent's side, but only when a REAL participant is already sitting on it.
   *
   * `undefined` when the slot is empty or holds a BYE, which keeps the pending case — the common one —
   * exactly as it was: no winner, resolved later by the arrival. See the write below.
   */
  const opponentSideNumber = arrivalSideNumber === 1 ? 2 : 1;
  const settledOpponentSide = nextWinnerMatchUp.sides?.find(
    (side) => side?.sideNumber === opponentSideNumber && side?.participantId && !side?.bye,
  );
  const settledOpponentSideNumber = settledOpponentSide ? opponentSideNumber : undefined;

  // ACCUMULATE: the opponent's side can already carry an origin of its own.
  const provenance = {
    ...getSideExitProvenance({ matchUp: noContextNextWinnerMatchUp }),
    ...buildCarriedExitProvenance({
      previousMatchUpStatus: params.matchUpStatus,
      exitingSideNumber: arrivalSideNumber,
      matchUpStatus: params.matchUpStatus,
      sourceMatchUpId: originMatchUpId,
    }),
  };

  logAdvancement(stack, {
    color: 'brightcyan',
    keyColors: { decision: 'brightgreen', winningSide: 'brightyellow' },
    decision: holdsBye ? 'BYE_HELD_stamp_and_keep_walking' : 'BYE_HELD_carry_exit_onward',
    nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
    fromMatchUpId: fromMatchUp.matchUpId,
    arrivalSideNumber,
    matchUpStatus: holdsBye ? BYE : EXIT,
  });

  const result = modifyMatchUpScore({
    matchUpStatusCodes: retainPolicyCodes(noContextNextWinnerMatchUp),
    matchUpId: noContextNextWinnerMatchUp.matchUpId,
    appliedPolicies: params.appliedPolicies,
    matchUp: noContextNextWinnerMatchUp,
    // NO winningSide, EVER, FROM HERE. The exit is recorded; who wins is not this write's business.
    //
    // This used to award `3 - arrivalSideNumber` — the side yet to arrive — and it was the ONLY
    // code in the engine that set a winningSide on a matchUp holding no drawPositions. Everywhere
    // else the side is READ OFF the arriving drawPosition, which is why `getExitWinningSide` is
    // keyed on one.
    //
    // It was also redundant. Measured on SINGLE_ELIMINATION 8/7 with the award suppressed:
    //
    //   after the double walkover   MAIN|3|1  WALKOVER  ws=-   dps=null
    //   after MAIN|2|2 is played    MAIN|3|1  WALKOVER  ws=2   dps=[5]
    //
    // The arrival mechanism reaches the same answer unaided. CA ruled on 2026-09-20, having
    // recalled that the factory once did set a winningSide for a produced WALKOVER with the
    // drawPosition unknown and that it caused side-determination bugs around fed rounds and
    // drawPosition sorting: *"that is unnecessary if the winningSide will display the checkmark
    // once a participant arrives... so, you don't need to keep it."*
    //
    // A pending exit with no winningSide is a STATE, not an incomplete one: it resolves when the
    // opponent's match is played. Pre-computing the answer buys a checkmark a few clicks earlier
    // and re-introduces the one pattern this area moved away from.
    //
    // ONE EXCEPTION, added 2026-09-25: the opponent is ALREADY HERE.
    //
    // Everything above rests on an unstated precondition — that the opponent has not yet arrived, so
    // an arrival is still coming to resolve this. When they are already in place there is no future
    // arrival, and leaving it unresolved produces a `WALKOVER` holding a real participant with no
    // winner: a matchUp that is still stuck AND invisible to `getStructureInconsistencies`, whose
    // stall test requires `TO_BE_PLAYED`. Measured on CA's COMPASS 16/14 with the exit entered last.
    //
    // The side is not pre-computed here, it is READ OFF the occupied side — the same thing the
    // arrival mechanism would have read — so the objection above does not apply. RULE 2: the side
    // WITHOUT the exit wins. A BYE-held target is excluded, because a BYE is never won.
    winningSide: !holdsBye ? settledOpponentSideNumber : undefined,
    matchUpStatus: holdsBye ? BYE : EXIT,
    removeScore: true,
    context: stack,
    drawDefinition,
  });
  if (result.error) return decorateResult({ result, stack });

  // stamped AFTER the state write, for the reason progressExitStatus states: a write that blanks
  // the codes the provenance describes clears the provenance with them (#4816).
  mergeSideExitProvenance({ matchUp: noContextNextWinnerMatchUp, provenance });

  /**
   * An awarded winner must also be ADVANCED, or the walkover is a dead end.
   *
   * Only when the opponent was already in place — that is the one case this function awards a
   * `winningSide` at all (see the write above). Without this the target reads `WALKOVER ws=2` and the
   * participant never reaches the next round, which is the state CA reported: *"an advanced propagated
   * WALKOVER … encountering a participant at WEST|2|1 SHOULD advance the encountered participant to
   * WEST|3|1."*
   *
   * Same call shape as the sibling advancement earlier in this file, on freshly derived context
   * because the write above changed the draw.
   */
  if (!holdsBye && settledOpponentSideNumber && settledOpponentSide?.drawPosition) {
    logAdvancement(stack, {
      color: 'brightcyan',
      keyColors: { decision: 'brightgreen' },
      decision: 'carried_exit_advances_settled_opponent',
      nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
      drawPositionToAdvance: settledOpponentSide.drawPosition,
      winningSide: settledOpponentSideNumber,
    });
    const advanced = advanceDrawPosition({
      inContextDrawMatchUps: getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [],
      drawPositionToAdvance: settledOpponentSide.drawPosition,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
      drawDefinition,
      matchUpsMap,
    });
    if (advanced?.error) return decorateResult({ result: advanced, stack });

    /**
     * P39 — and this site is REQUIRED, not belt-and-braces.
     *
     * The exit has just resolved against an opponent who was already in place, so this matchUp will
     * never produce a loser and the first-round seat its loser link feeds can never be filled. The
     * arrival path resolves the mirror-image case; hooking only there made the outcome depend on
     * WHICH ORDER the two results were entered — `sideBlindExitCarry`'s order-independence test and
     * `correctionDivergence` both went red on exactly that asymmetry.
     */
    const unfillable = propagateUnfillableLoserBye({
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
      drawDefinition,
      matchUpsMap,
    });
    if (unfillable?.error) return decorateResult({ result: unfillable, stack });
  }

  if (!holdsBye) return decorateResult({ result: { ...SUCCESS }, stack });

  // the write above changed the draw, so the next hop is decided on freshly derived context
  const refreshed =
    getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? inContextDrawMatchUps;
  return carryExitOnward({
    fromMatchUp: refreshed.find((m) => m.matchUpId === nextWinnerMatchUp.matchUpId) ?? nextWinnerMatchUp,
    inContextDrawMatchUps: refreshed,
    originMatchUpId,
    visited: seen,
    drawDefinition,
    matchUpsMap,
    params,
    stack,
    EXIT,
  });
}

/**
 * Direct the winner of a cascade-resolved exit into a winner target in ANOTHER structure.
 *
 * `advanceDrawPosition` advances a winner only when the winner target belongs to the same
 * structure; a target reached over a WINNER link falls through it silently. That left the matchUp
 * decided with a winner who never appeared in the linked structure — the state the repo's own
 * `getDrawInconsistencies` reports as DROPPED_PROGRESSION.
 *
 * Measured over the 600-cell exit-propagation matrix, this is reached 4 times out of 2107
 * `advanceDrawPosition` calls, and every one is the DOUBLE_ELIMINATION Main final feeding the
 * Decider after a Backdraw double-exit cascade resolved it as a walkover.
 *
 * `directWinner` is the engine's own link-direction path — the one `directParticipants` uses for a
 * scored result — so the placement rules are not re-derived here. A BYE or unassigned position is
 * excluded: it has no participant to direct, and `directWinnerViaLink`'s terminal branch would
 * report an unavailable target for it.
 */
/**
 * A CARRIED EXIT THAT MEETS AN EXIT CONVERGES (RULE 4), and the double exit produces onward.
 *
 * `carryExitOnward` used to stop here: *"Two exits MEETING is a convergence ... resolving it is a separate piece of
 * work, left exactly as it was."* Left so, the carried exit reached its target as a bare empty seat with no record,
 * the exit standing on the other side waited for an opponent who could never arrive, and everything downstream
 * stalled. With `doubleExitPropagateBye` on, a BYE fills such seats; with it off, this was the whole of the second
 * stall budget: 11 cells, 17 findings, in COMPASS, PLAYOFF, FIRST_MATCH_LOSER_CONSOLATION and DOUBLE_ELIMINATION
 * 16/13 (CA, 2026-10-06: "build the convergence"). Settling held exits after the fact was tried for this family
 * and taken out on 2026-09-29; converging where the carry arrives is RULE 4 applied where it was skipped.
 *
 * Converges only a single exit recorded on the OPPONENT's side, with nothing recorded as an exit on the arriving
 * side; a double exit already there, or an exit on the arriving side, is left as it was. The write and the onward
 * step are `handleEmptyExitLoser`'s, so both routes to a convergence leave the same draw.
 */
function convergesAtTarget({
  nextWinnerMatchUp,
  arrivalSideNumber,
}: {
  nextWinnerMatchUp: HydratedMatchUp;
  arrivalSideNumber: number;
}): boolean {
  if (!isExit(nextWinnerMatchUp.matchUpStatus) || isDoubleExit(nextWinnerMatchUp.matchUpStatus)) return false;
  const provenance = getSideExitProvenance({ matchUp: nextWinnerMatchUp });
  return (
    !!carriedExitStatus(provenance?.[3 - arrivalSideNumber]) && !carriedExitStatus(provenance?.[arrivalSideNumber])
  );
}

/**
 * THE BYE STAYS; THE EXIT TRAVELS. A seat that advanced structurally while EMPTY, and then became a propagated BYE,
 * left its position one round on, where the target recorded a BYE arriving from the holder. A BYE goes nowhere (CA,
 * 2026-09-20: "the BYE remains a BYE"; 2026-10-04: "BYE holder, exit sent on"), so when the exit the holder held is
 * sent on, the holder's BYE position is taken back out of the target first, and the target reads again as what the
 * other side left it: a pending exit, or nothing. Matrix cell 337 (FEED_IN_CHAMPIONSHIP_TO_SF 16/16): `Consolation|4|2`'s
 * dp2 stood in `5|1` as a BYE arrival; the WALKOVER sent on then met the WALKOVER `4|1`'s double exit produced there,
 * instead of being lost, and the convergence produced onward with no phantom seat to award.
 *
 * Returns the target as it stands afterwards (the stored matchUp), or undefined when there was nothing to release.
 */
function releaseHoldersByeFromTarget({
  arrivalSideNumber,
  nextWinnerMatchUp,
  drawDefinition,
  fromMatchUp,
  matchUpsMap,
  params,
}: {
  params: { tournamentRecord?: Tournament; event?: Event };
  nextWinnerMatchUp: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  fromMatchUp: HydratedMatchUp;
  arrivalSideNumber: number;
  matchUpsMap: MatchUpsMap;
}): MatchUp | undefined {
  const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === nextWinnerMatchUp.matchUpId);
  if (!stored || fromMatchUp.structureId !== nextWinnerMatchUp.structureId) return undefined;
  const { positionAssignments } = getPositionAssignments({ structureId: fromMatchUp.structureId, drawDefinition });
  const holdersBye = (fromMatchUp.drawPositions ?? []).find(
    (position) =>
      position &&
      positionAssignments?.some((assignment) => assignment.drawPosition === position && assignment.bye) &&
      stored.drawPositions?.includes(position),
  );
  if (!holdersBye) return undefined;

  setMatchUpDrawPositions({
    drawPositions: (stored.drawPositions ?? []).map((position) => (position === holdersBye ? undefined : position)),
    structureId: fromMatchUp.structureId,
    matchUp: stored,
    drawDefinition,
  });
  const provenance = { ...getSideExitProvenance({ matchUp: stored }) };
  const arrival = provenance[arrivalSideNumber];
  if (arrival?.matchUpStatus === BYE && !carriedExitStatus(arrival)) delete provenance[arrivalSideNumber];
  clearSideExitProvenance(stored);
  if (Object.keys(provenance).length) setSideExitProvenance({ matchUp: stored, provenance });
  // what the other side left: a pending exit, or nothing
  const derived = deriveExitStateFromProvenance(getSideExitProvenance({ matchUp: stored }));
  stored.matchUpStatus = derived?.matchUpStatus ?? TO_BE_PLAYED;
  delete stored.winningSide;
  modifyMatchUpNotice({
    tournamentId: params.tournamentRecord?.tournamentId,
    context: 'releaseHoldersByeFromTarget',
    eventId: params.event?.eventId,
    matchUp: stored,
    drawDefinition,
  });
  return stored;
}

function convergeCarriedExit({
  inContextDrawMatchUps,
  arrivalSideNumber,
  nextWinnerMatchUp,
  originMatchUpId,
  drawDefinition,
  matchUpsMap,
  params,
  stack,
}: {
  params: {
    matchUpStatus?: MatchUpStatusUnion;
    appliedPolicies?: PolicyDefinitions;
    tournamentRecord?: Tournament;
    event?: Event;
  };
  inContextDrawMatchUps: HydratedMatchUp[];
  nextWinnerMatchUp: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  originMatchUpId?: string;
  arrivalSideNumber: number;
  matchUpsMap: MatchUpsMap;
  stack: string;
}): ResultType {
  const stored = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === nextWinnerMatchUp.matchUpId);
  if (!stored) return decorateResult({ result: { ...SUCCESS }, stack });
  // the exit standing on the other side: the target's own status, or, on a BYE target, the exit carried in there
  const standingExit = isExit(nextWinnerMatchUp.matchUpStatus)
    ? nextWinnerMatchUp.matchUpStatus
    : carriedExitStatus(getSideExitProvenance({ matchUp: stored })?.[3 - arrivalSideNumber]);
  const DOUBLE_EXIT = collapseDoubleExitStatus([params.matchUpStatus, standingExit]);
  const provenance = {
    ...getSideExitProvenance({ matchUp: stored }),
    ...buildCarriedExitProvenance({
      previousMatchUpStatus: params.matchUpStatus,
      exitingSideNumber: arrivalSideNumber,
      matchUpStatus: params.matchUpStatus,
      sourceMatchUpId: originMatchUpId,
    }),
  };
  logAdvancement(stack, {
    color: 'brightred',
    decision: 'CARRIED_EXIT_converges_at_target',
    nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
    newStatus: DOUBLE_EXIT,
    arrivalSideNumber,
  });
  const result = modifyMatchUpScore({
    matchUpStatusCodes: retainPolicyCodes(stored),
    appliedPolicies: params.appliedPolicies,
    matchUpId: stored.matchUpId,
    matchUpStatus: DOUBLE_EXIT,
    winningSide: undefined,
    removeScore: true,
    matchUp: stored,
    context: stack,
    drawDefinition,
  });
  if (result.error) return decorateResult({ result, stack });
  mergeSideExitProvenance({ matchUp: stored, provenance });

  // What this matchUp produced as a single pending exit is withdrawn first: the double exit produces its own, and
  // meeting the old one there converged the matchUp with itself (MODIFIED_FEED_IN_CHAMPIONSHIP, CURTIS_CONSOLATION and
  // FEED_IN_CHAMPIONSHIP_TO_QF 16/16: `Consolation|4|1` a DOUBLE_WALKOVER beside a real participant).
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: matchUpsMap.mappedMatchUps,
    sourceMatchUpId: stored.matchUpId,
    drawDefinition,
  });
  applyWithdrawnExits({
    tournamentRecord: params.tournamentRecord,
    event: params.event,
    withdrawnExits,
    drawDefinition,
    matchUpsMap,
  });

  // the carrier's params are narrower than `doubleExitAdvancement`'s; a nested double exit downstream reads `structure`
  const { structure } = findStructure({ drawDefinition, structureId: nextWinnerMatchUp.structureId });
  const onward = advanceConvergedWinner({
    convergedMatchUp: nextWinnerMatchUp,
    params: { ...params, inContextDrawMatchUps, drawDefinition, matchUpsMap, structure },
    drawDefinition,
    matchUpsMap,
    DOUBLE_EXIT,
    stack,
  });
  if (onward?.error) return decorateResult({ result: onward, stack });
  return decorateResult({ result: { ...SUCCESS }, stack });
}

function directExitWinnerAcrossLink({
  drawPositionToAdvance,
  inContextDrawMatchUps,
  sourceStructureId,
  drawDefinition,
  sourceMatchUp,
  matchUpsMap,
  targetData,
  params,
}) {
  const { winnerMatchUp } = targetData.targetMatchUps;
  const { winnerTargetLink } = targetData.targetLinks;
  if (!winnerMatchUp || !winnerTargetLink) return;
  if (winnerMatchUp.structureId === sourceStructureId) return;

  const { structure } = findStructure({ drawDefinition, structureId: sourceStructureId });
  const { positionAssignments } = getPositionAssignments({ structure });
  const assignment = positionAssignments?.find(({ drawPosition }) => drawPosition === drawPositionToAdvance);
  if (!assignment?.participantId || assignment.bye) return;

  directWinner({
    winnerMatchUpDrawPositionIndex: targetData.targetMatchUps.winnerMatchUpDrawPositionIndex,
    sourceMatchUpStatus: sourceMatchUp.matchUpStatus,
    winningDrawPosition: drawPositionToAdvance,
    sourceMatchUpId: sourceMatchUp.matchUpId,
    tournamentRecord: params.tournamentRecord,
    projectedWinningSide: undefined,
    dualMatchUp: undefined,
    inContextDrawMatchUps,
    winnerTargetLink,
    drawDefinition,
    winnerMatchUp,
    matchUpsMap,
    event: params.event,
  });
}

function advanceByeToLoserMatchUp(params) {
  const {
    loserTargetDrawPosition,
    tournamentRecord,
    loserTargetLink,
    drawDefinition,
    matchUpsMap,
    event,
    loserMatchUp,
  } = params;
  const structureId = loserTargetLink?.target?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: MISSING_STRUCTURE };

  /**
   * Claim the BYE before placing it, because placing it may be a NO-OP.
   *
   * `assignDrawPositionBye` returns early when the drawPosition already holds a BYE, above the
   * point where it marks the assignment. So the SECOND double exit to claim a position writes
   * nothing — and it is precisely that second claim which decides whether the BYE survives a
   * correction of the first. Recording here, at the attempt, is what makes the ledger see it.
   *
   * Writes go to the RAW matchUp: the in-context copy is detached from `drawDefinition.structures`
   * and a write to it is invisible to every later read (#4816).
   */
  const noContextLoserMatchUp = (matchUpsMap?.drawMatchUps ?? []).find(
    (candidate) => candidate.matchUpId === loserMatchUp?.matchUpId,
  );
  if (noContextLoserMatchUp) {
    // the claim's side, read structurally; where the position is not yet present it is recorded on side 1, as before
    const claimSide = getDrawPositionSideNumber({
      matchUp: { ...noContextLoserMatchUp, sides: undefined },
      structureId: loserMatchUp?.structureId,
      drawPosition: loserTargetDrawPosition,
      drawDefinition,
    });
    recordByeClaim({
      sideNumber: claimSide ?? 1,
      claimantMatchUpId: params.sourceMatchUp?.matchUpId,
      matchUp: noContextLoserMatchUp,
    });
  }

  return assignDrawPositionBye({
    // this cascade is placing the BYE, so it says so rather than leaving assignDrawPositionBye to
    // infer it from upstream statuses it cannot classify
    byeFromPropagation: true,
    drawPosition: loserTargetDrawPosition,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
    loserMatchUp,
    event,
  });
}

/**
 * AN EXIT HELD IN A MATCHUP THAT CAN PRODUCE NOBODY IS SENT ON — asked of the draw, once it settles.
 *
 * `carryExitOnward` walks an exit through every BYE it meets, and it was only ever launched by an
 * exit ARRIVING. Each of its decisions is taken on the draw as it stands at that moment, and two of
 * them go stale:
 *
 * - **The BYE comes second.** The exit arrives opposite an open seat and rests there, pending an
 *   opponent. The seat is then given a BYE — the loser of a later double exit, or of a matchUp that
 *   had none to send — and nothing launches the carry again.
 * - **The opponent comes second.** The carry is refused because no opponent could arrive — *"the
 *   `winningSide` written below is the side yet to arrive, and that claim is only true while
 *   somebody still can"* — and then somebody does.
 *
 * TRACED 2026-09-29 with `doubleExitPropagateBye: false`, which is where exits are produced:
 *
 *     DOUBLE_ELIMINATION 8/7, seed 77      `Backdraw|2|2` holds an exit; its fed seat becomes a BYE
 *     FIRST_MATCH_LOSER_CONSOLATION 8/5    `Consolation|2|1`, the same, the BYE placed by another path
 *     FEED_IN_CHAMPIONSHIP 8/7, seed 377   refused at `Consolation|3|1`, whose opponent then arrived
 *
 * In each a participant waited on a matchUp holding a BYE and an exit. Of 137 stalls measured over
 * the 600 matrix cells with the policy off, 69 were fed by a matchUp in that state and 58 more by
 * one of those.
 *
 * CA, 2026-09-20: *"a propagated exit encountering a BYE should be advanced. In both cases the BYE
 * remains a BYE."* And of these, 2026-09-29: *"repair should be done"*.
 *
 * So the question is asked of the STATE rather than of the events that led to it, which is the
 * shape `reconcileDeciders` takes for the same reason. The carrier is unchanged and so is every
 * refusal in it; this only asks it again.
 *
 * The exit travels as ITSELF — its own status and the origin it already carries.
 */
export function settleHeldExits({
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  event,
}: {
  appliedPolicies?: PolicyDefinitions;
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  event?: Event;
}) {
  const stack = 'settleHeldExits';
  if (!drawDefinition) return { ...SUCCESS };
  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  // under EITHER policy: a produced exit can come to rest beside a seat that becomes a BYE only later, whichever policy
  // placed it (CA, 2026-10-04, "BYE holder, exit sent on"; matrix cell 337)
  const sent = sendHeldExitsOn({ tournamentRecord, appliedPolicies, drawDefinition, matchUpsMap, event, stack });
  if (sent.error) return sent;

  // a convergence written by an arrival produces onward as one written by a carried exit does
  const produced = produceStrandedConvergences({
    tournamentRecord,
    appliedPolicies,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (produced?.error) return decorateResult({ result: produced, stack });

  // under either policy, an exit label left beside a BYE with nobody in it is the BYE it holds
  const relabelled = settleHoldersToBye({ drawDefinition, matchUpsMap, params: { appliedPolicies } });
  if (relabelled?.error) return decorateResult({ result: relabelled, stack });

  return { ...SUCCESS };
}

/**
 * A CONVERGENCE PRODUCES AN EXIT FOR ITS WINNER TARGET, whichever route wrote it.
 *
 * `convergeCarriedExit` and the double-exit routes end in `advanceConvergedWinner`. A participant carrying an exit who
 * comes through a BYE into a matchUp holding a pending exit converges there too (`advanceWinner`'s
 * `standingExitStatus`, RULE 4), but that route only writes the status: the double exit produced nothing, and whoever
 * stood in its winner target waited on nobody. Census 20080614 (FEED_IN_CHAMPIONSHIP 16/11, `doubleExitPropagateBye:
 * false`): `Main|1|2`'s double default sent its carrier through a BYE into `Consolation|3|2`, opposite `Main|1|5`'s
 * produced WALKOVER; the DOUBLE_WALKOVER there never reached `Consolation|4|2`, where the Main semifinal's loser stood.
 *
 * Asked of the settled draw: a double exit whose two sides each record a carried exit, with a winner target holding
 * nothing from it and no result.
 */
function produceStrandedConvergences({
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
}): ResultType | undefined {
  const produced = new Set<string>();
  for (let pass = 0; pass < 16; pass++) {
    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    const stranded = inContextDrawMatchUps.find(
      (matchUp) => !produced.has(matchUp.matchUpId) && strandsItsExit({ inContextDrawMatchUps, matchUpsMap, matchUp }),
    );
    if (!stranded) return undefined;
    produced.add(stranded.matchUpId);
    const { structure } = findStructure({ drawDefinition, structureId: stranded.structureId });
    const result = advanceConvergedWinner({
      params: {
        tournamentRecord,
        appliedPolicies,
        inContextDrawMatchUps,
        drawDefinition,
        matchUpsMap,
        structure,
        event,
      },
      DOUBLE_EXIT: stranded.matchUpStatus,
      convergedMatchUp: stranded,
      stack: 'settleHeldExits',
      drawDefinition,
      matchUpsMap,
    });
    if (result?.error) return result;
  }
  return undefined;
}

function strandsItsExit({
  inContextDrawMatchUps,
  matchUpsMap,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  matchUpsMap: MatchUpsMap;
  matchUp: HydratedMatchUp;
}): boolean {
  if (matchUp.collectionId || !isDoubleExit(matchUp.matchUpStatus) || !matchUp.winnerMatchUpId) return false;
  const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUp.matchUpId);
  const provenance = getSideExitProvenance({ matchUp: stored });
  if (!carriedExitStatus(provenance?.[1]) || !carriedExitStatus(provenance?.[2])) return false;
  const target = inContextDrawMatchUps.find((candidate) => candidate.matchUpId === matchUp.winnerMatchUpId);
  if (!target || target.winningSide) return false;
  const storedTarget = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === target.matchUpId);
  const targetProvenance = getSideExitProvenance({ matchUp: storedTarget }) ?? {};
  return !Object.values(targetProvenance).some((entry) => entry?.sourceMatchUpId === matchUp.matchUpId);
}

function sendHeldExitsOn({
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  matchUpsMap,
  event,
  stack,
}: {
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
  stack: string;
}) {
  const carried = new Set<string>();
  // the view the last pass found nothing to carry in — nothing has been written since it was taken
  let settledDrawMatchUps: HydratedMatchUp[] | undefined;

  // each pass can make the next matchUp along a holder in its turn; a matchUp is carried from once
  for (let pass = 0; pass < 16; pass++) {
    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    let held: HeldExit | undefined;
    for (const matchUp of inContextDrawMatchUps) {
      if (carried.has(matchUp.matchUpId)) continue;
      held = getHeldExit({ inContextDrawMatchUps, drawDefinition, matchUpsMap, matchUp });
      if (held) break;
    }
    if (!held) {
      settledDrawMatchUps = inContextDrawMatchUps;
      break;
    }
    carried.add(held.holder.matchUpId);

    const params = {
      matchUpStatus: held.origin.previousMatchUpStatus ?? held.origin.matchUpStatus,
      tournamentRecord,
      appliedPolicies,
      drawDefinition,
      matchUpsMap,
      event,
    };

    const result = carryExitOnward({
      originMatchUpId: held.origin.sourceMatchUpId,
      EXIT: held.origin.matchUpStatus,
      fromMatchUp: held.holder,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
      params,
      stack,
    });
    if (result?.error) return decorateResult({ result, stack });
  }

  const crossed = crossLinksThroughByes({
    settledDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
    stack,
  });
  if (crossed.error) return decorateResult({ result: crossed, stack });

  return { ...SUCCESS };
}

/**
 * A PARTICIPANT ADVANCED THROUGH A BYE CROSSES THE WINNER LINK, as one who won a result does.
 *
 * The carrier advances a settled opponent with `advanceDrawPosition`, which walks through BYEs
 * inside a structure and stops at its edge: it follows a winner target only when that target is in
 * the SAME structure. `drawPositionPlacement` names the crossing — *"an advancement through a BYE
 * or a pending exit is the same crossing, so it goes the same way"* — and makes it with
 * `directWinner`, so this does too.
 *
 * TRACED 2026-09-29, DOUBLE_ELIMINATION 8/7 at seed 77 with the policy off: the held exit reached
 * `Backdraw|3|1` and its occupant advanced into `Backdraw|4|1`, the Backdraw final, opposite a BYE.
 * The Main final never received them and the Main champion waited there alone.
 *
 * ## The view it starts from is the caller's, when the caller's is still current
 *
 * `settleHeldExits` ends by hydrating the draw and finding nothing to carry, then calls this — which
 * hydrated the same unchanged draw again to find, almost always, nothing to cross. Measured
 * 2026-10-01 (`pipelineCost.test.ts`): 627 of 627 calls with the policy off, 4% of everything the
 * pipeline spent. `settledDrawMatchUps` is that last view, handed over ONLY when no write followed
 * it; a pass that crosses somebody derives the next view after its own write, as before.
 */
function crossLinksThroughByes({
  settledDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
  stack,
}: {
  settledDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  event?: Event;
  stack: string;
}) {
  // a view is current until something is written; `undefined` means derive one
  let currentDrawMatchUps: HydratedMatchUp[] | undefined = settledDrawMatchUps;

  for (let pass = 0; pass < 16; pass++) {
    const inContextDrawMatchUps =
      currentDrawMatchUps ?? getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    const crossing = inContextDrawMatchUps
      .map((matchUp) => getByeCrossing({ inContextDrawMatchUps, drawDefinition, matchUp }))
      .find(Boolean);
    if (!crossing) break;
    if ('error' in crossing) return decorateResult({ result: crossing, stack });

    logAdvancement(stack, {
      color: 'cyan',
      decision: 'BYE_advancement_crosses_winner_link',
      fromMatchUpId: crossing.matchUp.matchUpId,
      winnerMatchUpId: crossing.winnerMatchUp.matchUpId,
    });

    const result = directWinner({
      winnerMatchUpDrawPositionIndex: crossing.winnerMatchUpDrawPositionIndex,
      winningDrawPosition: crossing.drawPosition,
      winnerTargetLink: crossing.winnerTargetLink,
      sourceMatchUpId: crossing.matchUp.matchUpId,
      winnerMatchUp: crossing.winnerMatchUp,
      projectedWinningSide: undefined,
      sourceMatchUpStatus: undefined,
      dualMatchUp: undefined,
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result.error) return result;

    // nothing moved: the same crossing would be found again, and asked again, for ever
    const after = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    const target = after.find((matchUp) => matchUp.matchUpId === crossing.winnerMatchUp.matchUpId);
    if (!target?.sides?.some((side) => side.participantId === crossing.participantId)) break;
    // derived after this pass's write, and nothing is written before the next pass reads it
    currentDrawMatchUps = after;
  }

  return { ...SUCCESS };
}

/**
 * A matchUp holding a BYE, an exit and nobody else, whose winner target has not had that exit AND
 * CAN BE SETTLED NOW.
 *
 * DELIVERED is read from the target: the side this matchUp feeds already records an origin, or
 * somebody is sitting on it, or the target is decided. Any of those and there is nothing to send.
 *
 * SETTLED NOW is read from the target's OTHER side. It holds a participant, who wins; or a BYE, and
 * the exit keeps walking. While that side is still open nothing is sent, because an exit set down
 * to wait is exactly the state that goes stale. This runs again after the next mutation, when there
 * may be something to decide.
 *
 * A target whose other side holds an EXIT is a convergence, and it is NOT settled here. It was
 * built and measured on 2026-09-29: it closed four more cells and stopped twenty others from
 * playing out, because an exit on a fed seat does not mean nobody can still arrive there.
 */
/**
 * THE HOLDER IS A BYE once its exit is sent on — CA, 2026-09-29: *"a propagated exit encountering a BYE should
 * be advanced … the BYE remains a BYE"*; 2026-10-04 (Q3, a second path): *"BYE holder, exit sent on"*.
 *
 * The exit can come to rest beside a seat that becomes a BYE only later: a produced exit lands PENDING opposite
 * a reserved seat nobody has reached, and the seat is then given a BYE. `carryExitOnward` sends the exit on, as
 * it always did; the holder kept the exit's label beside a BYE with nobody in it (matrix cell 337,
 * FEED_IN_CHAMPIONSHIP_TO_SF 16, `Consolation|4|2`). It is written as the BYE it is, with no winner, and keeps
 * the provenance that records where the exit came from — the write blanks it, so it is restored after.
 */
/** a seat holding a participant or a BYE; a BYE keeps its own handling (`targetHoldsBye`), only an EMPTY reserved seat is held back */
function isOccupiedSeat({ structure, drawPosition }: { structure?: Structure; drawPosition?: number }): boolean {
  const assignment = getPositionAssignments({ structure })?.positionAssignments?.find(
    (candidate) => candidate.drawPosition === drawPosition,
  );
  return !!(assignment?.participantId || assignment?.bye);
}

function settleHoldersToBye({
  drawDefinition,
  matchUpsMap,
  params,
}: {
  params: { appliedPolicies?: PolicyDefinitions };
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
}) {
  const holders = (getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? []).filter(
    (matchUp) =>
      isExit(matchUp.matchUpStatus) &&
      !matchUp.winningSide &&
      !matchUp.collectionId &&
      !matchUp.sides?.some((side) => side?.participantId) &&
      matchUpHoldsBye({ drawDefinition, matchUp }),
  );
  for (const { matchUpId } of holders) {
    const result = settleHolderToBye({ holderMatchUpId: matchUpId, drawDefinition, matchUpsMap, params });
    if (result?.error) return result;
  }
  return undefined;
}

function settleHolderToBye({
  holderMatchUpId,
  drawDefinition,
  matchUpsMap,
  params,
}: {
  params: { appliedPolicies?: PolicyDefinitions };
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  holderMatchUpId: string;
}) {
  const holder = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === holderMatchUpId);
  if (!holder || !isAnyExit(holder.matchUpStatus)) return undefined;
  const provenance = getSideExitProvenance({ matchUp: holder });
  const result = modifyMatchUpScore({
    matchUpStatusCodes: retainPolicyCodes(holder),
    appliedPolicies: params.appliedPolicies,
    matchUpId: holder.matchUpId,
    context: 'settleHeldExits',
    removeWinningSide: true,
    matchUpStatus: BYE,
    removeScore: true,
    matchUp: holder,
    drawDefinition,
  });
  if (result.error) return result;
  if (provenance) mergeSideExitProvenance({ matchUp: holder, provenance });
  return undefined;
}

/**
 * TWO HELD EXITS FEEDING ONE MATCHUP MEET THERE (RULE 4), so each is settled by the other.
 *
 * A held exit is sent on once its target is settled: somebody, a BYE or an exit stands opposite. Where the OTHER feeder
 * of the target is a holder too — a BYE with nobody in it and an exit on record — neither side of the target is ever
 * filled until one of them moves, and each waited on the other: two exits carried past one BYE each, a round short of
 * meeting, and everything downstream of their convergence stalled. The first is carried in pending; the next pass sees
 * it standing and the second converges with it. Census 20068753 (FEED_IN_CHAMPIONSHIP 8/6) and 20099337
 * (DOUBLE_ELIMINATION 8/6), `doubleExitPropagateBye: false`, two first-round double exits and nothing else: the
 * consolation and Backdraw finals waited on nobody.
 */
function opponentFeederHoldsAnExit({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  holder,
  target,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  holder: HydratedMatchUp;
  target: HydratedMatchUp;
}): boolean {
  const feeders = inContextDrawMatchUps.filter(
    (candidate) => candidate.winnerMatchUpId === target.matchUpId && candidate.matchUpId !== holder.matchUpId,
  );
  return (
    feeders.length === 1 &&
    feeders.every((feeder) => {
      if (feeder.winningSide || feeder.sides?.some((side) => side.participantId)) return false;
      if (!matchUpHoldsBye({ drawDefinition, matchUp: feeder })) return false;
      const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === feeder.matchUpId);
      const [exitSideNumber] = getExitSides({ matchUp: stored });
      return !!exitSideNumber && isExit(getSideExitProvenance({ matchUp: stored })?.[exitSideNumber]?.matchUpStatus);
    })
  );
}

type HeldExit = { holder: HydratedMatchUp; origin: SideExitProvenanceEntry };

function getHeldExit({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  matchUp: HydratedMatchUp;
}): HeldExit | undefined {
  if (matchUp.collectionId || matchUp.winningSide || !matchUp.winnerMatchUpId) return undefined;
  if (matchUp.sides?.some((side) => side.participantId)) return undefined;
  if (!matchUpHoldsBye({ drawDefinition, matchUp })) return undefined;

  const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUp.matchUpId);
  const [exitSideNumber] = getExitSides({ matchUp: stored });
  const origin = exitSideNumber ? getSideExitProvenance({ matchUp: stored })?.[exitSideNumber] : undefined;
  if (!origin?.sourceMatchUpId || !isExit(origin.matchUpStatus)) return undefined;

  const target = inContextDrawMatchUps.find((candidate) => candidate.matchUpId === matchUp.winnerMatchUpId);
  if (!target) return undefined;

  const arrivalSideNumber = getExitArrivalSideNumber({
    nextWinnerMatchUp: target,
    sourceMatchUp: matchUp,
    inContextDrawMatchUps,
  });
  if (!arrivalSideNumber) return undefined;
  if (target.sides?.some((side) => side.sideNumber === arrivalSideNumber && side.participantId)) return undefined;
  // A target already decided is not this exit's — except one decided only by an exit AWARDING the seat the held exit
  // travels to: a carrier who arrived first and won nobody (census policy-off 20161035 and 20117658,
  // FIRST_MATCH_LOSER_CONSOLATION 16/11), or a produced exit standing opposite with nobody behind it (20147820,
  // DOUBLE_ELIMINATION 16/11, once a correction dissolved the convergence there). The held exit arriving there meets
  // that exit, and the two converge (RULE 4). Declined, the exit stayed held and the final waited on the empty seat's
  // "winner". What it meets is `settledNow`'s question below, as for an undecided target.
  const awardedToArrivalSeat = target.winningSide === arrivalSideNumber && isExit(target.matchUpStatus);
  if (target.winningSide && !awardedToArrivalSeat) return undefined;

  const storedTarget = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === target.matchUpId);
  const targetProvenance = getSideExitProvenance({ matchUp: storedTarget });
  // the holder's own advancement records an arrival from it carrying no exit — by BYE, or the empty seat moved on while
  // the holder still read its pending exit (census policy-off 20147820, DOUBLE_ELIMINATION 16/11: `Backdraw|2|1`'s seat
  // reached `3|1` recorded as `DEFAULTED` from the holder); that is the seat the exit travels to, not a delivery
  // standing in its way (COMPASS and PLAYOFF 16/13, policy off: `West|2|1`, the last six stalled cells). Nobody stands
  // on that side (checked above), so an entry from the holder can only be the seat.
  const arrivalEntry = targetProvenance?.[arrivalSideNumber];
  const byeArrivalFromHolder =
    !!arrivalEntry &&
    !carriedExitStatus(arrivalEntry) &&
    (!arrivalEntry.sourceMatchUpId || arrivalEntry.sourceMatchUpId === matchUp.matchUpId);
  if (arrivalEntry && !byeArrivalFromHolder) return undefined;

  const opponentSide = target.sides?.find((side) => side.sideNumber === 3 - arrivalSideNumber);
  // an exit standing on the other side is settled too: the held exit meets it, and they converge (RULE 4;
  // `convergesAtTarget` in the carrier). Declining here was the policy-off stall budget's whole population.
  // judged on the target as it stands once the holder's BYE arrival is taken back out (`releaseHoldersByeFromTarget`):
  // what the other side left there, a pending exit the held one converges with, or nothing
  const withoutArrival = byeArrivalFromHolder ? { ...targetProvenance } : targetProvenance;
  if (byeArrivalFromHolder && withoutArrival) delete withoutArrival[arrivalSideNumber];
  const derivedStatus = byeArrivalFromHolder
    ? (deriveExitStateFromProvenance(withoutArrival)?.matchUpStatus ?? TO_BE_PLAYED)
    : target.matchUpStatus;
  const settledNow =
    !!opponentSide?.participantId ||
    !!opponentSide?.bye ||
    convergesAtTarget({
      nextWinnerMatchUp: { ...target, sideExitProvenance: withoutArrival, matchUpStatus: derivedStatus },
      arrivalSideNumber,
    }) ||
    opponentFeederHoldsAnExit({ inContextDrawMatchUps, drawDefinition, matchUpsMap, holder: matchUp, target });
  if (!settledNow) return undefined;

  return { holder: matchUp, origin };
}
