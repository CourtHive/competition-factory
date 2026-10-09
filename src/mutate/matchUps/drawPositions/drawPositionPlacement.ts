/**
 * Placing a drawPosition, and what follows from it.
 *
 * `assignDrawPosition`, `assignMatchUpDrawPosition` and `directWinner` are ONE algorithm that was
 * spread across three files and called one another in a ring:
 *
 *   assignDrawPosition -> assignMatchUpDrawPosition -> directWinner -> both of the others
 *
 * The ring became a BUILD-TIME cycle when #4907 added `assignMatchUpDrawPosition -> directWinner`,
 * so that a drawPosition never crosses a structure link as a number. v6.38.0 builds with zero
 * circular-dependency warnings; after #4907 rollup reported two.
 *
 * Every smaller repair only MOVES the ring, which is why they live together now:
 *
 *  - extracting `directWinnerViaLink` carries its `assignMatchUpDrawPosition` back-edge with it;
 *  - merging `directWinner` into `assignMatchUpDrawPosition` leaves that module needing
 *    `assignDrawPosition`, which needs it back — two cycles become one;
 *  - a registry or late binding breaks the edge but puts mutable module state and init-order
 *    coupling into a library that has neither.
 *
 * Nothing here changed when it moved. Each original module remains as a re-export, so no import
 * site in the repo was touched.
 */

