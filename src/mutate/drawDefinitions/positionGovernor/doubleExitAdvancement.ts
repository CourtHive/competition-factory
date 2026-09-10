import { advanceDrawPosition, assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignMatchUpDrawPosition } from '@Mutate/matchUps/drawPositions/assignMatchUpDrawPosition';
import { getPairedPreviousMatchUpIsDoubleExit } from '../../../query/matchUps/getPairedPreviousMatchUpIsDoubleExit';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { directWinner } from '@Mutate/matchUps/drawPositions/directWinner';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { definedAttributes } from '@Tools/definedAttributes';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { findStructure } from '@Acquire/findStructure';
import { isExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';

// constants
import { DRAW_POSITION_ASSIGNED, MISSING_MATCHUP, MISSING_STRUCTURE } from '@Constants/errorConditionConstants';
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
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

  const loserMatchUpIsDoubleExit = loserMatchUp?.matchUpStatus === DOUBLE_WALKOVER;

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
  const targetFedIn = loserMatchUp.feedRound && loserMatchUp.sides?.[0]?.participantFed;

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
    return handleEmptyExitLoser({ loserMatchUp, matchUpsMap, params, stack });
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

function handleEmptyExitLoser({ loserMatchUp, matchUpsMap, params, stack }) {
  const DOUBLE_EXIT = params.matchUpStatus === DOUBLE_DEFAULT ? DOUBLE_DEFAULT : DOUBLE_WALKOVER;
  const EXIT = params.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;

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
    const matchUpStatusCodes = [
      { matchUpStatus: EXIT, previousMatchUpStatus: DOUBLE_EXIT, sideNumber: 1 },
      { matchUpStatus: EXIT, previousMatchUpStatus: params.matchUpStatus, sideNumber: 2 },
    ].map((code) => definedAttributes(code));

    return modifyMatchUpScore({
      ...params,
      matchUp: noContextLoserMatchUp,
      matchUpId: loserMatchUp.matchUpId,
      matchUpStatus: DOUBLE_EXIT,
      matchUpStatusCodes,
      winningSide: undefined,
      removeScore: true,
      context: stack,
    });
  }

  return { ...SUCCESS };
}

// 1. Assigns a WALKOVER or DEFAULTED status to the winnerMatchUp
// 2. Advances any drawPosition that is already present
function conditionallyAdvanceDrawPosition(params) {
  const { inContextDrawMatchUps, tournamentRecord, drawDefinition, sourceMatchUp, targetMatchUp, matchUpsMap } = params;

  const structure = drawDefinition.structures.find(({ structureId }) => structureId === targetMatchUp.structureId);

  const DOUBLE_EXIT = params.matchUpStatus === DOUBLE_DEFAULT ? DOUBLE_DEFAULT : DOUBLE_WALKOVER;
  const EXIT = params.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;

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
    DOUBLE_EXIT,
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

  const matchUpStatus = existingExit ? DOUBLE_EXIT : EXIT;

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

  const matchUpStatusCodes = buildMatchUpStatusCodes({
    sourceMatchUpStatus,
    pairedMatchUpStatus,
    sourceSideNumber,
  });

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

  return advanceFromTarget({
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

  if (sourceMatchUp?.structureId === inContextPairedPreviousMatchUp?.structureId) {
    // if structureIds are equivalent then sideNumber is inferred from roundPositions
    sourceSideNumber = sourceMatchUp.roundPosition < pairedPreviousMatchUp?.roundPosition ? 1 : 2;
  } else if (targetMatchUp.feedRound) {
    // if different structureIds then structureId that is not equivalent to noContextTargetMatchUp.structureId is fed
    // ... and fed positions are always sideNumber 1
    sourceSideNumber = sourceMatchUp.structureId === targetMatchUp.structureId ? 2 : 1;
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

function buildMatchUpStatusCodes({ sourceMatchUpStatus, pairedMatchUpStatus, sourceSideNumber }) {
  let matchUpStatusCodes: any[] = [];

  if (sourceSideNumber === 1) {
    matchUpStatusCodes = [
      {
        matchUpStatus: producedMatchUpStatus(sourceMatchUpStatus),
        previousMatchUpStatus: sourceMatchUpStatus,
        sideNumber: 1,
      },
      {
        matchUpStatus: producedMatchUpStatus(pairedMatchUpStatus),
        previousMatchUpStatus: pairedMatchUpStatus,
        sideNumber: 2,
      },
    ];
  } else if (sourceSideNumber === 2) {
    matchUpStatusCodes = [
      {
        matchUpStatus: producedMatchUpStatus(pairedMatchUpStatus),
        previousMatchUpStatus: pairedMatchUpStatus,
        sideNumber: 1,
      },
      {
        matchUpStatus: producedMatchUpStatus(sourceMatchUpStatus),
        previousMatchUpStatus: sourceMatchUpStatus,
        sideNumber: 2,
      },
    ];
  }

  if (matchUpStatusCodes.length) matchUpStatusCodes = matchUpStatusCodes.map((code) => definedAttributes(code));

  return matchUpStatusCodes;
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

    // if the next targetMatchUp already has a drawPosition
    const winningSide = getExitWinningSide({
      drawPosition: nextDrawPositionToAdvance,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      inContextDrawMatchUps,
    });

    const result = modifyMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: noContextNextWinnerMatchUp.matchUpId,
      matchUp: noContextNextWinnerMatchUp,
      matchUpStatus: EXIT,
      matchUpStatusCodes: [],
      removeScore: true,
      context: stack,
      drawDefinition,
      winningSide,
    });
    if (result.error) return decorateResult({ result, stack });

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
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
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

function producedMatchUpStatus(previousMatchUpStatus) {
  if (previousMatchUpStatus === DOUBLE_WALKOVER) return WALKOVER;
  if (previousMatchUpStatus === DOUBLE_DEFAULT) return DEFAULTED;
  return previousMatchUpStatus;
}
