import { advanceDrawPosition, assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getPairedPreviousMatchUpIsDoubleExit } from '@Query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { assignMatchUpDrawPosition } from '@Mutate/matchUps/drawPositions/assignMatchUpDrawPosition';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { directWinner } from '@Mutate/matchUps/drawPositions/directWinner';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { findStructure } from '@Acquire/findStructure';
import { overlap } from '@Tools/arrays';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  projectExitStatusCodes,
  buildSideExitProvenance,
  mergeSideExitProvenance,
  getSideExitProvenance,
  producedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { DRAW_POSITION_ASSIGNED, MISSING_MATCHUP, MISSING_STRUCTURE } from '@Constants/errorConditionConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';

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
   * A loser matchUp that is ALREADY a BYE can still be owed one — and NOTHING is what it gets today.
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
   * So the semantic is right and making it the DEFAULT is a separate, larger piece of work. Behind
   * the policy the census is **0 closed, 0 opened, 0 changed** on all six arms.
   *
   * `assignDrawPositionBye` returns early on a position that already holds a BYE, so this is a no-op
   * wherever the slot is already settled.
   */
  const loserTargetStillOpen = !!(
    appliedPolicies?.progression?.doubleExitPropagateBye &&
    loserMatchUp?.matchUpStatus === BYE &&
    loserTargetDrawPosition !== undefined &&
    !getPositionAssignments({
      structureId: targetLinks?.loserTargetLink?.target?.structureId,
      drawDefinition,
    }).positionAssignments?.find((assignment: any) => assignment.drawPosition === loserTargetDrawPosition)
      ?.participantId
  );

  if (loserTargetStillOpen) {
    const result = advanceByeToLoserMatchUp({
      loserTargetLink: targetLinks?.loserTargetLink,
      loserTargetDrawPosition,
      tournamentRecord,
      drawDefinition,
      loserMatchUp,
      matchUpsMap,
      event,
    });
    if (result?.error) return decorateResult({ result, stack });
  }

  if (loserMatchUp && loserMatchUp.matchUpStatus !== BYE) {
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
  } else if (loserMatchUp && !loserTargetStillOpen && isExit(producedExitStatus(params.matchUpStatus))) {
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
  const propagateBye = appliedPolicies?.progression?.doubleExitPropagateBye;

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

  const { feedRound, drawPositions, matchUpId } = loserMatchUp;
  // Derives a side from drawPosition ORDER — valid only because drawPositions are stored ascending.
  // See the canonical statement in `getOrderedDrawPositions`.
  const walkoverWinningSide: number | undefined = feedRound ? 2 : 2 - drawPositions.indexOf(loserTargetDrawPosition);
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
}) {
  // THE TARGET POSITION MUST BE GENUINELY VACANT. A loser target drawPosition that already holds a
  // draw BYE is not an empty slot awaiting an arrival — it is SETTLED, and the BYE is its record.
  // Stamping an exit there says "this side came from a double walkover" about a side that came from
  // the draw, which is false. Measured 2026-09-20 on FIRST_MATCH_LOSER_CONSOLATION 8 with BOTH Main
  // first-round matchUps double-walked-over: `Consolation|2|1` drawPosition 1 IS a BYE, and without
  // this test it gained a WALKOVER origin that `byeMeetingAProducedExit` pins as a reserved slot.
  // A position holding a PARTICIPANT is likewise not ours — somebody already arrived there.
  const { positionAssignments } = getPositionAssignments({ structureId: loserMatchUp.structureId, drawDefinition });
  const targetAssignment = positionAssignments?.find(
    (assignment: any) => assignment.drawPosition === loserTargetDrawPosition,
  );
  if (targetAssignment?.bye || targetAssignment?.participantId) return { ...SUCCESS };

  const drawPositions = loserMatchUp.drawPositions ?? [];
  const positionIndex = drawPositions.indexOf(loserTargetDrawPosition);
  // `indexOf` as a side number — valid only because drawPositions are stored ascending.
  // See the canonical statement in `getOrderedDrawPositions`.
  const exitingSideNumber = loserMatchUp.feedRound ? 1 : positionIndex + 1;
  if (positionIndex === -1 || (exitingSideNumber !== 1 && exitingSideNumber !== 2)) {
    return { ...SUCCESS };
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
    matchUpStatusCodes: projectExitStatusCodes(provenance),
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
  return { ...SUCCESS };
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
    // `indexOf` as a side number — valid only because drawPositions are stored ascending.
    // See the canonical statement in `getOrderedDrawPositions`.
    const exitingSideNumber = (loserMatchUp.drawPositions ?? []).indexOf(loserTargetDrawPosition) + 1;
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
    const matchUpStatusCodes = projectExitStatusCodes(provenance);

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
    const refreshed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    const convergedTargets = positionTargets({
      matchUpId: loserMatchUp.matchUpId,
      inContextDrawMatchUps: refreshed,
      drawDefinition,
    });
    const convergedWinnerMatchUp = convergedTargets?.targetMatchUps?.winnerMatchUp;

    if (convergedWinnerMatchUp) {
      logAdvancement(stack, {
        color: 'cyan',
        decision: 'CONVERGED_advance_its_own_winner',
        from: loserMatchUp.matchUpId,
        to: convergedWinnerMatchUp.matchUpId,
      });
      const onward = conditionallyAdvanceDrawPosition({
        ...params,
        inContextDrawMatchUps: refreshed,
        matchUpId: convergedWinnerMatchUp.matchUpId,
        targetMatchUp: convergedWinnerMatchUp,
        sourceMatchUp: inContextLoserMatchUp(refreshed, loserMatchUp.matchUpId) ?? loserMatchUp,
        matchUpStatus: DOUBLE_EXIT,
        drawDefinition,
        matchUpsMap,
      });
      if (onward?.error) return onward;
    }

    return result;
  }

  return { ...SUCCESS };
}