import { releaseAdvancedDrawPositionAcrossLinks } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { removeSubsequentRoundsParticipant } from '@Mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant';
import { rekeySideFacts, setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { recordSourceSideProvenance } from '@Mutate/drawDefinitions/matchUpGovernor/recordSourceSideProvenance';
import { modifyRoundRobinMatchUpsStatus } from '@Mutate/matchUps/matchUpStatus/modifyRoundRobinMatchUpsStatus';
import { modifyPositionAssignmentsNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { structureAssignedDrawPositions, getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getPairedPreviousMatchUpIsDoubleExit } from '@Query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { SeedingProfile, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { updateSideLineUp } from '@Mutate/matchUps/lineUps/updateSideLineUp';
import { propagateUnfillableLoserBye } from './propagateUnfillableLoserBye';
import { isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isValidSeedPosition } from '@Query/drawDefinition/seedGetter';
import { getTargetMatchUps } from '@Query/matchUps/getTargetMatchUps';
import { resetLineUps } from '@Mutate/matchUps/lineUps/resetLineUps';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { normalizeDrawPositions } from './normalizeDrawPositions';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { assignDrawPositionBye } from './assignDrawPositionBye';
import { getParticipantId } from '@Functions/global/extractors';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { drawPositionFilled } from './drawPositionFilled';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { SUCCESS } from '@Constants/resultConstants';
import { clearDrawPosition } from './positionClear';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import { isExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';
import {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  Tournament,
} from '@Types/tournamentTypes';
import {
  getDrawPositionSideNumber,
  getWinningSideDrawPosition,
  getSideDrawPosition,
} from '@Query/matchUps/getDrawPositionSides';
import {
  clearResolvedSideExitProvenance,
  isPropagatedExit as sharedIsPropagatedExit,
  participatesInExitCascade,
  isProjectedExitCode,
  policyCodeString,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

import { CONSOLATION, CONTAINER, MAIN, PLAY_OFF, QUALIFYING, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';

import {
  DRAW_POSITION_ASSIGNED,
  STRUCTURE_NOT_FOUND,
  INVALID_DRAW_POSITION,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  INVALID_DRAW_POSITION_FOR_SEEDING,
  DRAW_POSITION_ACTIVE,
  MISSING_PARTICIPANT_ID,
  INVALID_MATCHUP,
  ErrorType,
} from '@Constants/errorConditionConstants';

import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// ============================================================================
// from assignMatchUpDrawPosition.ts
// ============================================================================

type AssignMatchUpDrawPositionArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  arrivesWithExit?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: MatchUpStatusUnion;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  matchUpStatus?: MatchUpStatusUnion;
  drawPosition: number;
  matchUpId: string;
  event?: Event;
};
export function assignMatchUpDrawPosition({
  inContextDrawMatchUps,
  arrivesWithExit,
  sourceMatchUpStatus,
  tournamentRecord,
  sourceMatchUpId,
  drawDefinition,
  matchUpStatus,
  drawPosition,
  matchUpsMap,
  matchUpId,
  event,
}: AssignMatchUpDrawPositionArgs) {
  const stack = 'assignMatchUpDrawPosition';

  matchUpsMap ??= getMatchUpsMap({ drawDefinition });

  const resolvedInContextDrawMatchUps =
    inContextDrawMatchUps ??
    getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }).matchUps ??
    [];

  const inContextMatchUp = resolvedInContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const structure = drawDefinition?.structures?.find((structure) => structure.structureId === structureId);

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const matchUp = matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  const drawPositions: number[] = matchUp?.drawPositions ?? [];
  let { positionAdded, positionAssigned, updatedDrawPositions } = getUpdatedDrawPositions({
    drawPositions,
    drawPosition,
  });

  /**
   * Refuse HERE, where the decision is made — not at the bottom, where it used to be reported.
   *
   * `positionAssigned` is false in exactly one situation: both of the matchUp's two drawPosition
   * slots are already held by other positions, so there is nowhere to put this one.
   * `getUpdatedDrawPositions` decides that from `matchUp.drawPositions` alone, above, and nothing
   * below can change it.
   *
   * The refusal used to be the function's terminal `else`, roughly 140 lines further down — so the
   * function knew it had no slot and then went on cascading anyway. Two of the paths in between
   * WRITE while `positionAssigned` is false, which is why this was not merely untidy:
   *
   *   - `advanceDrawPosition`'s last branch is the one clause in it NOT gated on `positionAssigned`,
   *     and a paired previous double exit sends it into `advanceIntoWinnerMatchUp` — a recursive
   *     `assignMatchUpDrawPosition`, i.e. a write.
   *   - `propagateConsolationBye` runs unconditionally, and its own early-out tests
   *     `updatedDrawPositions.filter(Boolean).length !== 2` — which is FALSE here, because a matchUp
   *     with no free slot has two. So it proceeds, and can place a BYE.
   *
   * Both writes are orphaned the moment the function returns its error, and `directParticipants` has
   * already committed the source result by then (it calls `attemptToModifyScore` before walking any
   * link). That is the `ERROR_IMPLIES_NO_MUTATION` shape: an error returned over a draw that was
   * changed. Measured over the two 600-seed census windows, this code is 7 of the 11 seeds in that
   * class.
   *
   * Returning where the answer is known costs nothing and cannot drift from the rule, because it IS
   * the rule — the same `positionAssigned` the terminal branch tested, read at the point it is
   * computed.
   */
  let resolved = { positionAdded, positionAssigned, updatedDrawPositions };
  if (!positionAssigned) {
    // Before refusing, check whether the thing in the way is a BYE that is only there by
    // advancement — and if so, take it back. See `yieldSquattingPropagatedBye`.
    const yielded = yieldSquattingPropagatedBye({
      inContextDrawMatchUps: resolvedInContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
      structure,
      matchUp,
    });
    if (yielded) {
      resolved = getUpdatedDrawPositions({ drawPositions: matchUp?.drawPositions ?? [], drawPosition });
    }
    if (!resolved.positionAssigned) {
      return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, context: { drawPosition }, stack });
    }
  }
  positionAdded = resolved.positionAdded;
  positionAssigned = resolved.positionAssigned;
  updatedDrawPositions = resolved.updatedDrawPositions;

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  const matchUpAssignments = positionAssignments?.filter((assignment) =>
    updatedDrawPositions.includes(assignment.drawPosition),
  );
  const isByeMatchUp = matchUpAssignments?.find(({ bye }) => bye);
  const isDoubleExitExit =
    matchUp?.matchUpStatus && isExit(matchUp.matchUpStatus) && updatedDrawPositions.filter(Boolean).length < 2;

  matchUpStatus = resolveMatchUpStatus({ isByeMatchUp, matchUpStatus, isDoubleExitExit, matchUp });

  /**
   * Is an exit already STANDING on this matchUp, and is a PARTICIPANT arriving into it?
   *
   * Two questions, and the names now say which is which. **Punch-list P3.**
   *
   * `holdsStandingExit` is a STATUS question with two ways of being true, and it was called
   * `holdsPropagatedExit` while only one of them had anything to do with propagation:
   *
   *  - the cascade DELIVERED an exit here — asked of provenance, because a pending exit has no
   *    `winningSide` until somebody arrives (CA, Migration §20, 2026-09-20);
   *  - a director RECORDED one here, with a `winningSide`, before the opponent was known.
   *
   * The second is not a propagated exit and must not be dropped on the grounds that it is not one.
   * Measured 2026-09-29: asking provenance alone fails exactly one test of 13,653 —
   * `propagatedByeYieldsToArrivingLoser`, a chain of walkovers a director scores out of order —
   * where `Main|2|2` is `WALKOVER ws=1` holding `[8, _]` and no provenance at all, and position 5
   * arrives afterwards. Without the status half the standing walkover is overwritten and the final
   * is refused `ERR_INVALID_MATCHUP_STATUS`. So the disjunct stays and the NAME goes: a predicate
   * wearing the provenance name while doing a status job is what this entry was filed against.
   *
   * `participantArrivesAtExit` is the narrower question the award and advancement paths need: is
   * the drawPosition arriving here occupied by a participant? An EMPTY position arriving resolves
   * nothing — *"awarding against an empty slot asserts a winner over an opponent who does not
   * exist"*, CA 2026-09-20 — so it must not award a winningSide, must not rewrite the carried
   * codes, and must not advance anyone onward. It must still leave the exit's STATUS alone, which
   * is what `holdsStandingExit` governs below.
   */
  const holdsStandingExit = !!(
    isExit(matchUp?.matchUpStatus) &&
    (matchUp?.winningSide || sharedIsPropagatedExit({ matchUp }))
  );
  const arrivingParticipantId = positionAssignments?.find(
    (assignment) => assignment.drawPosition === drawPosition,
  )?.participantId;
  /**
   * AN ARRIVAL THAT CARRIES AN EXIT DOES NOT WIN THE EXIT STANDING HERE — it CONVERGES with it (F3, CA
   * 2026-10-04: fix the arrival itself). A loser carrying a WALKOVER or DEFAULTED under propagation can reach
   * a matchUp holding a pending exit before `progressExitStatus` has recorded the exit they carry: `directLoser`
   * places them, and a BYE opposite them advances them here at once (`advanceIntoWinnerMatchUp`). Read as an
   * ordinary arrival they were awarded the standing exit and advanced, even into a recorded exit's vacant side
   * one round on, and RULE 4's convergence was then refused over a draw that had moved (census arm
   * `exitBeforeArrivalCensus`, COMPASS 8/7 9700004). The position is placed; nothing is awarded or advanced.
   */
  const participantArrivesAtExit = holdsStandingExit && !!arrivingParticipantId && !arrivesWithExit;

  // A drawPosition slot can already be present in this matchUp's drawPositions
  // (e.g. pre-seeded by a consolation BYE feed) while the underlying
  // positionAssignment is only now being filled by a participant ADVANCING from an
  // earlier round. In that case positionAdded is false, so applyPositionToMatchUp —
  // and the modifyMatchUp notice it emits — is skipped, and the matchUp mutates
  // silently (only a structure-level modifyPositionAssignments notice fires).
  // Detect the newly-occupied slot so the per-matchUp notice still fires; otherwise
  // consumers that render from modifyMatchUp don't update until a full reload.
  const drawPositionParticipantId = positionAssignments?.find(
    (assignment) => assignment.drawPosition === drawPosition,
  )?.participantId;
  const previousSideParticipantId = inContextMatchUp?.sides?.find(
    (side) => side.drawPosition === drawPosition,
  )?.participantId;
  // Restrict to advancement targets: a matchUp in a LATER round than where this
  // drawPosition first appears. Initial-round placement (filling pre-allocated
  // first-round slots) is already announced via applyPositionToMatchUp and must
  // not be re-noticed here.
  const slotFilledByParticipant =
    !positionAdded && !!drawPositionParticipantId && drawPositionParticipantId !== previousSideParticipantId;
  const { initialRoundNumber } = slotFilledByParticipant
    ? getInitialRoundNumber({
        matchUps: getMappedStructureMatchUps({ structureId: structure.structureId, matchUpsMap }),
        drawPosition,
      })
    : { initialRoundNumber: undefined };
  const slotNewlyOccupied =
    slotFilledByParticipant &&
    !!matchUp?.roundNumber &&
    !!initialRoundNumber &&
    matchUp.roundNumber > initialRoundNumber;

  /**
   * A PENDING PROPAGATED EXIT MUST STILL BE RESOLVED WHEN THE POSITION WAS ALREADY REGISTERED.
   *
   * `applyPositionToMatchUp` is what awards the walkover to the arriving side, re-sides the carried
   * codes onto the exiting side, and lets the winner advance. It ran only on `positionAdded` — the
   * drawPosition being ADDED to this matchUp's `drawPositions`.
   *
   * In a fed structure the later round's drawPositions are frequently known already: measured on
   * OLYMPIC 8/6, `West|2|1` carries `dps=[2,3]` from generation. So when `East|1|3`'s loser finally
   * reaches `West` drawPosition 3, the position is not being added — it is merely being OCCUPIED —
   * `positionAdded` is false, and the branch below emitted a notice and nothing else. The exit that
   * `carryExitOnward` deliberately left unresolved was therefore never resolved by anybody, and
   * `West|2|1` stayed `WALKOVER` with a participant and no winner.
   *
   * That state is worse than it looks: it is stuck AND invisible to `getStructureInconsistencies`,
   * whose stall test requires `TO_BE_PLAYED`. CA, 2026-09-25, named the distinction it turns on — a
   * position is *genuinely* active only when something was played there, as opposed to *advanced*
   * active.
   *
   * `participantArrivesAtExit` already means "this matchUp holds a propagated exit AND a participant has
   * arrived at this drawPosition", which is exactly the resolvable case, so no new predicate is
   * needed. `slotNewlyOccupied` keeps it to an arrival that actually changed the occupant.
   */
  /**
   * THE AWARD IS NOT A NOTICE, and it was being withheld by a rule about notices.
   *
   * This read `slotNewlyOccupied`, which additionally requires the matchUp to be in a LATER round
   * than the one where the drawPosition first appears. That restriction exists for the notice in the
   * `else` branch below — an initial-round placement is announced elsewhere and must not be announced
   * twice. It has nothing to do with whether a pending exit is owed a winner.
   *
   * A FED position first appears in the very round it is fed into, so for a fed seat the condition is
   * never true. The participant arrived, `advanceDrawPosition` moved them onward, and the matchUp
   * they left kept its exit and no `winningSide` — reported by `STALLED_POSITION` as a participant
   * whose opponent can never arrive, about somebody who was already in the next round.
   *
   * Traced 2026-09-29 on MODIFIED_FEED_IN_CHAMPIONSHIP 8/5, matrix seed 268:
   *
   *     Main|1|3 DOUBLE_WALKOVER   Consolation|2|2  WALKOVER ws=-  [2,5]   exit on side 2, pending
   *     Main|2|1 played            Consolation|2|2  WALKOVER ws=-  s1: a participant arrives
   *                                Consolation|3|1  BYE [1,2]      s2: and has already moved on
   *
   * `verify:stall-budget`: **89 -> 68 cells, 176 -> 141 findings.** The 35 that closed are every
   * stall in the matrix that carried a single exit status.
   */
  const resolvesPendingExit = !positionAdded && participantArrivesAtExit && slotFilledByParticipant;

  if (matchUp && (positionAdded || resolvesPendingExit)) {
    applyPositionToMatchUp({
      updatedDrawPositions,
      holdsStandingExit,
      sourceMatchUpStatus,
      participantArrivesAtExit,
      isDoubleExitExit,
      tournamentRecord,
      inContextMatchUp,
      sourceMatchUpId,
      drawDefinition,
      matchUpStatus,
      drawPosition,
      matchUpsMap,
      matchUpId,
      matchUp,
      stack,
      event,
    });
  } else if (matchUp && positionAssigned && slotNewlyOccupied) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: inContextMatchUp?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  }

  const targetData = positionTargets({
    inContextDrawMatchUps: resolvedInContextDrawMatchUps,
    inContextMatchUp,
    drawDefinition,
    matchUpId,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack });
  const {
    targetMatchUps: { winnerMatchUp, loserMatchUp, loserTargetDrawPosition, winnerMatchUpDrawPositionIndex },
    targetLinks: { loserTargetLink, winnerTargetLink },
  } = targetData;

  // In lucky draws, all round-to-round advancement is handled by luckyDrawAdvancement
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);

  const advanceResult = advanceDrawPosition({
    winnerMatchUpDrawPositionIndex,
    winnerTargetLink,
    arrivesWithExit,
    event,
    inContextDrawMatchUps: resolvedInContextDrawMatchUps,
    positionAssigned,
    participantArrivesAtExit,
    tournamentRecord,
    inContextMatchUp,
    drawDefinition,
    matchUpStatus,
    winnerMatchUp,
    drawPosition,
    isByeMatchUp,
    isLuckyDraw,
    matchUpsMap,
    matchUp,
    structure,
  });
  if (advanceResult?.error) return advanceResult;

  // if { matchUpType: TEAM } then also assign the default lineUp to the appopriate side
  if (matchUp?.matchUpType === TEAM) {
    assignTeamLineUp({
      inContextDrawMatchUps: resolvedInContextDrawMatchUps,
      positionAssignments,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUp,
    });
  }

  // if FIRST_MATCH_LOSER_CONSOLATION, check whether a BYE should be placed in consolation feed
  const byeResult = propagateConsolationBye({
    updatedDrawPositions,
    loserTargetDrawPosition,
    tournamentRecord,
    loserTargetLink,
    drawDefinition,
    structureId: structure.structureId,
    isByeMatchUp,
    loserMatchUp,
    matchUpsMap,
    event,
  });
  if (byeResult?.error) return byeResult;

  // P39 — a loser target that can never be filled, because the side that would lose has exited.
  // Must also run from `carryExitOnward`; see the module docblock on why one site is not enough.
  const unfillableResult = propagateUnfillableLoserBye({
    matchUpId: matchUp?.matchUpId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (unfillableResult?.error) return unfillableResult;

  // `positionAssigned` is guaranteed true here — the false case returned at the top, where it is
  // decided.
  return { ...SUCCESS };
}

function resolveMatchUpStatus({ isByeMatchUp, matchUpStatus, isDoubleExitExit, matchUp }) {
  return (
    (isByeMatchUp && BYE) ||
    matchUpStatus ||
    (isDoubleExitExit && matchUp.matchUpStatus) ||
    (matchUp?.matchUpStatus &&
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUp.matchUpStatus) &&
      matchUp.matchUpStatus) ||
    TO_BE_PLAYED
  );
}

