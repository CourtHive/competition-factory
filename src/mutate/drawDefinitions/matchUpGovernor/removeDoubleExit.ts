import { removeDirectedBye, removeDirectedWinner } from '@Mutate/matchUps/drawPositions/removeDirectedParticipants';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { chunkArray, intersection, overlap } from '@Tools/arrays';
import { findStructure } from '@Acquire/findStructure';

// constants
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
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

  // only handles winnerMatchUps in the same structure
  if (winnerMatchUp && winnerMatchUp.matchUpStatus !== BYE) {
    const { stage, roundNumber, roundPosition, structureName } = winnerMatchUp;
    pushGlobalLog({
      winner: 'winner',
      roundPosition,
      structureName,
      roundNumber,
      keyColors,
      stage,
    });
    conditionallyRemoveDrawPosition({
      ...params,
      targetMatchUp: winnerMatchUp,
      sourceMatchUp: matchUp,
      iteration,
    });
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

  const isFMLC = targetData?.targetLinks?.loserTargetLink?.linkCondition === FIRST_MATCHUP;

  if (byePropagatedToLoserMatchUp && isFMLC) {
    // determine whether the BYE has been propagated to the loserMatchUp by two double exits
    const roundMatchUps = inContextDrawMatchUps.filter(
      ({ roundNumber, structureId }) => structureId === matchUp.structureId && roundNumber === 1,
    );
    const roundPositions = roundMatchUps.map(({ roundPosition }) => roundPosition);
    const pairedPositions = chunkArray(
      roundPositions.toSorted((a, b) => a - b),
      2,
    ).find((chunk) => chunk.includes(matchUp.roundPosition));
    const pairedMatchUpStatuses = roundMatchUps
      .filter(({ roundPosition }) => pairedPositions.includes(roundPosition))
      ?.map(({ matchUpStatus }) => matchUpStatus);
    const pairedMatchUpIsDoubleExit = pairedMatchUpStatuses.every((matchUpStatus) =>
      [DOUBLE_DEFAULT, DOUBLE_WALKOVER].includes(matchUpStatus),
    );
    if (pairedMatchUpIsDoubleExit) {
      return decorateResult({ result: { ...SUCCESS }, stack });
    }
  }

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

    if (appliedPolicies?.progression?.doubleExitPropagateBye || byePropagatedToLoserMatchUp) {
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
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

export function conditionallyRemoveDrawPosition(params) {
  const {
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
    const nextWinnerDrawPositions = nextWinnerMatchUp?.drawPositions?.filter(Boolean);
    drawPositionToRemove = nextWinnerDrawPositions?.find((drawPosition) =>
      targetMatchUp.drawPositions.includes(drawPosition),
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

  if (nextWinnerMatchUp && drawPositionToRemove) {
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

  let result = removeDoubleExit({
    targetData: nextTargetData,
    matchUp: targetMatchUp,
    inContextDrawMatchUps,
    appliedPolicies,
    drawDefinition,
    matchUpsMap,
    structure,
    iteration,
  });
  if (result.error) return decorateResult({ result, stack });

  const matchUpStatus = getMatchUpStatus({
    pairedPreviousDoubleExit,
    noContextTargetMatchUp,
    drawDefinition,
    targetMatchUp,
  });

  const removeScore = !pairedPreviousDoubleExit;
  result = modifyMatchUpScore({
    ...params,
    matchUpId: targetMatchUp.matchUpId,
    matchUp: noContextTargetMatchUp,
    removeWinningSide: true,
    matchUpStatusCodes: [],
    context: stack,
    matchUpStatus,
    removeScore,
    score: {
      scoreStringSide1: '',
      scoreStringSide2: '',
      sets: undefined,
    },
  });

  if (result.error) return decorateResult({ result, stack });

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
  return !!targetStructure?.positionAssignments?.some(
    (assignment) => drawPositions.includes(assignment.drawPosition) && assignment.bye,
  );
}

function getMatchUpStatus({ pairedPreviousDoubleExit, noContextTargetMatchUp, drawDefinition, targetMatchUp }) {
  if (noContextTargetMatchUp.matchUpStatus === BYE) return BYE;
  // A still-live paired double exit keeps its produced exit; that decision is unchanged and is
  // checked BEFORE the assignment, because a BYE-held drawPosition legitimately carries a
  // propagated exit while one is outstanding (measured: a Consolation matchUp reads DEFAULTED on a
  // BYE drawPosition mid-cascade, and must stay that way).
  if (pairedPreviousDoubleExit) {
    return [DOUBLE_DEFAULT, DEFAULTED].includes(noContextTargetMatchUp?.matchUpStatus) ? DEFAULTED : WALKOVER;
  }
  // Otherwise the unwind is complete and the matchUp reverts. `matchUpStatus` above can already
  // have been overwritten by the cascade being unwound (measured: BYE -> WALKOVER on apply), so it
  // cannot answer "was this a BYE?". The positionAssignment is the durable record and still can.
  if (targetDrawPositionIsBye({ drawDefinition, noContextTargetMatchUp, targetMatchUp })) return BYE;
  return TO_BE_PLAYED;
}

/**
 * The `byeFromPropagation` marker on the loser target's positionAssignment.
 *
 * Returns undefined both when the drawPosition carries no BYE and when the BYE carries no marker;
 * the caller treats those alike, since neither is a positive statement that this cascade placed it.
 */
function findPropagatedBye({ drawDefinition, loserMatchUp, loserTargetDrawPosition }): any {
  if (!loserMatchUp?.structureId || loserTargetDrawPosition === undefined) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId: loserMatchUp.structureId });
  const assignment = structure?.positionAssignments?.find(
    (candidate) => candidate.drawPosition === loserTargetDrawPosition,
  );
  return assignment?.bye ? assignment.byeFromPropagation : undefined;
}
