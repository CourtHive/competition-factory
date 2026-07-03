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

  const byePropagatedToLoserMatchUp =
    loserMatchUp?.matchUpStatus === BYE && (loserMatchUp?.feedRound || loserMatchUp?.roundNumber === 1);
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

function getMatchUpStatus({ pairedPreviousDoubleExit, noContextTargetMatchUp }) {
  if (noContextTargetMatchUp.matchUpStatus === BYE) return BYE;
  if (!pairedPreviousDoubleExit) return TO_BE_PLAYED;
  return [DOUBLE_DEFAULT, DEFAULTED].includes(noContextTargetMatchUp?.matchUpStatus) ? DEFAULTED : WALKOVER;
}
