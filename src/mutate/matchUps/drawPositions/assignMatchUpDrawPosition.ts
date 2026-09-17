import { getPairedPreviousMatchUpIsDoubleExit } from '@Query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { removeSubsequentRoundsParticipant } from '@Mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant';
import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { updateMatchUpStatusCodes } from '@Mutate/drawDefinitions/matchUpGovernor/matchUpStatusCodes';
import { clearResolvedSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { updateSideLineUp } from '@Mutate/matchUps/lineUps/updateSideLineUp';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { assignDrawPositionBye } from './assignDrawPositionBye';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { directWinner } from './directWinner';
import { isExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';

// constants and types
import { DRAW_POSITION_ASSIGNED, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import {
  BYE,
  COMPLETED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';

type AssignMatchUpDrawPositionArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: string;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  matchUpStatus?: string;
  drawPosition: number;
  matchUpId: string;
  event?: Event;
};
export function assignMatchUpDrawPosition({
  inContextDrawMatchUps,
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

  //are we going to a match already marked as a WO becuase it was propagated from the main draw?
  const isPropagatedExit = !!(isExit(matchUp?.matchUpStatus) && matchUp?.winningSide);

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

  if (matchUp && positionAdded) {
    applyPositionToMatchUp({
      updatedDrawPositions,
      sourceMatchUpStatus,
      isPropagatedExit,
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
  const {
    targetMatchUps: { winnerMatchUp, loserMatchUp, loserTargetDrawPosition, winnerMatchUpDrawPositionIndex },
    targetLinks: { loserTargetLink, winnerTargetLink },
  } = targetData;

  // In lucky draws, all round-to-round advancement is handled by luckyDrawAdvancement
  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);

  const advanceResult = advanceDrawPosition({
    winnerMatchUpDrawPositionIndex,
    winnerTargetLink,
    event,
    inContextDrawMatchUps: resolvedInContextDrawMatchUps,
    positionAssigned,
    isPropagatedExit,
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

/**
 * The string value of a `matchUpStatusCodes` element, whatever shape it arrived in.
 *
 * The array holds THREE shapes, which is the root problem:
 *   1. policy codes      `{ matchUpStatusCode, label, matchUpStatusCodeDisplay }` — the scoring
 *                        policy's vocabulary (see POLICY_SCORING_USTA)
 *   2. exit provenance   `{ matchUpStatus, previousMatchUpStatus, sideNumber }` — projected from
 *                        `sideExitProvenance` by `projectExitStatusCodes`
 *   3. wrapped codes     `{ code }` — written by updateMatchUpStatusCodes, which wraps any string
 *                        element before stamping `previousMatchUpStatus` onto it
 *
 * The previous read was `code?.code`, which resolves shape 3 correctly and shapes 1 and 2 to
 * `undefined`. Provenance is the shape this branch actually receives, so the carried code was
 * dropped and the branch assigned an empty array rather than re-siding anything.
 *
 * Measured 2026-09-11 over 120 randomized sweep scenarios: the branch below ran 275 times, 81 of
 * those with codes present, every one of them shape 2, and dropped the code in 81 of 81.
 *
 * Note this returns a STRING, so provenance (`previousMatchUpStatus`, `sideNumber`) is still
 * flattened away — the surrounding contract is `string[]`. Preserving it is what the per-side
 * provenance field is for; see Mentat/planning/MATCHUP_STATUS_CODES_PER_SIDE.md.
 */
function exitCodeString(code: any): string | undefined {
  if (typeof code === 'string') return code || undefined;
  return code?.matchUpStatusCode ?? code?.code ?? code?.matchUpStatus ?? undefined;
}

function applyPositionToMatchUp({
  updatedDrawPositions,
  sourceMatchUpStatus,
  isPropagatedExit,
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
  // necessary to refresh inContextDrawMatchUps after mutation
  const refreshedMatchUps =
    getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }).matchUps ?? [];
  // A participant advancing into a PENDING propagated exit fills its empty WINNER slot
  // (progressExitStatus set winningSide to the empty side). drawPositions is then
  // re-sorted, so the winning side is the side the advancing participant now occupies
  // in updatedDrawPositions — NOT the pre-sort winningSide (which, after the sort, can
  // point at the exiting/loser side). Mirrors resolvePropagatedExitOnAdvance (BYE path).
  // `indexOf` as a side number — valid only because drawPositions are stored ascending.
  // See the canonical statement in `getOrderedDrawPositions`.
  const advancedExitWinningSide = isPropagatedExit ? updatedDrawPositions.indexOf(drawPosition) + 1 : undefined;
  const exitWinningSide =
    (isDoubleExitExit &&
      getExitWinningSide({
        inContextDrawMatchUps: refreshedMatchUps,
        drawPosition,
        matchUpId,
      })) ||
    advancedExitWinningSide ||
    undefined;

  // Advancing into a single pending propagated exit re-orders the sides, so the carried
  // exit code must follow the EXITING participant to its new side (opposite the advancing
  // winner) — otherwise it mislabels the winner. Mirrors resolvePropagatedExitOnAdvance.
  if (advancedExitWinningSide && !isDoubleExitExit) {
    const exitSideNumber = advancedExitWinningSide === 1 ? 2 : 1;
    const carriedCode = (matchUp.matchUpStatusCodes ?? []).map(exitCodeString).find(Boolean);
    const matchUpStatusCodes: string[] = [];
    if (carriedCode) {
      for (let i = 0; i < exitSideNumber - 1; i++) matchUpStatusCodes[i] = '';
      matchUpStatusCodes[exitSideNumber - 1] = carriedCode;
    }
    matchUp.matchUpStatusCodes = matchUpStatusCodes;
    // Nothing carried means the exit this matchUp recorded is gone — unless the status says
    // otherwise, in which case the provenance is still describing a live exit.
    if (!matchUpStatusCodes.length) clearResolvedSideExitProvenance(matchUp);
  } else if (matchUp?.matchUpStatusCodes) {
    updateMatchUpStatusCodes({
      inContextDrawMatchUps: refreshedMatchUps,
      sourceMatchUpStatus,
      sourceMatchUpId,
      matchUpsMap,
      matchUp,
    });
  }

  // only in the case of "Double Exit" produced "Exit" can a winningSide be assigned at the same time as a position
  Object.assign(matchUp, {
    drawPositions: updatedDrawPositions,
    winningSide: exitWinningSide,
    //we keep the current status if it is already marked as WO
    matchUpStatus: isPropagatedExit ? matchUp?.matchUpStatus : matchUpStatus,
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
 */
function arrivesOnExitingSide(matchUp: any, drawPosition: number): boolean {
  // Derives a side from drawPosition ORDER — valid only because drawPositions are stored ascending.
  // See the canonical statement in `getOrderedDrawPositions`.
  const winningDrawPosition = matchUp?.winningSide ? matchUp?.drawPositions?.[matchUp.winningSide - 1] : undefined;
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

  const result = assignMatchUpDrawPosition({
    matchUpId: winnerMatchUp.matchUpId,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUpsMap,
    event,
  });
  return result.error ? result : undefined;
}

function advanceDrawPosition(params) {
  const {
    positionAssigned,
    isPropagatedExit,
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

  if (positionAssigned && isPropagatedExit) {
    // a participant arriving on the EXITING side of a pending propagated exit has not won it
    return arrivesOnExitingSide(matchUp, drawPosition) ? undefined : advanceIntoWinnerMatchUp(params);
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

function propagateConsolationBye({
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
  const byePropagation = firstRoundMatchUps.every(({ matchUpStatus }) => [COMPLETED, RETIRED].includes(matchUpStatus));
  if (byePropagation && loserMatchUp) {
    const { structureId } = loserMatchUp;
    const result = assignDrawPositionBye({
      drawPosition: loserTargetDrawPosition,
      tournamentRecord,
      drawDefinition,
      structureId,
      matchUpsMap,
      event,
    });

    if (result.error) return result;
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
 * `inContextDrawMatchUps` must be threaded through: `updateMatchUpStatusCodes` dereferences it
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
