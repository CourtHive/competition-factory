import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isAnyExit, isExit } from '@Validators/isExit';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  mergeSideExitProvenance,
  getSideExitProvenance,
  deriveStatusCodes,
  carriedExitStatus,
  placeCodeAtSide,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// After a participant advances through a BYE, find the matchUp they advanced
// into — the nearest later round in the same structure that now holds them — so
// the exit status can be re-propagated onto it.
function findAdvancementMatchUp(inContextMatchUps, currentMatchUp, participantId) {
  return inContextMatchUps
    ?.filter(
      (m) =>
        m.matchUpId !== currentMatchUp.matchUpId &&
        m.structureId === currentMatchUp.structureId &&
        m.roundNumber > currentMatchUp.roundNumber &&
        m.sides?.some((s) => s.participantId === participantId),
    )
    .sort((a, b) => a.roundNumber - b.roundNumber)[0];
}

export function progressExitStatus({
  sourceMatchUpStatusCodes,
  propagateExitStatus,
  sourceMatchUpStatus,
  loserParticipantId,
  sourceMatchUpId,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}) {
  const stack = 'progressExitStatus';

  pushGlobalLog({
    method: stack,
    newline: true,
    color: 'magenta',
    keyColors: { loserMatchUpId: 'brightcyan', sourceMatchUpStatus: 'brightyellow' },
    loserMatchUpId: loserMatchUp?.matchUpId,
    loserMatchUpStatus: loserMatchUp?.matchUpStatus,
    sourceMatchUpStatus,
    sourceMatchUpStatusCodes: JSON.stringify(sourceMatchUpStatusCodes),
    loserParticipantId: loserParticipantId?.slice(0, 8),
    propagateExitStatus,
  });

  // RETIRED should not be propagated as an exit status
  const carryOverMatchUpStatus =
    (isExit(sourceMatchUpStatus) && sourceMatchUpStatus !== RETIRED && sourceMatchUpStatus) || WALKOVER;

  // get the updated inContext matchUps so we have current sides/positions
  // (the participant has already been fed/advanced by directLoser at this point)
  const inContextMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps;
  const updatedLoserMatchUp = inContextMatchUps?.find((m) => m.matchUpId === loserMatchUp?.matchUpId);

  if (!updatedLoserMatchUp?.matchUpId) {
    return decorateResult({ result: { error: MISSING_MATCHUP }, stack });
  }

  // Object-shaped codes are normalised to their OWN outcome code, not to a walkover.
  // This previously hardcoded OUTCOME_WALKOVER for every object, which relabelled DEFAULTED and BYE
  // provenance as walkovers and persisted the result (statusCodes is written back below).
  /**
   * THE ARRAY, DERIVED FROM PROVENANCE. See {@link deriveStatusCodes}, which is also
   * `removeDirectedParticipants`' answer to the same question.
   *
   * **P37.** This was `(updatedLoserMatchUp.matchUpStatusCodes ?? []).map(exitOutcomeCode)` over an
   * array that held the PROJECTION of provenance, so the bare exit outcome codes the array
   * legitimately carries — `WO`, `DEF`, the `['WO', 'W1']` contract — existed only as a side effect of
   * the projection being written. Evicting the exit tenant took them with it: measured as `['', 'W1']`
   * where `['WO', 'W1']` belongs, five tests across two files.
   *
   * TRACED, not reasoned about, 2026-09-27, and the trace corrected the plan `P41` recorded. The
   * missing value was NOT `sourceCode`'s. Instrumented on the four failing consolation cases,
   * `sourceMatchUpStatusCodes` is `['W1']`, `['DM']`, `['D1']`, `['RJ']` — the SOURCE'S POLICY CODE,
   * which belongs on the ARRIVING side and is still placed there below, unchanged. What went missing
   * was side 1's own `'WO'`, and side 1's provenance held
   * `{ matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER }` the whole time.
   */
  const statusCodes: string[] = deriveStatusCodes(updatedLoserMatchUp);
  const targetProvenance = getSideExitProvenance({ matchUp: updatedLoserMatchUp });
  const loserParticipantSide = updatedLoserMatchUp.sides?.find((s) => s.participantId === loserParticipantId);

  let loserMatchUpStatus = carryOverMatchUpStatus;
  let winningSide: number | undefined = undefined;
  // CODES first-class: the side that EXITED, attributed to the matchUp whose result produced the
  // exit. Written alongside the legacy string codes, exactly as doubleExitAdvancement does — see
  // sideExitProvenance.ts on why the legacy write is not yet gated.
  let exitProvenance;

  if (loserParticipantSide?.sideNumber) {
    const opponentSideNumber = loserParticipantSide.sideNumber === 1 ? 2 : 1;
    const opponentIsBye = updatedLoserMatchUp.sides?.find((s) => s.sideNumber === opponentSideNumber)?.bye;
    const participantsCount =
      updatedLoserMatchUp.sides?.reduce((count, s) => (s?.participantId ? count + 1 : count), 0) ?? 0;
    const sourceCode = sourceMatchUpStatusCodes?.[0];

    // RULE 1 — opponent is a BYE: the participant advances through it (the BYE
    // cascade has already moved them forward), so this matchUp stays a BYE and we
    // re-propagate the exit onto wherever the participant landed. NOT a WALKOVER.
    if (opponentIsBye) {
      const advancementMatchUp = findAdvancementMatchUp(inContextMatchUps, updatedLoserMatchUp, loserParticipantId);
      pushGlobalLog({
        method: stack,
        color: 'brightcyan',
        decision: 'BYE_advance_rePropagate',
        from: updatedLoserMatchUp.matchUpId?.slice(0, 8),
        to: advancementMatchUp?.matchUpId?.slice(0, 8) ?? 'none',
      });
      const context: any = advancementMatchUp
        ? { progressExitStatus: true, loserMatchUp: advancementMatchUp, loserParticipantId }
        : { progressExitStatus: true };
      return decorateResult({ result: { ...SUCCESS }, stack, context });
    }

    // RULES 2, 3 and 4 all describe the same fact about this side — it holds a participant who
    // EXITED upstream — so the provenance is built once. RULE 4 additionally leaves the opponent's
    // entry, stamped by the earlier propagation, untouched: the write below merges rather than
    // replaces.
    exitProvenance = buildCarriedExitProvenance({
      exitingSideNumber: loserParticipantSide.sideNumber,
      previousMatchUpStatus: sourceMatchUpStatus,
      matchUpStatus: carryOverMatchUpStatus,
      sourceMatchUpId,
    });

    // HAS THE OPPONENT ITSELF EXITED? That is RULE 4's question, and it was asked as
    // `isExit(loserMatchUp.matchUpStatus)` — two errors in one expression, each of which alone sends
    // a convergence to RULE 2.
    //
    //  - `loserMatchUp` is the STALE object. `updatedLoserMatchUp` is read at the top of this
    //    function precisely because the stale one predates `directLoser`; it also predates the
    //    UNWIND when a feeder is being re-scored, so it still reads `DOUBLE_DEFAULT` where the
    //    matchUp now holds the single exit its surviving origin derives.
    //  - `isExit` EXCLUDES `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT` — exactly the statuses a
    //    convergence produces — so a third arrival at an already-converged matchUp read as "the
    //    opponent has not exited". See `isExit`'s own doc comment, which names this trap.
    //
    // Instrumented before it was changed: on the three-step FMLC reproduction the stale object read
    // `DOUBLE_DEFAULT` while the fresh one read `DEFAULTED`, and the gate took RULE 2.
    //
    // A stronger form — asking the OPPONENT SIDE's provenance rather than the matchUp's status —
    // was built and measured, and it is NOT taken: it also re-routes convergences this rule has
    // nothing to do with, and opened census seed 9303124 (DOUBLE_ELIMINATION 8/8) as an
    // `ERR_EXISTING_POSITION_ASSIGNMENT` returned over an already-mutated draw. Reading the right
    // object with the right predicate is the whole correction.
    /**
     * P37. THE OPPONENT'S OWN EXIT, read from side-keyed provenance rather than from the LEGACY array's
     * LENGTH.
     *
     * This was `statusCodes.length === 0` — "no exit code is recorded anywhere on this matchUp" — used as
     * a proxy for "the opponent slot is empty or pending". It is the single gate that decides between
     * RULE 2/3 and RULE 4 below, and RULE 4 is the only site that COLLAPSES a convergence.
     *
     * It is also the reason the exit tenant could not leave `matchUpStatusCodes`. Traced on
     * `FIRST_MATCH_LOSER_CONSOLATION` 8/8 `nonRandom: 9000230` (the `doubleExitUnwindRederives` control
     * route): with the projection removed, `statusCodes` is empty, `opponentEmpty` flips TRUE, RULE 2 is
     * taken instead of RULE 4, `collapseDoubleExitStatus` is never called, and `Consolation|1|1` settles
     * `DEFAULTED` where `DOUBLE_DEFAULT` belongs — with BOTH provenance entries present and correct the
     * whole time. The facts were there; only this gate could not see them.
     *
     * Provenance answers the question the rule actually asks, and answers it PER SIDE, which an array
     * length cannot: has the OPPONENT already exited? `carriedExitStatus` is the same reader RULE 4's own
     * collapse and `deriveExitStateFromProvenance` use, so the two agree by construction.
     */
    const opponentProvenance = targetProvenance?.[opponentSideNumber];
    const opponentEmpty = participantsCount === 1 && !carriedExitStatus(opponentProvenance);
    if (opponentEmpty || !isAnyExit(updatedLoserMatchUp.matchUpStatus)) {
      // RULE 2 — opponent slot empty/pending: WALKOVER, the side WITHOUT the exit
      //          (the empty side that will receive the eventual opponent) wins.
      // RULE 3 — opponent is a present, non-exited participant: WALKOVER to them.
      // Both resolve identically: the non-exit (opponent) side is the winner and
      // the carried code sits on the exiting participant's side.
      winningSide = opponentSideNumber;
      placeCodeAtSide(statusCodes, loserParticipantSide.sideNumber, sourceCode);
    } else {
      // RULE 4 — the opponent has itself already exited: the two exits MEET and this matchUp
      // becomes a double exit. Nobody wins it.
      //
      // The carried code goes at the ARRIVING participant's side index, and the opponent's code is
      // left where the earlier propagation already put it. The previous version did neither: it read
      // `statusCodes[0]` unconditionally and re-assigned both slots by hand. That read was correct
      // when RULE 2 always wrote index 0, but RULE 2 now uses `placeCodeAtSide` (see above), so when
      // the FIRST exit landed on side 2 its code sits at index 1 and the index-0 read took an empty
      // slot — silently discarding the earlier code. The masking case (first exit on side 1) is the
      // one the existing tests cover.
      //
      // Removing the hand-assignment also removes the hole array. With `sourceCode` undefined — the
      // normal case for a directly-recorded exit — the old code assigned `undefined` into both
      // slots and PERSISTED `[undefined, undefined]`, which is not a `string[]`, serialises to
      // `[null, null]`, and is load-bearing in this rule's own `opponentEmpty` gate because that
      // tests `statusCodes.length === 0`. `placeCodeAtSide` returns early on an undefined code, so
      // the array is simply left alone. CA ruled 2026-09-12: "we can't be persisting
      // [undefined, undefined]".
      placeCodeAtSide(statusCodes, loserParticipantSide.sideNumber, sourceCode);
      // WHICH double exit is derived from what each side carried, not hardcoded. This always wrote
      // DOUBLE_WALKOVER, which relabelled a default-on-default convergence as a walkover and so
      // propagated a WALKOVER where a DEFAULTED belonged. A mixture still collapses to
      // DOUBLE_WALKOVER — see collapseDoubleExitStatus for why the weaker claim wins there.
      loserMatchUpStatus = collapseDoubleExitStatus([carryOverMatchUpStatus, updatedLoserMatchUp.matchUpStatus]);
      winningSide = undefined;
    }
  }

  pushGlobalLog({
    method: stack,
    color: 'brightmagenta',
    action: 'calling_setMatchUpState',
    loserMatchUpId: loserMatchUp.matchUpId,
    finalStatus: loserMatchUpStatus,
    finalWinningSide: winningSide,
    finalStatusCodes: JSON.stringify(statusCodes),
  });

  const result = setMatchUpState({
    matchUpStatus: loserMatchUpStatus,
    matchUpId: loserMatchUp.matchUpId,
    matchUpStatusCodes: statusCodes,
    allowChangePropagation: true,
    // THE CASCADE IDENTIFIES ITSELF. `checkParticipants` waives the two-participant requirement for
    // a one-sided exit, and until now it waived it on `propagateExitStatus` — a REQUEST FLAG any
    // caller can set — so a directly-entered WALKOVER could be awarded to an empty side and was.
    // This is the only propagation caller of `setMatchUpState`, so the waiver belongs to it by name.
    // RULE 2 above is why the waiver has to exist at all: the side WITHOUT the exit wins, and that
    // side is empty until the opponent arrives.
    propagatingExit: true,
    propagateExitStatus,
    tournamentRecord,
    drawDefinition,
    winningSide,
    event,
  });
  if (!result.error) {
    // stamped AFTER the state write: setMatchUpState clears provenance wherever it blanks the codes
    // the provenance describes (#4816), so writing first would be undone.
    // The map is rebuilt here rather than reusing the `matchUpsMap` threaded through the
    // propagation context: that one predates the `setMatchUpState` above, and the objects it holds
    // can be detached from `drawDefinition.structures` by the time the write returns. Measured —
    // stamping onto the context map wrote to an object no subsequent read could see.
    const drawMatchUps = getMatchUpsMap({ drawDefinition })?.drawMatchUps ?? [];
    const noContextLoserMatchUp = drawMatchUps.find((m) => m.matchUpId === loserMatchUp.matchUpId);
    mergeSideExitProvenance({ matchUp: noContextLoserMatchUp, provenance: exitProvenance });
  }

  return decorateResult({ result, stack, context: { progressExitStatus: true } });
}
