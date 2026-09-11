import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isExit } from '@Validators/isExit';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { exitOutcomeCode } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
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
      // RULE 4 — opponent has itself already walked over: DOUBLE_WALKOVER.
      const currentStatusCode = statusCodes[0];
      statusCodes[loserParticipantSide.sideNumber - 1] = sourceCode as string;
      statusCodes[opponentSideNumber - 1] = currentStatusCode;
      loserMatchUpStatus = DOUBLE_WALKOVER;
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
  return decorateResult({ result, stack, context: { progressExitStatus: true } });
}
