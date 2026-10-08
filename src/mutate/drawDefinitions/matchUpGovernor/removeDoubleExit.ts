import { removeDirectedBye, removeDirectedWinner } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { propagatesByeOnDoubleExit } from '@Mutate/matchUps/drawPositions/propagatesByeOnDoubleExit';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findStructure } from '@Acquire/findStructure';
import { intersection, overlap } from '@Tools/arrays';
import {
  getDrawPositionSideNumber,
  getSideDrawPosition,
  getWinningSideDrawPosition,
} from '@Query/matchUps/getDrawPositionSides';
import {
  withdrawByeClaimsFrom,
  byeClaimSurvives,
  withdrawByeClaim,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import {
  deriveExitStateFromProvenance,
  getSideExitProvenance,
  carriedExitStatus,
  retainForeignProvenance,
  retainPolicyCodes,
  setSideExitProvenance,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, MatchUp, MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import {
  BYE,
  completedMatchUpStatuses,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

const keyColors = {
  drawPositionToRemove: 'green',
  iteration: 'brightred',
  winner: 'green',
  loser: 'brightred',
};

export function removeDoubleExit(params) {
  const { inContextDrawMatchUps, appliedPolicies, drawDefinition, matchUpsMap, targetData, matchUp } = params;
  const { matchUpId } = matchUp;

  let { iteration = 0 } = params;
  iteration += 1;

  const stack = 'removeDoubleExit';

  // WHOSE RESULT IS GOING AWAY. The unwind cascades, so by the time it reaches a convergence target
  // several upstream results may have been taken back, and a target can hold an origin from an
  // upstream this cascade has NOT touched. That origin is still true. Accumulating the ids down the
  // recursion is what lets the reset below ask the identity question `withdrawProducedExits` asks —
  // "did THIS source produce it" — rather than blanking the field wholesale.
  const withdrawnSourceIds: Set<string> = params.withdrawnSourceIds ?? new Set<string>();
  if (matchUpId) withdrawnSourceIds.add(matchUpId);
  Object.assign(params, { withdrawnSourceIds });

  pushGlobalLog({
    color: 'brightyellow',
    method: stack,
    matchUpId,
    iteration,
    keyColors,
  });

  const {
    targetMatchUps: { loserMatchUp, winnerMatchUp, loserTargetDrawPosition },
    targetLinks: { loserTargetLink },
  } = targetData;

  // A BYE WINNER TARGET IS VISITED, and that is new. It used to be skipped outright, which was
  // sound only while the forward cascade never wrote to it. It does now: a converged double exit
  // records its produced exit on the BYE matchUp's own side. Skipping the target on the way back
  // left those codes standing, and `DO_UNDO_IDENTITY` reported the residue on 12 cells across four
  // draw types — the matchUp correctly still `BYE`, its drawPositions untouched, and
  // `matchUpStatusCodes` holding an exit the clear had just withdrawn.
  //
  // Visiting it does NOT change its status: `getUnwoundState` returns `BYE` for a BYE-held matchUp
  // before it considers anything else, so the visit only withdraws what this cascade wrote.
  if (winnerMatchUp) {
    const { stage, roundNumber, roundPosition, structureName } = winnerMatchUp;
    pushGlobalLog({
      winner: 'winner',
      roundPosition,
      structureName,
      roundNumber,
      keyColors,
      stage,
    });
    // and its result is READ: a failed write on the winner target used to be walked past, the
    // loser target visited anyway, and the caller told the unwind succeeded
    // (`cascadeWriteErrorsReachTheCaller.test.ts`, 2026-10-01)
    const winnerResult = conditionallyRemoveDrawPosition({
      ...params,
      targetMatchUp: winnerMatchUp,
      sourceMatchUp: matchUp,
      iteration,
    });
    if (winnerResult?.error) return decorateResult({ result: winnerResult, stack });
  }

  // Did this cascade place the BYE that is sitting on the loserMatchUp?
  //
  // `assignDrawPositionBye` records the answer on the positionAssignment as `byeFromPropagation`, and
  // that record is authoritative — including when it is absent, which is the case the previous
  // inference could not express.
  //
  // What it replaced:
  //     loserMatchUp?.matchUpStatus === BYE && (loserMatchUp?.feedRound || loserMatchUp?.roundNumber === 1)
  //
  // "it is a BYE and it sits on a feed round or in round 1, therefore I placed it" — a structural
  // proxy of exactly the kind that produced #4778. It cannot distinguish a BYE this cascade
  // created from one that was already there, so unwinding over-cleared: an FMLC consolation BYE
  // placed by `propagateConsolationBye` (which fires when the first-round matchUps completed
  // NORMALLY) satisfies it and was claimed.
  //
  // A draw persisted before `byeFromPropagation` existed carries no marker, so unwinding a double
  // exit in one will not remove the BYEs its cascade placed. That is a DECISION, not an oversight:
  // no backfill is being pursued on pre-existing tournaments/events/draws/structures. Behaviour is
  // correct for anything this engine touches and inert for stored draws that predate it.
  const byeProvenance = findPropagatedBye({ drawDefinition, loserMatchUp, loserTargetDrawPosition });

  const byePropagatedToLoserMatchUp = loserMatchUp?.matchUpStatus === BYE && !!byeProvenance;

  /**
   * This cascade is being unwound, so its own BYE claim goes — on EVERY path.
   *
   * Withdrawal used to sit inside the branch that removes the BYE, so the branch handling a loser
   * target that already holds a draw BYE (visited "to WITHDRAW, and only that") left the claim
   * behind. A ledger written on every attempt and withdrawn on only some paths accumulates claims
   * describing nothing, and a stale claim reads as a live one — which would make the retain test
   * answer "another cascade still owes this" forever.
   */
  const rawLoserMatchUp = (matchUpsMap?.drawMatchUps ?? []).find(
    (candidate) => candidate.matchUpId === loserMatchUp?.matchUpId,
  );
  // the claim's side, read structurally: a lone position's side is not its index
  const claimSideNumber =
    getDrawPositionSideNumber({
      matchUp: rawLoserMatchUp && { ...rawLoserMatchUp, sides: undefined },
      structureId: loserMatchUp?.structureId,
      drawPosition: loserTargetDrawPosition,
      drawDefinition,
    }) || 1;
  withdrawByeClaim({ matchUp: rawLoserMatchUp, sideNumber: claimSideNumber, claimantMatchUpId: matchUpId });
  // ...and wherever else this cascade claimed one: a BYE that WALKS is claimed on a downstream
  // matchUp the unwind never revisits at this coordinate
  withdrawByeClaimsFrom({ matchUps: matchUpsMap?.drawMatchUps, claimantMatchUpId: matchUpId });

  /**
   * THE FMLC "PAIRED ROUND-1 DOUBLE EXIT" TEST THAT STOOD HERE IS GONE. It asked whether the BYE on
   * the loser target had been propagated by two double exits by pairing the source's roundPosition
   * with the ROUND-1 matchUps of its structure — a topological proxy for the question the
   * `byeClaims` ledger below answers by record. For a round-2 source it collected no matchUps at
   * all, and `[].every(...)` is `true`, so it returned SUCCESS having withdrawn nothing.
   *
   * Measured 2026-09-30 by CA in TMX on FIRST_MATCH_LOSER_CONSOLATION 8/5: `Main|2|1` a
   * DOUBLE_WALKOVER, its BYE propagated to Consolation drawPosition 1 and on into the consolation
   * final; removing the double walkover left both in place. *"the BYE propagated to dp1 /
   * CONSOLATION|2|1 should have been withdrawn as well as its advance to the consolation final and
   * Marshall Yeats should have been left as the sole participant in a TO_BE_PLAYED matchUp."*
   */
  if (loserMatchUp && (loserMatchUp.matchUpStatus !== BYE || byePropagatedToLoserMatchUp)) {
    const inContextLoserMatchUp = inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    const { structure: loserStructure } = findStructure({
      drawDefinition,
      structureId: inContextLoserMatchUp.structureId,
    });
    const { stage, roundNumber, roundPosition, feedRound, structureName } = loserMatchUp;
    pushGlobalLog({
      loser: 'loser',
      roundPosition,
      structureName,
      roundNumber,
      keyColors,
      feedRound,
      stage,
    });

    /**
     * A BYE survives while ANOTHER live cascade still claims it.
     *
     * The unwind removes the BYE at ITS OWN loser target without asking who put it there. Two double
     * exits can claim the same drawPosition — measured in COMPASS, CURTIS_CONSOLATION, OLYMPIC,
     * DOUBLE_ELIMINATION and MODIFIED_FEED_IN_CHAMPIONSHIP, where the disputed BYE has exactly two
     * claimants and exactly one survives — so correcting one destroyed a BYE the other still owed,
     * and a matchUp that should read BYE read TO_BE_PLAYED against an opponent who can never arrive.
     *
     * The ledger is consulted rather than the topology. An earlier attempt generalised the
     * FMLC-shaped "is the paired round-1 matchUp also a double exit" test to every draw type; it
     * reached the same count but OVER-RETAINED, because round-1 pairing is not how a backdraw feeds
     * and it cannot see a claimant that is a cascade continuation.
     */
    const anotherClaimSurvives = byeClaimSurvives({
      isStillDoubleExit: (claimantMatchUpId) =>
        isDoubleExit(inContextDrawMatchUps.find(({ matchUpId: id }) => id === claimantMatchUpId)?.matchUpStatus),
      matchUp: rawLoserMatchUp,
      sideNumber: claimSideNumber,
      withdrawnSourceIds,
    });
    if (anotherClaimSurvives) {
      return decorateResult({ result: { ...SUCCESS }, stack });
    }

    if (propagatesByeOnDoubleExit(appliedPolicies) || byePropagatedToLoserMatchUp) {
      removeDirectedBye({
        drawPosition: loserTargetDrawPosition,
        targetLink: loserTargetLink,
        inContextDrawMatchUps,
        drawDefinition,
        matchUpsMap,
      });
    } else {
      const result = conditionallyRemoveDrawPosition({
        ...params,
        targetMatchUp: loserMatchUp,
        structure: loserStructure,
        iteration,
      });
      if (result.error) return decorateResult({ result, stack });
    }
  } else if (loserMatchUp?.matchUpStatus === BYE) {
    /**
     * A LOSER TARGET THAT HOLDS A DRAW BYE IS VISITED TOO — to WITHDRAW, and only that.
     *
     * The guard above is the unwind's half of the symmetry `doubleExitAdvancement` had on the
     * forward path: a loser target already reading `BYE` was skipped, which was sound only while
     * nothing wrote to it. Something does now — the produced exit is recorded on the drawPosition
     * the loser link named, and carried onward through however many BYEs stand between it and a
     * matchUp that can hold it. Skipping the target on the way back left all of that standing.
     *
     * CA, 2026-09-20: *"When I remove it the consolation R1P1 matchUpStatusCodes don't clear and
     * the WALKOVER remains advanced to consolation R3P1."* Measured on
     * FIRST_MATCH_LOSER_CONSOLATION 8: THREE consolation matchUps kept residue, not one —
     * `CONSOLATION|1|1`, `CONSOLATION|2|1` and `CONSOLATION|3|1`.
     *
     * `conditionallyRemoveDrawPosition` is deliberately NOT used here, and that is the whole reason
     * this is a separate path. It would compute a `drawPositionToRemove` by intersecting the
     * target's drawPositions with the next winner's — drawPosition 4 in the scenario above — and
     * take it back out. But dp4 reached `CONSOLATION|2|1` through the DRAW's own BYE cascade at
     * generation time, long before the double walkover; removing it would unpick a placement this
     * cascade never made. Nothing was advanced here, so nothing is un-advanced: only the record of
     * the exit comes back out.
     */
    const result = withdrawExitFromByeChain({
      fromMatchUp: loserMatchUp,
      inContextDrawMatchUps,
      withdrawnSourceIds,
      drawDefinition,
      matchUpsMap,
      stack,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

/** Does this matchUp carry an origin written by one of the results being taken back? */
function carriesWithdrawnOrigin(matchUp, withdrawnSourceIds: Set<string>): boolean {
  const provenance = getSideExitProvenance({ matchUp });
  if (!provenance) return false;
  return [1, 2].some((sideNumber) => {
    const sourceMatchUpId = provenance[sideNumber]?.sourceMatchUpId;
    return !!sourceMatchUpId && withdrawnSourceIds.has(sourceMatchUpId);
  });
}

/**
 * Take back an exit that was carried through BYE-held matchUps, following the same chain out.
 *
 * The mirror of `doubleExitAdvancement`'s `carryExitOnward`, and it exists for the reason that file
 * says: forward and unwind must walk the same ground or a do/undo leaves residue. It withdraws by
 * IDENTITY — an origin whose `sourceMatchUpId` is not among the results being taken back is still
 * true and stays — so a matchUp carrying nothing from this cascade is left untouched, and that is
 * also what ends the walk.
 *
 * `getUnwoundState` decides each matchUp's new state, rather than a second derivation of those
 * rules living here: it already returns `BYE` for a BYE-held matchUp before considering anything
 * else, and `TO_BE_PLAYED` for one whose last origin has just been withdrawn.
 */
function withdrawExitFromByeChain({
  inContextDrawMatchUps,
  withdrawnSourceIds,
  drawDefinition,
  matchUpsMap,
  fromMatchUp,
  visited,
  stack,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  withdrawnSourceIds: Set<string>;
  drawDefinition: DrawDefinition;
  fromMatchUp: HydratedMatchUp;
  matchUpsMap: MatchUpsMap;
  visited?: Set<string>;
  stack: string;
}): ResultType {
  const seen: Set<string> = visited ?? new Set<string>();
  if (!fromMatchUp?.matchUpId || seen.has(fromMatchUp.matchUpId)) return { ...SUCCESS };
  seen.add(fromMatchUp.matchUpId);

  const noContextTargetMatchUp = matchUpsMap?.drawMatchUps.find(
    (candidate) => candidate.matchUpId === fromMatchUp.matchUpId,
  );
  // nothing of this cascade's here, so there is nothing to take back and nowhere further to go
  if (!noContextTargetMatchUp || !carriesWithdrawnOrigin(noContextTargetMatchUp, withdrawnSourceIds)) {
    return { ...SUCCESS };
  }

  /**
   * The drawPosition this matchUp ADVANCED, captured before the reset blanks it.
   *
   * Read structurally: a lone position's side is not its index (`documentation/docs/concepts/draw-positions.md`).
   */
  const advancedDrawPosition = getWinningSideDrawPosition({
    matchUp: { ...noContextTargetMatchUp, sides: undefined },
    structureId: fromMatchUp.structureId,
    drawDefinition,
  });

  const unwound = getUnwoundState({
    pairedPreviousDoubleExit: false,
    noContextTargetMatchUp,
    targetMatchUp: fromMatchUp,
    inContextDrawMatchUps,
    withdrawnSourceIds,
    drawDefinition,
  });

  pushGlobalLog({
    method: 'withdrawExitFromByeChain',
    color: 'brightcyan',
    matchUpId: fromMatchUp.matchUpId,
    structureName: fromMatchUp.structureName,
    unwoundStatus: unwound.matchUpStatus,
    keyColors,
  });

  const result = modifyMatchUpScore({
    matchUpStatusCodes: codesForUnwound(noContextTargetMatchUp, unwound),
    removeWinningSide: unwound.winningSide === undefined,
    matchUpStatus: unwound.matchUpStatus,
    matchUpId: fromMatchUp.matchUpId,
    matchUp: noContextTargetMatchUp,
    winningSide: unwound.winningSide,
    context: 'withdrawExitFromByeChain',
    removeScore: true,
    drawDefinition,
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
      sets: undefined,
    },
  });
  if (result.error) return decorateResult({ result, stack });

  // the write goes through the `toBePlayed` fixture, which blanks `sideExitProvenance` and then
  // restores what the matchUp HELD — including the entry just withdrawn — so the retained subset is
  // stamped explicitly rather than inferred from what survived. Same reason as
  // `conditionallyRemoveDrawPosition`'s own stamp.
  setSideExitProvenance({ provenance: unwound.provenance, matchUp: noContextTargetMatchUp });

  const fromTargets = positionTargets({
    matchUpId: fromMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (fromTargets.error) return decorateResult({ result: fromTargets, stack });
  const nextWinnerMatchUp = fromTargets.targetMatchUps?.winnerMatchUp;
  if (!nextWinnerMatchUp?.matchUpId) return { ...SUCCESS };

  /**
   * TAKE BACK WHAT THIS MATCHUP ADVANCED, or the withdrawal leaves somebody a round ahead of a
   * result that no longer exists.
   *
   * The recursion below cannot do it: it opens on `carriesWithdrawnOrigin`, and the NEXT matchUp
   * carries no provenance of its own — it merely HOLDS the participant this one advanced. So the walk
   * stopped here, the winner was cleared, and the participant stayed in the later round.
   *
   * Measured on COMPASS 16/14 (CA, 2026-09-25): clearing `East|1|2` reset `West|2|1` correctly and
   * left `West|3|1` holding `drawPositions: [3]` and its occupant, with `getDrawInconsistencies`
   * still reporting `valid: true`. Clearing `West|2|1` DIRECTLY unwinds correctly, which is what
   * localised the gap to this path.
   *
   * Same-structure only. Across a link the take-back must be resolved by IDENTITY rather than by
   * drawPosition number — `removeLinkedWinner` exists for exactly that, and intersecting positions
   * across a link is the defect its docblock records (census seed 9100555).
   */
  if (advancedDrawPosition && nextWinnerMatchUp.structureId === fromMatchUp.structureId) {
    pushGlobalLog({
      method: 'withdrawExitFromByeChain',
      decision: 'take_back_advanced_winner',
      nextWinnerMatchUpId: nextWinnerMatchUp.matchUpId,
      advancedDrawPosition,
      color: 'brightcyan',
      keyColors,
    });
    removeDirectedWinner({
      winningDrawPosition: advancedDrawPosition,
      winnerMatchUp: nextWinnerMatchUp,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
    });
  }

  return withdrawExitFromByeChain({
    fromMatchUp: nextWinnerMatchUp,
    inContextDrawMatchUps,
    withdrawnSourceIds,
    drawDefinition,
    matchUpsMap,
    visited: seen,
    stack,
  });
}

export function conditionallyRemoveDrawPosition(params) {
  const {
    withdrawnSourceIds = new Set<string>(),
    inContextDrawMatchUps,
    appliedPolicies,
    drawDefinition,
    sourceMatchUp,
    targetMatchUp,
    matchUpsMap,
    structure,
    iteration,
  } = params;

  const stack = 'conditionallyRemoveDrawPosition';
  pushGlobalLog({ method: stack, structureName: structure?.structureName, iteration });

  // only handles winnerMatchUps in the same structure
  const nextTargetData = positionTargets({
    matchUpId: targetMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  if (nextTargetData.error) return decorateResult({ result: nextTargetData, stack });

  const {
    targetMatchUps: { winnerMatchUp: nextWinnerMatchUp },
  } = nextTargetData;

  const noContextTargetMatchUp = matchUpsMap?.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === targetMatchUp.matchUpId,
  );

  let pairedPreviousDoubleExit;
  let pairedPreviousMatchUp;
  let drawPositionToRemove;

  // targetMatchUp has context
  if (targetMatchUp.feedRound) {
    /**
     * `drawPositions` is OPTIONAL on a matchUp, and a feed round is where it is most often absent.
     *
     * This branch asks "which of the next winner's positions does the target already hold?", and a
     * matchUp holding none holds none of them — `undefined`, which is exactly what
     * `drawPositionToRemove` means everywhere it is read: the single consumer below is
     * `if (nextWinnerMatchUp && drawPositionToRemove)`. So the guard changes no behaviour; it only
     * stops the read from throwing.
     *
     * Reached on DOUBLE_ELIMINATION: the Main final is a feed round that holds nobody until both
     * sides arrive, and `removeDoubleExit` recurses onto it while unwinding
     * (`conditionallyRemoveDrawPosition` <-> `removeDoubleExit`, measured at iteration 3). Without
     * the guard this is a `TypeError: Cannot read properties of undefined (reading 'includes')`
     * rather than a refusal — 300 shapes in the propagateExitStatus:false population of the 480k
     * sweep, and it holds that population's 3-step minimum reproduction.
     *
     * The two sibling branches immediately below already guard the same property on the same object
     * (`targetMatchUp?.drawPositions ?? []` and `targetMatchUp.drawPositions?.filter(Boolean)`).
     * This one was the outlier.
     */
    const nextWinnerDrawPositions = nextWinnerMatchUp?.drawPositions?.filter(Boolean);
    drawPositionToRemove = nextWinnerDrawPositions?.find((drawPosition) =>
      targetMatchUp.drawPositions?.includes(drawPosition),
    );
  } else if (sourceMatchUp == null) {
    drawPositionToRemove = intersection(
      targetMatchUp?.drawPositions ?? [],
      nextWinnerMatchUp?.drawPositions ?? [],
    )?.[0];
  } else {
    pairedPreviousMatchUp = getPairedPreviousMatchUp({
      structureId: structure.structureId,
      matchUp: sourceMatchUp,
      matchUpsMap,
    })?.pairedPreviousMatchUp;

    pairedPreviousDoubleExit = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(pairedPreviousMatchUp?.matchUpStatus);

    let pairedPreviousDrawPositions = pairedPreviousMatchUp?.drawPositions?.filter(Boolean) ?? [];

    const pairedPreviousMatchUpComplete =
      [...completedMatchUpStatuses, BYE].includes(pairedPreviousMatchUp?.matchUpStatus) ||
      pairedPreviousMatchUp?.winningSide;

    if (pairedPreviousMatchUpComplete) {
      const sourceDrawPositions = sourceMatchUp.drawPositions ?? [];
      let targetDrawPositions = targetMatchUp.drawPositions?.filter(Boolean);
      if (overlap(sourceDrawPositions, targetDrawPositions)) {
        targetDrawPositions = targetDrawPositions?.filter(
          (drawPosition) => !sourceDrawPositions.includes(drawPosition),
        );
      }

      const possibleBranchDrawPositions = sourceDrawPositions.concat(pairedPreviousDrawPositions);
      drawPositionToRemove = possibleBranchDrawPositions.find((drawPosition) =>
        targetDrawPositions?.includes(drawPosition),
      );
    }
  }

  if (nextWinnerMatchUp && nextWinnerMatchUp.structureId !== targetMatchUp.structureId) {
    removeLinkedWinner({
      winnerTargetLink: nextTargetData.targetLinks?.winnerTargetLink,
      inContextDrawMatchUps,
      nextWinnerMatchUp,
      drawDefinition,
      targetMatchUp,
      matchUpsMap,
    });
  } else if (nextWinnerMatchUp && drawPositionToRemove) {
    const { stage, roundNumber, roundPosition, structureName } = nextWinnerMatchUp;
    pushGlobalLog({
      method: 'removeDirectedWinner',
      drawPositionToRemove,
      color: 'brightgreen',
      roundPosition,
      structureName,
      roundNumber,
      keyColors,
      stage,
    });
    removeDirectedWinner({
      winningDrawPosition: drawPositionToRemove,
      winnerMatchUp: nextWinnerMatchUp,
      inContextDrawMatchUps,
      drawDefinition,
      matchUpsMap,
    });
  }

  // The recursion continues FROM `targetMatchUp`, so it carries targetMatchUp's structure — not the
  // one this call was given, which is the SOURCE's. They differ whenever the unwind has crossed a
  // link, and `getPairedPreviousMatchUp` below then looked up a Main roundPosition in the Backdraw.
  const { structure: targetStructure } = findStructure({ drawDefinition, structureId: targetMatchUp.structureId });
  let result = removeDoubleExit({
    structure: targetStructure ?? structure,
    targetData: nextTargetData,
    matchUp: targetMatchUp,
    inContextDrawMatchUps,
    withdrawnSourceIds,
    appliedPolicies,
    drawDefinition,
    matchUpsMap,
    iteration,
  });
  if (result.error) return decorateResult({ result, stack });

  /**
   * NOTHING OF THIS CASCADE'S IS HERE, SO NOTHING OF THIS CASCADE'S COMES OUT.
   *
   * A matchUp whose provenance names only origins this clear is NOT withdrawing is an exit produced
   * by something still standing. Resetting it destroys a record that is still true, and the reset
   * below is unconditional: `getUnwoundState`'s final fallthrough returns `TO_BE_PLAYED` and drops
   * `retained` on the floor.
   *
   * CA, 2026-09-20, reading the reproduction: *"when the [...] DOUBLE_WALKOVER is removed the
   * provenance of the sideNumber: 1 matchUpStatus: WALKOVER is lost... that's the bug."*
   *
   * Measured on FIRST_MATCH_LOSER_CONSOLATION 8/8 (`nonRandom: 61`), clearing `Consolation|1|2`:
   *
   *     Consolation|3|1  before  WALKOVER      prov {1: … sourceMatchUpId: Consolation|1|1}
   *                      after   TO_BE_PLAYED  prov null
   *
   * `Consolation|1|1` is a DOUBLE_WALKOVER that this clear never touches. Its exit is still true and
   * still produced that walkover.
   *
   * THE ENGINE ALREADY CONTRADICTS ITSELF HERE, which is what makes the identity test the right
   * spelling rather than a new idea: in the same run `Consolation|2|2` KEEPS an entry from the very
   * same origin, because the BYE branch above retains by identity. One branch withdraws by identity
   * and the other blanks wholesale.
   *
   * This does NOT loosen the restriction the fallthrough exists for. That one is about entries the
   * SAME cascade wrote — `buildSideExitProvenance` stamps a convergence as a PAIR, so withdrawing
   * one side leaves a sibling that was written by the withdrawal rather than before it (measured: 10
   * cells across three draw types). Such a matchUp always carries at least one withdrawn entry, so
   * it fails the test below and reaches `getUnwoundState` exactly as before.
   */
  const carriesSomethingOfThisCascade = carriesWithdrawnOrigin(noContextTargetMatchUp, withdrawnSourceIds);
  const holdsProvenance = !!getSideExitProvenance({ matchUp: noContextTargetMatchUp });
  if (holdsProvenance && !carriesSomethingOfThisCascade) {
    pushGlobalLog({
      method: stack,
      color: 'brightyellow',
      decision: 'RETAIN_untouched_origin',
      matchUpId: targetMatchUp.matchUpId,
      keyColors,
    });
    return { ...SUCCESS };
  }

  const unwound = getUnwoundState({
    pairedPreviousDoubleExit,
    noContextTargetMatchUp,
    inContextDrawMatchUps,
    withdrawnSourceIds,
    drawDefinition,
    targetMatchUp,
  });

  const removeScore = !pairedPreviousDoubleExit;
  result = modifyMatchUpScore({
    ...params,
    matchUpStatusCodes: codesForUnwound(noContextTargetMatchUp, unwound),
    removeWinningSide: unwound.winningSide === undefined,
    matchUpId: targetMatchUp.matchUpId,
    matchUp: noContextTargetMatchUp,
    matchUpStatus: unwound.matchUpStatus,
    winningSide: unwound.winningSide,
    context: stack,
    removeScore,
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
      sets: undefined,
    },
  });

  if (result.error) return decorateResult({ result, stack });

  // The write above goes through the `toBePlayed` fixture, which blanks `sideExitProvenance`. Its
  // `survivingProvenance` rescue puts back what the matchUp HELD, which still includes the entry
  // this unwind has just withdrawn — so the retained subset is stamped explicitly rather than
  // inferred from what survived the reset.
  if (unwound.provenance) setSideExitProvenance({ provenance: unwound.provenance, matchUp: noContextTargetMatchUp });

  return { ...SUCCESS };
}

/**
 * Does a drawPosition of this matchUp carry a BYE assignment?
 *
 * The positionAssignment is the DURABLE record; the matchUp's own `matchUpStatus` is not, because
 * by the time the unwind reaches here the cascade has already overwritten a BYE matchUp with the
 * exit it propagated (measured: `BYE` -> `WALKOVER` on apply). Asking the status therefore asks a
 * field the cascade has clobbered, while the assignment still says `bye: true`.
 *
 * This is the same rule `advanceWinner` applies when it places a matchUp:
 * `drawPositionIsBye || pairedDrawPositionIsBye ? BYE : TO_BE_PLAYED`.
 */
function targetDrawPositionIsBye({ drawDefinition, noContextTargetMatchUp, targetMatchUp }): boolean {
  const drawPositions = noContextTargetMatchUp?.drawPositions?.filter(Boolean) ?? [];
  // structureId comes from the IN-CONTEXT matchUp: a no-context matchUp does not carry one, and
  // reading it there silently yields undefined -> no structure -> a false negative.
  const structureId = targetMatchUp?.structureId;
  if (!drawPositions.length || !structureId) return false;

  const { structure: targetStructure } = findStructure({ drawDefinition, structureId });
  return !!positionAssignmentsOf(targetStructure)?.some(
    (assignment) => drawPositions.includes(assignment.drawPosition) && assignment.bye,
  );
}

/**
 * Take back the participant `targetMatchUp` advanced ACROSS A LINK into `nextWinnerMatchUp`.
 *
 * The same-structure branch of `conditionallyRemoveDrawPosition` finds that participant by
 * intersecting the two matchUps' drawPositions. That is only meaningful inside one structure: a
 * drawPosition is a number in ONE structure, and DOUBLE_ELIMINATION's Backdraw numbers from 1 as Main
 * does. Intersected across `Backdraw r4 --WINNER--> Main r4` it matched Backdraw 1 — a BYE — with
 * Main 1, the Main-draw winner, and removed the Main-draw winner from the Main final while unwinding
 * a Backdraw double walkover that had advanced nobody (census seed 9100555, WINNER_NOT_ADVANCED).
 *
 * Across a link the question is asked of IDENTITY: which participant assigned in targetMatchUp's
 * structure is also assigned in nextWinnerMatchUp's? `removeDirectedWinner` is then given the link,
 * so it locates them by their own position in the target structure.
 */
function removeLinkedWinner({
  inContextDrawMatchUps,
  nextWinnerMatchUp,
  winnerTargetLink,
  drawDefinition,
  targetMatchUp,
  matchUpsMap,
}) {
  if (!winnerTargetLink) return;
  const participantsIn = (matchUp) => {
    const { structure } = findStructure({ drawDefinition, structureId: matchUp.structureId });
    const positions = (matchUp.drawPositions ?? []).filter(Boolean);
    return (positionAssignmentsOf(structure) ?? [])
      .filter((assignment) => assignment.participantId && positions.includes(assignment.drawPosition))
      .map(({ participantId, drawPosition }) => ({ participantId, drawPosition }));
  };
  const nextParticipantIds = participantsIn(nextWinnerMatchUp).map(({ participantId }) => participantId);
  const advanced = participantsIn(targetMatchUp).find(({ participantId }) =>
    nextParticipantIds.includes(participantId),
  );
  if (!advanced) return;

  removeDirectedWinner({
    winningDrawPosition: advanced.drawPosition,
    winnerParticipantId: advanced.participantId,
    winnerMatchUp: nextWinnerMatchUp,
    inContextDrawMatchUps,
    winnerTargetLink,
    drawDefinition,
    matchUpsMap,
  });
}

/**
 * The state a matchUp must hold once this cascade has taken its origin back.
 *
 * Ordered, and the order is the whole content of the function:
 *
 *  1. **BYE wins outright.** A BYE-held drawPosition reverts to `BYE` whatever provenance survives —
 *     an attempt at this fix that tested provenance first turned a `BYE` into a `WALKOVER`, which
 *     `doubleExitUnwindRestoresBye` pins. The status field cannot answer "was this a BYE?" because
 *     the cascade being unwound has already overwritten it (measured: `BYE` -> `WALKOVER` on apply),
 *     so the durable `positionAssignment` is asked instead.
 *  2. **A still-live paired double exit keeps its produced exit** — unchanged, and checked before the
 *     assignment test because a BYE-held drawPosition legitimately carries a propagated exit while
 *     one is outstanding (measured: a Consolation matchUp reads `DEFAULTED` on a BYE drawPosition
 *     mid-cascade, and must stay that way).
 *  3. **RE-DERIVE from the origins that REMAIN.** This is the change. A convergence target can hold
 *     an origin carried by a DIFFERENT feeder, and that origin is still true; resetting the matchUp
 *     wholesale destroyed it, so a re-score of one feeder silently deleted the other feeder's fact
 *     and left an exit awarded to a slot nobody can fill. What remains is decided by IDENTITY —
 *     `sourceMatchUpId` against the ids this cascade has withdrawn — never by how the entry looks,
 *     and it is read from the NATIVE field alone, because the legacy array is deliberately not
 *     rewritten by a withdrawal and would answer "an origin survived" for a matchUp with none.
 *  4. **Nothing derived remains** — the matchUp reverts, exactly as before.
 *
 * Returns `provenance` only in case 3, and the caller writes it back: what survives the reset
 * downstream is what the matchUp HELD, which still includes the entry being withdrawn.
 */
function getUnwoundState({
  pairedPreviousDoubleExit,
  noContextTargetMatchUp,
  inContextDrawMatchUps,
  withdrawnSourceIds,
  drawDefinition,
  targetMatchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  pairedPreviousDoubleExit: boolean;
  withdrawnSourceIds: Set<string>;
  drawDefinition: DrawDefinition;
  targetMatchUp: HydratedMatchUp;
  noContextTargetMatchUp: MatchUp;
}): { matchUpStatus: MatchUpStatusUnion; winningSide?: number; provenance?: SideExitProvenance } {
  // A BYE STAYS A BYE — the status is never re-derived — but the codes are. The cascade records a
  // produced exit on a BYE matchUp's side, and an unwind that left the status alone AND the codes
  // alone would keep an exit that no longer exists. Retaining by source identity is what keeps the
  // BYE's OWN origin (`{ previousMatchUpStatus: BYE, matchUpStatus: BYE }`, written by the bye
  // propagation, not by this cascade) while dropping the withdrawn one.
  if (noContextTargetMatchUp.matchUpStatus === BYE) {
    return {
      matchUpStatus: BYE,
      provenance: retainForeignProvenance(
        getSideExitProvenance({ matchUp: noContextTargetMatchUp }),
        withdrawnSourceIds,
      ),
    };
  }
  const retained = retainForeignProvenance(
    getSideExitProvenance({ matchUp: noContextTargetMatchUp }),
    withdrawnSourceIds,
  );
  if (pairedPreviousDoubleExit) {
    // The STATUS here is unchanged — a still-live paired double exit keeps its produced exit — but
    // the provenance that describes it is carried through rather than blanked. Writing
    // `matchUpStatusCodes: []` onto a matchUp that is still an exit is the residue CA ruled on
    // 2026-09-09: "RE-DERIVE the codes on unwind from the current upstream state instead of writing
    // []". See `knownFailures.ts`, DOUBLE_EXIT_STATUS_CODES_RESIDUE.
    const status = noContextTargetMatchUp.matchUpStatus;
    return {
      matchUpStatus: status === DOUBLE_DEFAULT || status === DEFAULTED ? DEFAULTED : WALKOVER,
      provenance: retained,
    };
  }
  if (targetDrawPositionIsBye({ drawDefinition, noContextTargetMatchUp, targetMatchUp })) {
    return {
      matchUpStatus: BYE,
      provenance: retainForeignProvenance(
        getSideExitProvenance({ matchUp: noContextTargetMatchUp }),
        withdrawnSourceIds,
      ),
    };
  }

  // ONLY a matchUp being reset FROM a double exit can have an origin left standing, and that
  // restriction is load-bearing rather than cautious.
  //
  // A double exit is the one shape in which TWO origins are simultaneously true, so it is the only
  // shape where withdrawing one of them leaves one behind. Everywhere else, provenance on the
  // matchUp names origins the SAME cascade has just written: `buildSideExitProvenance` stamps a
  // convergence as a pair, source and paired-previous together, and it does so when the convergence
  // forms — which can be long after the paired-previous matchUp itself became an exit. Measured on
  // MODIFIED_FEED_IN_CHAMPIONSHIP 8/8: applying a DOUBLE_WALKOVER at `Consolation|1|2` stamps
  // `Consolation|2|2` on BOTH sides, one of them naming a `Consolation|1|1` that had been a double
  // exit since before the apply. That entry is not older than the withdrawal — it was written by it
  // — and retaining it turned an undecided matchUp into a `WALKOVER` on the CLEAR, in 10 cells
  // across three draw types.
  //
  // The paired-previous relation itself cannot separate the two cases: in the reproduction this
  // change exists for, the surviving origin's source IS the paired previous of the withdrawn
  // matchUp. What separates them is the shape being taken apart.
  if (isDoubleExit(noContextTargetMatchUp?.matchUpStatus)) {
    const rederived = deriveExitStateFromProvenance(retained);
    if (rederived) {
      // A PRODUCED exit has no winningSide until a participant arrives (CA, 2026-09-20); a CARRIED exit keeps its
      // award on an empty seat. The derivation awards the other side either way, so the award stands only for a
      // carried exit, or where the winning seat holds somebody (as `positionClear`'s `awardStands`). Matrix FMLC 8/8,
      // do/undo: a double exit undone left the pending WALKOVER it had converged with won by a seat nobody had reached.
      const awarded = producedAwardStands({
        inContextDrawMatchUps,
        drawDefinition,
        targetMatchUp,
        rederived,
        retained,
      });
      return { ...rederived, winningSide: awarded ? rederived.winningSide : undefined, provenance: retained };
    }
  }

  return { matchUpStatus: TO_BE_PLAYED };
}

function producedAwardStands({
  inContextDrawMatchUps,
  drawDefinition,
  targetMatchUp,
  rederived,
  retained,
}: {
  rederived: { matchUpStatus: MatchUpStatusUnion; winningSide?: number };
  inContextDrawMatchUps: HydratedMatchUp[];
  retained?: SideExitProvenance;
  drawDefinition: DrawDefinition;
  targetMatchUp: HydratedMatchUp;
}): boolean {
  const { winningSide } = rederived;
  if (!winningSide) return false;
  // Produced or carried is a question about the LINK, not the entry: an exit carried over a loser link from a
  // double exit also records `previousMatchUpStatus: DOUBLE_WALKOVER`, and either kind may have been relayed on
  // through a BYE holder before it got here, so the source's direct targets do not settle it either. What does is
  // the exit's FIRST hop (`exitStatusClearing` 2.3: two adjacent WOWOs feed Consolation|1|1, and the one left after
  // a clear keeps its award).
  const sourceMatchUpId = retained?.[3 - winningSide]?.sourceMatchUpId;
  if (!sourceMatchUpId) return true;
  if (
    arrivedOverLoserLink({
      targetMatchUpId: targetMatchUp.matchUpId,
      inContextDrawMatchUps,
      sourceMatchUpId,
      drawDefinition,
    })
  ) {
    return true;
  }
  const { structure } = findStructure({ drawDefinition, structureId: targetMatchUp.structureId });
  const drawPosition = getSideDrawPosition({
    matchUp: { ...targetMatchUp, sides: undefined },
    structureId: targetMatchUp.structureId,
    sideNumber: winningSide,
    drawDefinition,
  });
  const assignment = positionAssignmentsOf(structure)?.find((candidate) => candidate.drawPosition === drawPosition);
  return !!(assignment?.participantId || assignment?.qualifier);
}

/**
 * Did the exit `sourceMatchUpId` sent to `targetMatchUpId` leave over the LOSER link?
 *
 * The first hop decides: from the source's loser target, follow winner targets (a BYE holder sends a held exit on
 * along them) until the target is reached or the walk runs out. A produced exit's first hop is the winner link, so
 * this walk never meets it.
 */
export function arrivedOverLoserLink({
  inContextDrawMatchUps,
  targetMatchUpId,
  sourceMatchUpId,
  drawDefinition,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  targetMatchUpId: string;
  sourceMatchUpId: string;
}): boolean {
  const targetsOf = (matchUpId: string) =>
    positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId }).targetMatchUps;
  const visited = new Set<string>();
  let next = targetsOf(sourceMatchUpId)?.loserMatchUp;
  while (next && !visited.has(next.matchUpId)) {
    if (next.matchUpId === targetMatchUpId) return true;
    visited.add(next.matchUpId);
    next = targetsOf(next.matchUpId)?.winnerMatchUp;
  }
  return false;
}

/**
 * The `byeFromPropagation` marker on the loser target's positionAssignment.
 *
 * Returns undefined both when the drawPosition carries no BYE and when the BYE carries no marker;
 * the caller treats those alike, since neither is a positive statement that this cascade placed it.
 */
function findPropagatedBye({ drawDefinition, loserMatchUp, loserTargetDrawPosition }): boolean | undefined {
  if (!loserMatchUp?.structureId || loserTargetDrawPosition === undefined) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId: loserMatchUp.structureId });
  const assignment = positionAssignmentsOf(structure)?.find(
    (candidate) => candidate.drawPosition === loserTargetDrawPosition,
  );
  return assignment?.bye ? assignment.byeFromPropagation : undefined;
}

/**
 * The policy codes an unwound matchUp keeps: all of them, except on a side whose exit no longer stands.
 *
 * Unwinding a convergence of two double exits re-derives it to the other origin's single exit. Both sides held a code
 * (`['DEF', 'DEF']`); keeping every policy code left the withdrawn side's code in its slot, and the participant who
 * then arrives there and wins the exit stood beside it: a reason badge on the winner (census w1 9000276, w1 9000517,
 * w2 9100184: EXIT_CODE_ON_WINNER_SIDE). A single exit keeps the code only where its retained provenance still
 * records an exit. Any other unwound state keeps the codes as before.
 */
function codesForUnwound(
  matchUp: MatchUp,
  unwound: { matchUpStatus?: MatchUpStatusUnion; provenance?: SideExitProvenance },
) {
  // unwound to no exit at all — undecided, or a BYE — nothing in the array can still describe one, as
  // `withdrawProducedExits` already holds when it reverts a matchUp (census w2 9100153, FRLC 16/11: `Consolation|3|1`
  // kept a `DEF` through its unwind to TO_BE_PLAYED, and it stood on the winner's side once the matchUp was played)
  if (!isAnyExit(unwound.matchUpStatus)) return [];
  const codes = retainPolicyCodes(matchUp);
  if (!unwound.provenance || !isExit(unwound.matchUpStatus)) return codes;
  return codes.map((code, index) => (carriedExitStatus(unwound.provenance?.[index + 1]) ? code : ''));
}