function applyPositionToMatchUp({
  updatedDrawPositions,
  sourceMatchUpStatus,
  holdsStandingExit,
  participantArrivesAtExit,
  isDoubleExitExit,
  tournamentRecord,
  inContextMatchUp,
  sourceMatchUpId,
  drawDefinition,
  matchUpStatus,
  drawPosition,
  matchUpsMap,
  matchUpId,
  matchUp,
  stack,
  event,
}) {
  /**
   * necessary to refresh inContextDrawMatchUps after mutation — AND ONLY WHERE THE VIEW IS READ.
   *
   * Two things below read it: `getExitWinningSide`, for a double exit's exit, and
   * `recordSourceSideProvenance`, for a matchUp already in the exit cascade. An ordinary placement —
   * a winner advancing into a matchUp nobody has exited from — reads neither, and this hydrated the
   * whole draw for it regardless. Measured 2026-10-01 (`pipelineCost.test.ts`, 2,026
   * `setMatchUpStatus` calls over seventeen draw types): 1,596 hydrations from this line, 12.5% of
   * everything the pipeline spent, of which 59 were read.
   *
   * Derived at most once, and at the point of the first read. Nothing between this line and either
   * read changes the draw, so the view is the one that was taken here before — it is only not taken
   * when nobody asks.
   */
  let refreshed: HydratedMatchUp[] | undefined;
  const refreshedMatchUps = () => {
    refreshed ??= getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    return refreshed;
  };
  // A participant advancing into a PENDING propagated exit fills its empty WINNER slot
  // (progressExitStatus set winningSide to the empty side). drawPositions is then
  // re-sorted, so the winning side is the side the advancing participant now occupies
  // in updatedDrawPositions — NOT the pre-sort winningSide (which, after the sort, can
  // point at the exiting/loser side). Mirrors resolvePropagatedExitOnAdvance (BYE path).
  // The side the arrival now occupies — read structurally, because a lone position is stored at index 0
  // whatever its side (`getDrawPositionSideNumber`).
  const advancedExitWinningSide = participantArrivesAtExit
    ? getDrawPositionSideNumber({
        matchUp: { ...matchUp, drawPositions: updatedDrawPositions },
        drawDefinition,
        drawPosition,
        structureId: inContextMatchUp?.structureId,
      })
    : undefined;
  // a produced exit is awarded to the arriving side only when somebody ARRIVES: an empty position reaching it
  // resolves nothing (CA 2026-09-20; Q3, 2026-10-04: census w1 9000477 `South|3|1`, awarded to an empty dp 7)
  //
  // THE STRUCTURAL SIDE FIRST. `getExitWinningSide` reads the hydrated view, and here that view predates this
  // placement: the arriving drawPosition is on no side yet, so on a fed round it falls back to side 1 whatever the
  // bracket says. On the DOUBLE_ELIMINATION Main final the undefeated winner arrives on side 2 opposite the fed
  // slot, so the produced exit was awarded to the EMPTY side 1 and the winner was stranded (census de 9300184:
  // `Main|3|1` corrected from DOUBLE_DEFAULT to WALKOVER left `Main|4|1` DEFAULTED ws=1, then a DOUBLE_WALKOVER).
  // `advancedExitWinningSide` is read from the updated drawPositions, which already hold the arrival.
  const exitWinningSide =
    advancedExitWinningSide ||
    (isDoubleExitExit &&
      participantArrivesAtExit &&
      getExitWinningSide({
        inContextDrawMatchUps: refreshedMatchUps(),
        drawPosition,
        matchUpId,
      })) ||
    undefined;

  // The arrival can move the participant already here to the other side (a lone position sits on its bracket side,
  // two sort ascending). Everything recorded by side moves with them; `winningSide` is assigned below from the side
  // the arrival takes, so it is left to that (CA, 2026-10-05: `setMatchUpDrawPositions`).
  rekeySideFacts({
    structureId: inContextMatchUp?.structureId,
    drawPositions: updatedDrawPositions,
    rekeyWinningSide: false,
    drawDefinition,
    matchUp,
  });

  // Advancing into a single pending propagated exit re-orders the sides, so the carried
  // exit code must follow the EXITING participant to its new side (opposite the advancing
  // winner) — otherwise it mislabels the winner. Mirrors resolvePropagatedExitOnAdvance.
  if (advancedExitWinningSide && !isDoubleExitExit) {
    // P37. The carried exit's SIDE is a fact about provenance, which is side-keyed and already holds
    // it; the legacy array carried the same fact positionally and this branch used to re-site it
    // there. Measured at this exact site over the exit-propagation and matchUpStatus suites
    // (2026-09-27, 113 arrivals): where the array held a code it was the projected shape and its
    // status equalled provenance in 50 of 50 — and in the other 63 the array was ALREADY EMPTY while
    // provenance held the status. So the re-siting was redundant where it ran and silently lossy
    // where it did not, which is the divergence class a projection exists to end.
    //
    // The exit tenant is therefore dropped rather than re-sided. Policy codes are the array's OTHER
    // tenant and survive: see `isProjectedExitCode`.
    const exitSideNumber = advancedExitWinningSide === 1 ? 2 : 1;
    const carriedCode = (matchUp.matchUpStatusCodes ?? [])
      .filter((code: any) => !isProjectedExitCode(code))
      .map(policyCodeString)
      .find(Boolean);
    const matchUpStatusCodes: string[] = [];
    if (carriedCode) {
      for (let i = 0; i < exitSideNumber - 1; i++) matchUpStatusCodes[i] = '';
      matchUpStatusCodes[exitSideNumber - 1] = carriedCode;
    }
    matchUp.matchUpStatusCodes = matchUpStatusCodes;
    clearResolvedSideExitProvenance(matchUp);
  } else if (participatesInExitCascade({ matchUp })) {
    /**
     * A LEGACY-ARRAY GATE ON A NATIVE WRITE — still here, and REMOVING IT IS MEASURED WRONG.
     *
     * `MATCHUP_STATUS_CODES_PER_SIDE.md` lists this inversion class among its decision sites, and P37's
     * destination is that no behaviour derives from `matchUpStatusCodes`. This one does: the array decides
     * whether the late-learned origin is recorded natively.
     *
     * Calling `recordSourceSideProvenance` unconditionally instead — on the reasoning that it refuses to
     * attribute what it cannot, so the gate was redundant — fails **58 tests across 5 files** (measured
     * 2026-09-27, together with the same removal in `removeSubsequentRoundsParticipant`):
     * `transitionProperties` loses 54 cells across nine draw types, plus `correctionDivergence`,
     * `crossStructureWinnerPositions` and two census replays.
     *
     * **WHAT THE TRUTHY ARRAY STANDS IN FOR, measured 2026-09-28.** It means *"this matchUp is already
     * part of the exit cascade"*. Over 30 sweep seeds, 854 matchUps, with both gates removed:
     *
     * | | gates in place | gates removed |
     * |---|---|---|
     * | matchUps carrying `sideExitProvenance` | 162 | **202** |
     * | ...on a matchUp that is neither an exit nor a BYE | 14 | **53** |
     * | matchUps that ARE an exit | 218 | **209** |
     *
     * Without the gate an ORDINARY advancement gets an origin stamped on it — provenance on non-exit
     * matchUps almost QUADRUPLES — and `sideExitProvenance` is PRESENCE-read (punch-list **P19**: *"one
     * bad writer silently flips every exclusion"*). Every rule that exempts "a matchUp with provenance"
     * then exempts matchUps that were simply played, which is why the failures land in
     * `transitionProperties` rather than in anything about codes. The exit count MOVING (218 → 209) says
     * it is not surplus metadata either: the draws come out different.
     *
     * **So the conversion is not "delete the gate", it is "ask the question the gate is asking".** The
     * replacement has to test cascade participation without reading the legacy array —
     * `isAnyExit(matchUp.matchUpStatus)`, existing provenance, or the caller passing down that it is
     * propagating. Each needs measuring against `transitionProperties`; none has been tried. This is the
     * last decision read on this surface and it wants its own change.
     */
    recordSourceSideProvenance({
      inContextDrawMatchUps: refreshedMatchUps(),
      drawPositions: updatedDrawPositions,
      sourceMatchUpStatus,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
      matchUp,
    });
  }

  // only in the case of "Double Exit" produced "Exit" can a winningSide be assigned at the same time as a position
  Object.assign(matchUp, {
    drawPositions: normalizeDrawPositions(updatedDrawPositions),
    winningSide: exitWinningSide,
    // We keep the current status if it is already marked as WO. Deliberately the BROADER flag: an
    // empty drawPosition arriving delivers no participant and so gives no reason to change
    // anything, but it was clearing the exit outright (SIGNAL 1, census 2026-09-20).
    matchUpStatus: holdsStandingExit ? matchUp?.matchUpStatus : matchUpStatus,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: inContextMatchUp?.eventId,
    context: stack,
    drawDefinition,
    matchUp,
    event,
  });
}

