import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isExit } from '@Validators/isExit';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  mergeSideExitProvenance,
  exitOutcomeCode,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// matchUpStatusCodes are position-dependent: index 0 maps to side 1, index 1 to
// side 2. Place the carried code at the index of the participant's side, padding
// leading positions with '' (so a participant on side 2 yields ['', 'W1'], never
// ['W1'] which would mis-map to the opponent).
function placeCodeAtSide(statusCodes: string[], sideNumber: number, code?: string) {
  if (code === undefined) return;
  const index = sideNumber - 1;
  for (let i = 0; i < index; i++) if (statusCodes[i] === undefined) statusCodes[i] = '';
  statusCodes[index] = code;
}

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
  const statusCodes: string[] = (updatedLoserMatchUp.matchUpStatusCodes ?? []).map(exitOutcomeCode);
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

    const opponentEmpty = participantsCount === 1 && statusCodes.length === 0;
    if (opponentEmpty || !isExit(loserMatchUp.matchUpStatus)) {
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