/** the converged matchUp as the cascade now sees it — its status changed a moment ago */
function inContextLoserMatchUp(inContextDrawMatchUps: any[], matchUpId: string) {
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
      matchUpsMap,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  const drawPositions = noContextTargetMatchUp.drawPositions?.filter(Boolean) ?? [];

  const hasDrawPosition = drawPositions.length === 1;
  const walkoverWinningSide =
    params.walkoverWinningSide ||
    (hasDrawPosition &&
      getExitWinningSide({
        drawPosition: drawPositions[0],
        matchUpId: targetMatchUp.matchUpId,
        inContextDrawMatchUps,
      })) ||
    undefined;

  // assign the WALKOVER status to targetMatchUp
  const existingExit = isExit(noContextTargetMatchUp.matchUpStatus) && !drawPositions.length;

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
    (assignment: any) => assignment.bye && drawPositions.includes(assignment.drawPosition),
  );

  const producedStatus = existingExit ? DOUBLE_EXIT : EXIT;
  const matchUpStatus = targetHoldsBye ? BYE : producedStatus;

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
  const newProvenance = buildSideExitProvenance({
    pairedMatchUpId: pairedPreviousMatchUp?.matchUpId,
    sourceMatchUpId: sourceMatchUp?.matchUpId,
    pairedMatchUpStatus,
    sourceMatchUpStatus,
    sourceSideNumber,
  });

  // Provenance ACCUMULATES — one side's origin can arrive before the other's — so the union of what
  // the target already holds and what this write establishes is the record, and the legacy array is
  // its projection. `getSideExitProvenance` rather than the raw field so the union still finds an
  // earlier origin under LEGACY write mode, where nothing writes the native field.
  const provenance = {
    ...getSideExitProvenance({ matchUp: noContextTargetMatchUp }),
    ...newProvenance,
  };

  // A PROJECTION of provenance, replacing a second, independent derivation of the same facts. Where
  // this write establishes no provenance at all — `sourceSideNumber` unknown, so neither structure
  // can attribute anything — the array is blanked exactly as the previous builder blanked it, rather
  // than re-projecting state this write knows nothing about.
  const matchUpStatusCodes = newProvenance ? projectExitStatusCodes(provenance) : [];

  logAdvancement(stack, {
    color: 'brightgreen',
    keyColors: { matchUpStatus: 'brightcyan', winningSide: 'brightyellow' },
    action: 'modifyMatchUpScore',
    targetMatchUpId: noContextTargetMatchUp.matchUpId,
    matchUpStatus,
    winningSide: walkoverWinningSide,
    matchUpStatusCodes: JSON.stringify(matchUpStatusCodes),
    sourceStatus: sourceMatchUpStatus,
    pairedStatus: pairedMatchUpStatus,
  });

  const result = modifyMatchUpScore({
    ...params,
    winningSide: walkoverWinningSide,
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

  return advanceFromTarget({
    pairedPreviousMatchUpIsDoubleExit,
    targetMatchUpDrawPositions,
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

  if (nextWinnerMatchUpHasDrawPosition) {
    const nextDrawPositionToAdvance = nextWinnerMatchUpDrawPositions.find(Boolean);

    // WHICH SIDE THE ADVANCING POSITION OCCUPIES — not which side wins.
    const occupiedSide = getExitWinningSide({
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
    const winningSide = advancingParticipantId || !occupiedSide ? occupiedSide : 3 - occupiedSide;

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
    const exitingSideNumber = isExit(EXIT) && winningSide ? 3 - winningSide : undefined;
    const provenance = {
      ...getSideExitProvenance({ matchUp: noContextNextWinnerMatchUp }),
      ...buildCarriedExitProvenance({
        sourceMatchUpId: params.sourceMatchUp?.matchUpId,
        previousMatchUpStatus: params.matchUpStatus,
        matchUpStatus: params.matchUpStatus,
        exitingSideNumber,
      }),
    };

    const result = modifyMatchUpScore({
      matchUpStatusCodes: projectExitStatusCodes(provenance),
      appliedPolicies: params.appliedPolicies,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      matchUp: noContextNextWinnerMatchUp,
      matchUpStatus: EXIT,
      removeScore: true,
      context: stack,
      drawDefinition,
      winningSide,
    });
    if (result.error) return decorateResult({ result, stack });

    // stamped AFTER the state write, for the reason progressExitStatus states: a write that blanks
    // the codes the provenance describes clears the provenance with them (#4816).
    mergeSideExitProvenance({ matchUp: noContextNextWinnerMatchUp, provenance });

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
    return !isAnyExit(feeder.matchUpStatus) && feeder.matchUpStatus !== BYE;
  });
}

/**
 * Does this matchUp hold a draw BYE on one of its positions?
 *
 * Read from the positionAssignment, never from `matchUpStatus` — the same rule
 * `conditionallyAdvanceDrawPosition` and `removeDoubleExit.targetDrawPositionIsBye` follow, because
 * by the time a cascade reaches here the status may already have been overwritten.
 */
function matchUpHoldsBye({ drawDefinition, matchUp }) {
  const drawPositions = (matchUp?.drawPositions ?? []).filter(Boolean);
  if (!drawPositions.length) return false;
  const { positionAssignments } = getPositionAssignments({ structureId: matchUp.structureId, drawDefinition });
  return !!positionAssignments?.some(
    (assignment: any) => assignment.bye && drawPositions.includes(assignment.drawPosition),
  );
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
}: any) {
  // a matchUp is visited at most once, so a malformed winner-target cycle cannot spin here
  const seen = visited ?? new Set<string>();
  if (!fromMatchUp?.matchUpId || seen.has(fromMatchUp.matchUpId)) {
    return decorateResult({ result: { ...SUCCESS }, stack });
  }
  seen.add(fromMatchUp.matchUpId);

  const { targetMatchUps } = positionTargets({
    matchUpId: fromMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  const nextWinnerMatchUp = targetMatchUps?.winnerMatchUp;
  if (!nextWinnerMatchUp?.matchUpId) return decorateResult({ result: { ...SUCCESS }, stack });

  const arrivalSideNumber = getExitArrivalSideNumber({
    sourceMatchUp: fromMatchUp,
    inContextDrawMatchUps,
    nextWinnerMatchUp,
  });
  if (!arrivalSideNumber) return decorateResult({ result: { ...SUCCESS }, stack });

  // somebody genuinely got there, or two exits have met: either way this is not ours to write
  if (nextWinnerMatchUp.sides?.some((side) => side.participantId) || isAnyExit(nextWinnerMatchUp.matchUpStatus)) {
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
    matchUpStatusCodes: projectExitStatusCodes(provenance),
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
    winningSide: undefined,
    matchUpStatus: holdsBye ? BYE : EXIT,
    removeScore: true,
    context: stack,
    drawDefinition,
  });
  if (result.error) return decorateResult({ result, stack });

  // stamped AFTER the state write, for the reason progressExitStatus states: a write that blanks
  // the codes the provenance describes clears the provenance with them (#4816).
  mergeSideExitProvenance({ matchUp: noContextNextWinnerMatchUp, provenance });

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