/**
 * Whether a participant arriving at a PENDING propagated exit landed on the EXITING side.
 *
 * A participant arriving at such a matchUp advances out of it only if they arrived on the WINNING
 * side — that is the documented resolution, the exit resolving onto whoever falls through into the
 * empty winner slot. `advanceDrawPosition` was advancing the arriving drawPosition unconditionally,
 * and a participant can also arrive on the exiting side.
 *
 * That happens whenever an upstream result is RE-SCORED: the consolation seat is vacated and
 * re-filled with the new loser, and by then the matchUp is already a propagated exit. The first fill
 * does not trip it — at that point `progressExitStatus` has not yet turned the matchUp into one.
 *
 * The consequence is `WINNING_SIDE_ADVANCEMENT_MISMATCH`: the LOSER of the consolation walkover sits
 * in the next round and the winner is dropped from the draw. Measured on FEED_IN_CHAMPIONSHIP 8/8 —
 * the advancing position was 6 while the matchUp's winningSide pointed at 7.
 *
 * Deliberately narrow: it reports true only when the winning drawPosition is KNOWN and differs, so a
 * pending exit that has no winningSide yet advances exactly as before.
 *
 * ## It does not fire, and until 2026-09-29 half the time it COULD not
 *
 * CA asked, 2026-09-13, whether this guard should ever fire once the upstream errors were resolved.
 * Measured over the full suite with a file trace, because the reporter swallows output from passing
 * files and a silent trace reads exactly like a dead path: **1,581 calls, 0 firings**, and forcing it
 * to `false` changes no test.
 *
 * That zero was partly an accident. The winning position was read as
 * `drawPositions[winningSide - 1]`, which is only sound while both positions are present, and **801
 * of the 1,581 calls hold a LONE position**. With `winningSide: 2` and one position held that reads
 * index 1, finds nothing, and the guard cannot fire whatever arrived. `getWinningSideDrawPosition`
 * resolves the side structurally; with it the count is still 0 of 1,582, so the answer to CA's
 * question is yes — but now it is an answer, where before it was a blind spot agreeing with one.
 *
 * Kept rather than deleted. It costs nothing, the hazard it names is real, and a guard that is able
 * to fire and does not is evidence; one that is unable to is not.
 */
function arrivesOnExitingSide({
  drawDefinition,
  drawPosition,
  structureId,
  matchUp,
}: {
  drawDefinition?: DrawDefinition;
  drawPosition: number;
  structureId?: string;
  matchUp: any;
}): boolean {
  const winningDrawPosition = getWinningSideDrawPosition({ drawDefinition, structureId, matchUp });
  return !!winningDrawPosition && winningDrawPosition !== drawPosition;
}

/**
 * Place `drawPosition` into the winnerMatchUp. All three advancement branches below make the same
 * call; only the condition differs, so the call lives in one place.
 *
 * ## A drawPosition is a number in ONE structure
 *
 * When the winnerMatchUp is in another structure — the Backdraw final feeding DOUBLE_ELIMINATION's
 * Main final, the Main final feeding the Decider — `drawPosition` names whoever holds that number
 * THERE, which is somebody else or nobody. Advancing it as-is put a Backdraw finalist into the Main
 * final under the number of a Main BYE (census seed 9100555), and pushed Main position 3 into a
 * Decider that has only positions 1 and 2 (9000196). Both were refused
 * `ERR_EXISTING_POSITION_ASSIGNMENT` over a draw the source write had already changed.
 *
 * `directWinner` already makes the crossing correctly for an ordinary result: it follows the WINNER
 * link and places the participant by their target-structure position. An advancement through a BYE
 * or a pending exit is the same crossing, so it goes the same way.
 */
function advanceIntoWinnerMatchUp({
  winnerMatchUpDrawPositionIndex,
  arrivesWithExit,
  inContextDrawMatchUps,
  tournamentRecord,
  winnerTargetLink,
  drawDefinition,
  winnerMatchUp,
  drawPosition,
  matchUpsMap,
  structure,
  matchUp,
  event,
}) {
  if (winnerMatchUp.structureId !== structure.structureId) {
    if (!winnerTargetLink) return undefined;
    // an advancement through a BYE or a pending exit carries no result of its own to project
    const result = directWinner({
      sourceMatchUpId: matchUp?.matchUpId,
      projectedWinningSide: undefined,
      sourceMatchUpStatus: undefined,
      dualMatchUp: undefined,
      winnerMatchUpDrawPositionIndex,
      winningDrawPosition: drawPosition,
      inContextDrawMatchUps,
      tournamentRecord,
      winnerTargetLink,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
    });
    return result.error ? result : undefined;
  }

  replaceEarlierAdvance({
    winnerMatchUpId: winnerMatchUp.matchUpId,
    structureId: structure.structureId,
    sourceMatchUp: matchUp,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUpsMap,
    event,
  });
  const result = assignMatchUpDrawPosition({
    matchUpId: winnerMatchUp.matchUpId,
    inContextDrawMatchUps,
    arrivesWithExit,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUpsMap,
    event,
  });
  return result.error ? result : undefined;
}

/**
 * ONE position goes on from a matchUp. A BYE-held matchUp whose other seat is still empty advances its lone position
 * (the BYE, or an empty seat) structurally; when somebody then arrives opposite it, it is THEIR position that goes on,
 * and it REPLACES the one already there rather than sitting beside it. Census w2 9100198 (FEED_IN_CHAMPIONSHIP_TO_SF
 * 16/11): `Consolation|4|1` held only a propagated BYE on dp1, already advanced into `5|1`; the arrival on dp3 was
 * added beside it, so `5|1` held two positions from one feeder (`[1, 3]`), and the next arrival from `4|2` evicted the
 * BYE and un-decided `5|1` (MONOTONIC_DECISION). A position that holds a participant is never replaced here.
 */
function replaceEarlierAdvance({
  tournamentRecord,
  winnerMatchUpId,
  drawDefinition,
  sourceMatchUp,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  winnerMatchUpId: string;
  drawPosition: number;
  structureId: string;
  sourceMatchUp?: MatchUp;
  event?: Event;
}) {
  const stored = matchUpsMap?.drawMatchUps?.find((candidate) => candidate.matchUpId === winnerMatchUpId);
  const held = (stored?.drawPositions ?? []).filter((position): position is number => !!position);
  if (!stored || held.includes(drawPosition)) return;
  const sourcePositions: number[] = sourceMatchUp?.drawPositions ?? [];
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const earlier = held.find((position) => {
    if (position === drawPosition || !sourcePositions.includes(position)) return false;
    const assignment = positionAssignments?.find((candidate) => candidate.drawPosition === position);
    return !assignment?.participantId;
  });
  if (!earlier) return;
  const wasHeldByBye = stored.matchUpStatus === BYE;
  setMatchUpDrawPositions({
    drawPositions: (stored.drawPositions ?? []).map((position) => (position === earlier ? undefined : position)),
    matchUp: stored,
    drawDefinition,
    structureId,
  });
  // A BYE TAKEN BACK TAKES ITS ADVANCE WITH IT. The participant opposite the replaced BYE went on because of it; with
  // the arrival in its seat the matchUp is to be played, so what they were advanced into is released. Census w2 9100211
  // (FIRST_MATCH_LOSER_CONSOLATION 32/32, `doubleExitPropagateBye: false`): `Consolation|3|2` held a BYE advanced from
  // `Consolation|2|4` and carried its occupant into `Consolation|4|1`; when the participant who arrived took the BYE's
  // seat, the occupant stayed in `4|1`, advanced out of a matchUp with no result (ADVANCED_FROM_UNDECIDED).
  if (!wasHeldByBye || !positionAssignments?.some((entry) => entry.drawPosition === earlier && entry.bye)) return;
  for (const position of held.filter((candidate) => candidate !== earlier)) {
    if (!positionAssignments?.some((entry) => entry.drawPosition === position && entry.participantId)) continue;
    releaseAdvancedDrawPositionAcrossLinks({
      fromRoundNumber: (stored.roundNumber ?? 0) + 1,
      drawPosition: position,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structureId,
      event,
    });
  }
}

function advanceDrawPosition(params) {
  const {
    positionAssigned,
    participantArrivesAtExit,
    inContextMatchUp,
    matchUpStatus,
    winnerMatchUp,
    drawPosition,
    isByeMatchUp,
    isLuckyDraw,
    matchUpsMap,
    matchUp,
    structure,
  } = params;

  if (!winnerMatchUp) return undefined;

  if (positionAssigned && isByeMatchUp && !isLuckyDraw) {
    if ([BYE, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus)) return advanceIntoWinnerMatchUp(params);
    if (winnerMatchUp.structureId !== structure.structureId) {
      pushGlobalLog({
        method: 'assignMatchUpDrawPosition',
        issue: 'winnerMatchUp in different structure; participant is in a different targetDrawPosition',
      });
    }
    return undefined;
  }

  if (positionAssigned && participantArrivesAtExit) {
    // a participant arriving on the EXITING side of a pending propagated exit has not won it
    return arrivesOnExitingSide({
      drawDefinition: params.drawDefinition,
      structureId: structure?.structureId,
      drawPosition,
      matchUp,
    })
      ? undefined
      : advanceIntoWinnerMatchUp(params);
  }

  if (inContextMatchUp && !inContextMatchUp.feedRound) {
    const { pairedPreviousMatchUpIsDoubleExit } = getPairedPreviousMatchUpIsDoubleExit({
      targetMatchUp: matchUp,
      drawPosition,
      matchUpsMap,
      structure,
    });
    if (pairedPreviousMatchUpIsDoubleExit) return advanceIntoWinnerMatchUp(params);
  }

  return undefined;
}

function assignTeamLineUp({
  inContextDrawMatchUps,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUp,
}) {
  const inContextTargetMatchUp = inContextDrawMatchUps?.find(({ matchUpId }) => matchUpId === matchUp.matchUpId);
  const sides: any[] = inContextTargetMatchUp?.sides ?? [];
  const drawPositionSideIndex = sides.reduce(
    (index, side, i) => (side.drawPosition === drawPosition ? i : index),
    undefined,
  );
  const teamParticipantId = positionAssignments?.find(
    (assignment) => assignment.drawPosition === drawPosition,
  )?.participantId;

  if (teamParticipantId && drawPositionSideIndex !== undefined) {
    updateSideLineUp({
      inContextTargetMatchUp,
      drawPositionSideIndex,
      teamParticipantId,
      tournamentRecord,
      drawDefinition,
      matchUp,
    });
  }
}

export function propagateConsolationBye({
  updatedDrawPositions,
  loserTargetDrawPosition,
  tournamentRecord,
  loserTargetLink,
  drawDefinition,
  structureId,
  isByeMatchUp,
  loserMatchUp,
  matchUpsMap,
  event,
}) {
  if (
    loserTargetLink?.linkCondition !== FIRST_MATCHUP ||
    updatedDrawPositions.filter(Boolean).length !== 2 ||
    isByeMatchUp
  ) {
    return undefined;
  }

  const structureMatchUps = getMappedStructureMatchUps({
    structureId,
    matchUpsMap,
  });

  const firstRoundMatchUps = structureMatchUps.filter(
    ({ drawPositions, roundNumber }) => roundNumber === 1 && overlap(drawPositions, updatedDrawPositions),
  );
  /**
   * A feeder counts toward the reservation when it has produced a WIN — which is the authority's
   * question, not a status question. `[COMPLETED, RETIRED]` restated it and drifted: a scored
   * `DEFAULTED` is a win to `getDrawPositionWinCount`, the predicate `directLoser` actually uses to
   * decide the eligibility this reservation is predicting, but was absent from the list. The
   * reservation was therefore placed late for that outcome — `Consolation|2|1` read `TO_BE_PLAYED`
   * until the round-2 result arrived and `directLoser` placed the BYE on the authority's terms.
   * `isUnscoredOutcome`'s own docblock names this failure: a guard that restates the rule and drifts
   * from it is worse than none.
   */
  const byePropagation = firstRoundMatchUps.every(
    ({ matchUpStatus, winningSide, score }) => !!winningSide && !isUnscoredOutcome({ matchUpStatus, score }),
  );
  if (byePropagation && loserMatchUp) {
    const { structureId } = loserMatchUp;
    const result = assignDrawPositionBye({
      drawPosition: loserTargetDrawPosition,
      byeFromPropagation: true,
      tournamentRecord,
      drawDefinition,
      structureId,
      matchUpsMap,
      event,
    });

    if (result.error) return result;
  }

  /**
   * A reservation that is placed must also be WITHDRAWN.
   *
   * `propagateConsolationBye` reserves a consolation slot with a BYE once every feeding first-round
   * matchUp is decided: whoever loses the next round will have a prior win, so a FIRST_MATCHUP link
   * will not carry them, and the slot can never fill. Correct when placed — and never revisited.
   *
   * Correcting one of those first-round results to a WALKOVER or DEFAULTED removes the prior win,
   * the prospective loser becomes eligible again, and the reservation is stale. Measured on
   * FIRST_MATCH_LOSER_CONSOLATION 8/8 and 16/16 `nonRandom: 9000230`: `Consolation|2|1` read `BYE`
   * where the same two outcomes entered directly read `TO_BE_PLAYED`.
   *
   * This is the only confluence defect in the engine that does NOT involve a double exit — measured
   * at 4 divergences in 576 cells across six correction shapes and eight draw types.
   *
   * The placement is now marked so the withdrawal can recognise its own work; `assignDrawPositionBye`
   * otherwise deletes the marker here, because this site passes no `loserMatchUp` for its topology
   * inference to read.
   *
   * SCOPE, and it is deliberate: this runs on the winner-advancement path, so it reaches a
   * correction only while the consolation is UNPLAYED. Once a consolation result exists the
   * correction is REFUSED outright by the active-downstream guard
   * (`ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE`) — a main-draw change may not percolate into a
   * backdraw that has started, CA 2026-09-22 — so there is no stale reservation left to withdraw.
   * `consolationByeWithdrawnOnCorrection.test.ts` pins both halves.
   */
  if (!byePropagation && loserMatchUp) {
    const { structureId: targetStructureId } = loserMatchUp;
    const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: targetStructureId });
    const assignment = positionAssignments?.find((a) => a.drawPosition === loserTargetDrawPosition);
    if (assignment?.bye && assignment?.byeFromPropagation) {
      const result = clearDrawPosition({
        drawPosition: loserTargetDrawPosition,
        structureId: targetStructureId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
      if (result.error) return result;
    }
  }

  return undefined;
}

/**
 * A BYE that is only in this matchUp by ADVANCEMENT yields to a participant who has earned the slot.
 *
 * ## The state this exists for
 *
 * `doubleExitAdvancement`'s same-structure branch advances the side that is NOT the exit
 * (`advanceFromTarget`, via `getExitWinningSide`) and reads that side's positionAssignment only to
 * test `assignment?.bye` — it never tests `participantId`. So when the winning side is a fed slot
 * that is still VACANT, a drawPosition holding nobody is advanced into the next matchUp as a
 * RESERVATION for whoever eventually falls through. The asymmetry is visible in the same file: the
 * cross-structure sibling `directExitWinnerAcrossLink` makes exactly the missing test —
 * `if (!assignment?.participantId || assignment.bye) return;`.
 *
 * If a BYE then lands in that slot, nobody ever arrives, and the reservation becomes permanent.
 * Nothing releases it: every unwind primitive in the engine — `releaseAdvancedDrawPosition`,
 * `removeSubsequentRoundsParticipant`, `drawPositionRemovals` — is reachable only from removing or
 * changing the SOURCE result, or from clearing the position itself. `assignDrawPositionBye` holds no
 * drawPosition release at all, and `correctResultsAwardedToTheBye` corrects the STATUS of the
 * matchUps standing on such a BYE while leaving their `drawPositions` untouched.
 *
 * The next real arrival then finds both slots occupied and is refused `DRAW_POSITION_ASSIGNED` —
 * after `directParticipants` has already committed the source result, which is the
 * `ERROR_IMPLIES_NO_MUTATION` shape.
 *
 * ## Why the test is made HERE, at the arrival, and not where the BYE is placed
 *
 * Two earlier attempts released the advancement at BYE-ASSIGNMENT time and both measured worse —
 * one closed 7 census seeds and opened 6, the other closed 7 and opened 28. At assignment time the
 * reservation may still be perfectly truthful: nobody can come out of that matchUp yet, so holding
 * the slot is correct. It is only WRONG once somebody demonstrably needs it. Asking at the arrival
 * cannot fire on a reservation that still holds.
 *
 * ## What distinguishes a squatter from a BYE that legitimately advanced
 *
 * A BYE advances itself only when its PAIR is also a BYE — `advanceWinner` already encodes this
 * (`advancingDrawPosition = pairedDrawPositionIsBye ? drawPositionToAdvance : pairedDrawPosition`).
 * Otherwise the BYE stays put and the opponent moves. So a BYE appearing in a round LATER than the
 * one where its drawPosition first appears, marked `byeFromPropagation`, was put there by the
 * reservation path rather than by legitimate advancement. All three facts are stored; none is
 * inferred from topology.
 *
 * `byeFromPropagation` is the right marker for the question — `directLoser` already reads it the
 * same way, treating a propagated BYE as AVAILABLE to an arriving loser while an unmarked
 * structural BYE is not.
 *
 * ## What comes back with it
 *
 * The paired position advanced out of this matchUp on the BYE's strength, so it is released from the
 * round AFTER this one. `removeSubsequentRoundsParticipant` is the correct primitive rather than the
 * narrower `releaseAdvancedDrawPosition` because it also rewrites `matchUpStatus`, `winningSide` and
 * the codes on what it releases — results recorded over a contest that never happened.
 *
 * `inContextDrawMatchUps` must be threaded through: `recordSourceSideProvenance` dereferences it
 * unguarded, and omitting it converts the refusal into a TypeError.
 */
function yieldSquattingPropagatedBye({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  structure,
  matchUp,
}): boolean {
  if (!matchUp?.roundNumber || !structure) return false;
  const structureId = structure.structureId;
  const structureMatchUps = matchUpsMap?.mappedMatchUps?.[structureId]?.matchUps ?? [];
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structure });

  for (const candidate of (matchUp.drawPositions ?? []).filter(Boolean)) {
    const assignment = positionAssignments?.find((a) => a.drawPosition === candidate);
    if (!assignment?.bye || !assignment.byeFromPropagation) continue;
    const { initialRoundNumber } = getInitialRoundNumber({ drawPosition: candidate, matchUps: structureMatchUps });
    if (!initialRoundNumber || matchUp.roundNumber <= initialRoundNumber) continue;

    const paired = (matchUp.drawPositions ?? []).filter(Boolean).find((position) => position !== candidate);

    removeSubsequentRoundsParticipant({
      targetDrawPosition: candidate,
      roundNumber: matchUp.roundNumber,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
      structureId,
    });

    // whoever advanced THROUGH the bye advanced on its strength, so that comes back too
    if (paired) {
      removeSubsequentRoundsParticipant({
        targetDrawPosition: paired,
        roundNumber: matchUp.roundNumber + 1,
        inContextDrawMatchUps,
        drawDefinition,
        matchUpsMap,
        structureId,
      });
    }
    return true;
  }
  return false;
}

// ============================================================================
// from directWinner.ts
// ============================================================================

export function directWinner({
  winnerMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  projectedWinningSide,
  sourceMatchUpStatus,
  winningDrawPosition,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  dualMatchUp,
  matchUpsMap,
  event,
}): ResultType {
  const stack = 'directWinner';

  if (winnerTargetLink) {
    const result: any = directWinnerViaLink({
      winnerMatchUpDrawPositionIndex,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      winningDrawPosition,
      tournamentRecord,
      winnerTargetLink,
      sourceMatchUpId,
      drawDefinition,
      winnerMatchUp,
      matchUpsMap,
      event,
      stack,
    });
    if (result?.error) return result;
  } else {
    const result = assignMatchUpDrawPosition({
      matchUpId: winnerMatchUp.matchUpId,
      drawPosition: winningDrawPosition,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (result.error) return result;
  }

  if (dualMatchUp && projectedWinningSide) {
    propagateLineUp({
      projectedWinningSide,
      tournamentRecord,
      drawDefinition,
      winnerMatchUp,
      dualMatchUp,
      matchUpsMap,
      stack,
      event,
    });
  }

  return { ...SUCCESS };
}

function directWinnerViaLink({
  winnerMatchUpDrawPositionIndex,
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  winningDrawPosition,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  event,
  stack,
}) {
  const targetMatchUpDrawPositions = winnerMatchUp.drawPositions ?? [];
  const targetMatchUpDrawPosition = getSideDrawPosition({
    sideNumber: winnerMatchUpDrawPositionIndex + 1,
    structureId: winnerMatchUp.structureId,
    matchUp: winnerMatchUp,
    drawDefinition,
  });

  const sourceStructureId = winnerTargetLink.source.structureId;
  const result = findStructure({ structureId: sourceStructureId, drawDefinition });
  if (result.error) return result;
  const { structure } = result;

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: sourceStructureId,
    drawDefinition,
  });

  const relevantSourceAssignment = sourcePositionAssignments?.find(
    (assignment) => assignment.drawPosition === winningDrawPosition,
  );
  const winnerParticipantId = relevantSourceAssignment?.participantId;

  const targetStructureId = winnerTargetLink.target.structureId;
  const { positionAssignments: targetPositionAssignments } = structureAssignedDrawPositions({
    structureId: targetStructureId,
    drawDefinition,
  });

  const relevantAssignment = targetPositionAssignments?.find(
    (assignment) => assignment.participantId === winnerParticipantId,
  );
  const winnerExistingDrawPosition = relevantAssignment?.drawPosition;

  const unfilledTargetMatchUpDrawPositions = targetPositionAssignments
    ?.filter((assignment) => {
      const inTarget = targetMatchUpDrawPositions.includes(assignment.drawPosition);
      const unfilled = !assignment.participantId && !assignment.bye && !assignment.qualifier;
      return inTarget && unfilled;
    })
    .map((assignment) => assignment.drawPosition);
  const targetDrawPositionIsUnfilled =
    !!targetMatchUpDrawPosition && unfilledTargetMatchUpDrawPositions?.includes(targetMatchUpDrawPosition);

  if (
    winnerParticipantId &&
    winnerTargetLink.target.roundNumber === 1 &&
    targetMatchUpDrawPosition &&
    targetDrawPositionIsUnfilled
  ) {
    assignDrawPosition({
      drawPosition: targetMatchUpDrawPosition,
      participantId: winnerParticipantId,
      structureId: targetStructureId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
  } else if (winnerParticipantId && unfilledTargetMatchUpDrawPositions?.length) {
    const drawPosition = unfilledTargetMatchUpDrawPositions.pop();
    drawPosition &&
      assignDrawPosition({
        participantId: winnerParticipantId,
        structureId: targetStructureId,
        inContextDrawMatchUps,
        sourceMatchUpStatus,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        event,
      });
  } else if (winnerExistingDrawPosition) {
    const assignResult = assignMatchUpDrawPosition({
      drawPosition: winnerExistingDrawPosition,
      matchUpId: winnerMatchUp.matchUpId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (assignResult.error) return decorateResult({ result: assignResult, stack });
  } else if (structure?.stage !== QUALIFYING) {
    const error = 'winner target position unavaiallble';
    pushGlobalLog({ method: 'directWinner', error });
    decorateResult({ stack, result: { error } });
  }

  if (structure?.seedAssignments && structure.structureId !== targetStructureId) {
    const seedAssignment = structure.seedAssignments.find(({ participantId }) => participantId === winnerParticipantId);
    const participantId = seedAssignment?.participantId;
    if (seedAssignment && participantId) {
      assignSeed({
        eventId: winnerMatchUp?.eventId,
        structureId: targetStructureId,
        ...seedAssignment,
        tournamentRecord,
        drawDefinition,
        participantId,
      });
    }
  }

  return undefined;
}

function propagateLineUp({
  projectedWinningSide,
  tournamentRecord,
  drawDefinition,
  winnerMatchUp,
  dualMatchUp,
  matchUpsMap,
  stack,
  event,
}) {
  const side = dualMatchUp.sides?.find((s) => s.sideNumber === projectedWinningSide);
  if (!side?.lineUp) return;

  const source = dualMatchUp.roundPosition;
  const target = winnerMatchUp.roundPosition;
  /**
   * ON A FEED ROUND THE ADVANCING TEAM IS SIDE 2 — `draw-positions.md` rule 4: a fed position is side
   * 1, one that advanced from the prior round of this structure is side 2 — and roundPosition
   * arithmetic cannot know that. `Consolation|1|1` → `Consolation|2|1` of a FIRST_MATCH_LOSER_CONSOLATION
   * is rp 1 → rp 1, which the formula below reads as side 1; the fed seat then arrived on side 1
   * holding the advancing team's lineUp, and every line of that dual hydrated with one player on both
   * sides (measured 2026-10-01, TEAM matrix line arm: BYE_WON on 56 of 60 FMLC cells). DOUBLE_ELIMINATION's
   * Main final is a feed round for side ordering too (rule 4a), and takes the same answer.
   */
  const advancedByPosition = (source === target && source !== 1) || Math.floor(source / 2) === target;
  const targetSideNumber = winnerMatchUp.feedRound || advancedByPosition ? 2 : 1;

  const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === winnerMatchUp.matchUpId);

  const updatedSides = [1, 2].map((sideNumber) => {
    const existingSide = targetMatchUp.sides?.find((s) => s.sideNumber === sideNumber) ?? {};
    return { ...existingSide, sideNumber };
  });

  targetMatchUp.sides = updatedSides;
  const targetSide = targetMatchUp.sides.find((s) => s.sideNumber === targetSideNumber);

  if (targetSide) {
    const filteredLineUp = side.lineUp?.filter((assignment) => assignment?.participantId);

    targetSide.lineUp = removeLineUpSubstitutions({ lineUp: filteredLineUp });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: winnerMatchUp?.eventId,
      matchUp: targetMatchUp,
      context: stack,
      drawDefinition,
      event,
    });
  }
}

// ============================================================================
// from positionAssignment.ts
// ============================================================================

type AssignDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  /** the participant placed is a loser carrying an exit under propagation; see `assignMatchUpDrawPosition` */
  arrivesWithExit?: boolean;
  sourceMatchUpStatus?: MatchUpStatusUnion;
  provisionalPositioning?: boolean;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  isQualifierPosition?: boolean;
  matchUpsMap?: MatchUpsMap;
  participantId: string;
  drawPosition: number;
  seedBlockInfo?: any;
  structureId: string;
  event?: Event;
};

export function assignDrawPosition({
  provisionalPositioning,
  arrivesWithExit,
  inContextDrawMatchUps,
  isQualifierPosition, // internal use
  sourceMatchUpStatus,
  tournamentRecord,
  drawDefinition,
  seedingProfile,
  participantId,
  seedBlockInfo,
  drawPosition,
  matchUpsMap,
  structureId,
  event,
}: AssignDrawPositionArgs): ResultType & {
  positionAssignments?: PositionAssignment[];
} {
  const stack = 'assignDrawPosition';

  if (!participantId && !isQualifierPosition)
    return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  matchUpsMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });

  if (!inContextDrawMatchUps) {
    ({ matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }));
  }

  const result = findStructure({ drawDefinition, structureId });
  if (result.error) return decorateResult({ result, stack });
  const { structure } = result;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  // there are no drawPositions assigned for ADHOC structures
  if (isAdHoc({ structure })) return decorateResult({ result: { error: INVALID_MATCHUP }, stack });

  const { seedAssignments } = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structure,
  });

  const relevantAssignment = seedAssignments?.find((assignment) => assignment.participantId === participantId);
  const participantSeedNumber = relevantAssignment?.seedNumber;

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });
  if (participantSeedNumber) {
    const isValidDrawPosition = isValidSeedPosition({
      seedNumber: participantSeedNumber,
      appliedPolicies,
      drawDefinition,
      seedBlockInfo,
      drawPosition,
      structureId,
    });
    if (!isValidDrawPosition)
      return decorateResult({
        result: { error: INVALID_DRAW_POSITION_FOR_SEEDING },
        context: { drawPosition },
        stack,
      });
  }

  const sadp = structureAssignedDrawPositions({ structure });
  const positionAssignments: PositionAssignment[] = sadp.positionAssignments ?? [];
  const positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  if (!positionAssignment)
    return decorateResult({
      result: { error: INVALID_DRAW_POSITION },
      context: { drawPosition },
      stack,
    });

  // Idempotent no-op: the participant is already assigned to exactly this
  // drawPosition. Re-asserting the same assignment (a bulk re-sync or a retry —
  // e.g. an integration re-pushing an already-populated draw) must succeed, not
  // error. The "already assigned" guard below still applies when the participant
  // sits at a DIFFERENT drawPosition — that's a real conflict needing a swap/clear.
  if (positionAssignment.participantId === participantId) return { positionAssignments, ...SUCCESS };

  const participantAlreadyAssigned = positionAssignments?.map(getParticipantId).includes(participantId);

  if (participantAlreadyAssigned) {
    return decorateResult({
      result: { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT },
      context: { drawPosition },
      stack,
    });
  }

  const { containsParticipant, containsBye } = drawPositionFilled(positionAssignment);

  if (containsBye) {
    const result = clearDrawPosition({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      structureId,
      matchUpsMap,
      event,
    }) as { error?: ErrorType };
    if (result.error) return decorateResult({ result, stack });
  }

  if (containsParticipant && positionAssignment.participantId !== participantId) {
    const { activeDrawPositions } = getStructureDrawPositionProfiles({
      drawDefinition,
      structureId,
    });
    const drawPositionIsActive = activeDrawPositions.includes(drawPosition);
    if (drawPositionIsActive) {
      return decorateResult({ result: { error: DRAW_POSITION_ACTIVE }, stack });
    }

    // cleanup side[].lineUps of previous participantId in TEAM matchUps
    resetLineUps({
      assignments: [positionAssignment],
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structure,
    });
  }

  positionAssignment.participantId = participantId;
  if (isQualifierPosition) positionAssignment.qualifier = true;

  propagateSeedAssignment({
    provisionalPositioning,
    tournamentRecord,
    drawDefinition,
    seedingProfile,
    participantId,
    structureId,
    structure,
    event,
  });

  if (structure.structureType === CONTAINER) {
    handleContainerAssignment({
      inContextDrawMatchUps,
      positionAssignments,
      positionAssignment,
      tournamentRecord,
      drawDefinition,
      participantId,
      matchUpsMap,
      structure,
      event,
    });
  } else {
    addDrawPositionToMatchUps({
      provisionalPositioning,
      arrivesWithExit,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      structure,
      event,
    });
  }

  const drawEntry = drawDefinition.entries?.find((entry) => entry.participantId === participantId);
  const eventEntry = event?.entries?.find((entry) => entry.participantId === participantId);

  if (!drawEntry && eventEntry) {
    addDrawEntry({
      entryStatus: eventEntry.entryStatus,
      entryStage: structure.stage,
      ignoreStageSpace: true,
      drawDefinition,
      participantId,
      event,
    });
  }

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return { positionAssignments, ...SUCCESS };
}

function propagateSeedAssignment({
  provisionalPositioning,
  tournamentRecord,
  drawDefinition,
  seedingProfile,
  participantId,
  structureId,
  structure,
  event,
}) {
  const mainSeeding = structure.stage === MAIN && (!structure.stageSequence || structure.stageSequence > 1);
  if (!mainSeeding && !(structure.stage && [CONSOLATION, PLAY_OFF].includes(structure.stage))) return;

  const targetStage = structure.stage === QUALIFYING ? QUALIFYING : MAIN;
  const targetStructure = drawDefinition.structures?.find((s) => s?.stage === targetStage && s?.stageSequence === 1);
  const seedAssignments = targetStructure?.seedAssignments ?? [];
  const assignment = seedAssignments.find((a) => a.participantId === participantId);

  if (assignment?.participantId) {
    assignSeed({
      eventId: event?.eventId,
      participantId: assignment.participantId,
      seedNumber: assignment.seedNumber,
      seedValue: assignment.seedValue,
      provisionalPositioning,
      tournamentRecord,
      drawDefinition,
      seedingProfile,
      structureId,
      event,
    });
  }
}

function handleContainerAssignment({
  inContextDrawMatchUps,
  positionAssignments,
  positionAssignment,
  tournamentRecord,
  drawDefinition,
  participantId,
  matchUpsMap,
  structure,
  event,
}) {
  modifyRoundRobinMatchUpsStatus({
    positionAssignments,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });

  const { drawPositions, matchUps, targetMatchUps } = getTargetMatchUps({
    assignments: [positionAssignment],
    inContextDrawMatchUps,
    drawDefinition,
    matchUpsMap,
    structure,
  });

  if (drawPositions && matchUps?.length === 1 && matchUps[0].matchUpType === TEAM) {
    const sides: any = targetMatchUps?.[0].sides ?? [];
    const drawPositionSideIndex = sides.reduce(
      (sideIndex, side, i: number) => (drawPositions?.includes(side.drawPosition) ? i : sideIndex),
      undefined,
    );

    updateSideLineUp({
      inContextTargetMatchUp: targetMatchUps[0],
      teamParticipantId: participantId,
      matchUp: matchUps[0],
      drawPositionSideIndex,
      tournamentRecord,
      drawDefinition,
    });
  }
}

// used for matchUps which are NOT in a ROUND_ROBIN { structureType: CONTAINER }
function addDrawPositionToMatchUps({
  provisionalPositioning,
  arrivesWithExit,
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  structure,
  event,
}) {
  const matchUpFilters = { isCollectionMatchUp: false };
  const { matchUps } = getAllStructureMatchUps({
    provisionalPositioning,
    matchUpFilters,
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });

  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition,
    matchUps,
  });

  const matchUp =
    initialRoundNumber &&
    roundMatchUps?.[initialRoundNumber].find((matchUp) => matchUp.drawPositions?.includes(drawPosition));

  if (matchUp) {
    const result = assignMatchUpDrawPosition({
      matchUpId: matchUp.matchUpId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      arrivesWithExit,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      event,
    });
    if (result.error)
      return decorateResult({
        stack: 'assignDrawPositionToMatchUps',
        context: { drawPosition },
        result,
      });
  }
  return { ...SUCCESS };
}
