import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { parseScoreString } from '@Tools/parseScoreString';
import { findStructure } from '@Acquire/findStructure';
import { expect } from 'vitest';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

export function completeMatchUp(params) {
  const { drawDefinition, roundPosition, matchUpStatus, roundNumber, scoreString, structureId, winningSide } = params;
  const sets = scoreString && parseScoreString({ scoreString });
  const score = { sets };
  const { matchUp: targetMatchUp } = findMatchUpByRoundNumberAndPosition({
    drawDefinition: params.drawDefinition,
    roundPosition,
    roundNumber,
    structureId,
  });
  const { matchUpId } = targetMatchUp;

  const { matchUp, error, success } = setMatchUpState({
    drawDefinition,
    matchUpStatus,
    winningSide,
    matchUpId,
    score,
  });
  return { success, error, matchUp, matchUpId };
}

export function findMatchUpByRoundNumberAndPosition(params) {
  const drawDefinition = params.drawDefinition;
  const { roundPosition, roundNumber, structureId, inContext, event } = params;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { matchUps } = getAllStructureMatchUps({
    drawDefinition,
    structure,
    inContext,
    event,
  });
  const matchUp = matchUps.reduce((matchUp, candidate) => {
    return candidate.roundNumber === roundNumber && candidate.roundPosition === roundPosition ? candidate : matchUp;
  }, undefined);
  return { matchUp };
}

export function verifyMatchUps(params) {
  const drawDefinition = params.drawDefinition;
  const { structureId, requireParticipants, expectedRoundPending, expectedRoundUpcoming, expectedRoundCompleted } =
    params;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { completedMatchUps, pendingMatchUps, upcomingMatchUps } = getStructureMatchUps({
    drawDefinition,
    structure,
    requireParticipants,
  });

  const { roundMatchUps: pendingRoundMatchUps } = getRoundMatchUps({
    matchUps: pendingMatchUps,
  });
  const { roundMatchUps: upcomingRoundMatchUps } = getRoundMatchUps({
    matchUps: upcomingMatchUps,
  });
  const { roundMatchUps: completedRoundMatchUps } = getRoundMatchUps({
    matchUps: completedMatchUps,
  });

  if (expectedRoundPending) {
    verifyRoundCounts({
      roundMatchUps: pendingRoundMatchUps,
      expectedRounds: expectedRoundPending,
    });
  }
  if (expectedRoundUpcoming) {
    verifyRoundCounts({
      roundMatchUps: upcomingRoundMatchUps,
      expectedRounds: expectedRoundUpcoming,
    });
  }
  if (expectedRoundCompleted) {
    verifyRoundCounts({
      roundMatchUps: completedRoundMatchUps,
      expectedRounds: expectedRoundCompleted,
    });
  }
}

export function verifySideNumbers({ expectedDrawPositions, drawDefinition, structureId }) {
  const { structure } = findStructure({ drawDefinition, structureId });
  const { matchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
  });
  const { roundMatchUps } = getRoundMatchUps({ matchUps });

  const roundNumbers = expectedDrawPositions && Object.keys(expectedDrawPositions);
  roundNumbers?.forEach((roundNumber) => {
    const profile = roundMatchUps?.[roundNumber].map((matchUp) => [
      matchUp.drawPositions,
      matchUp.sides?.map((side) => side?.sideNumber).filter(Boolean),
    ]);
    expect(profile).toMatchObject(expectedDrawPositions[roundNumber]);
  });
}

function verifyRoundCounts({ roundMatchUps, expectedRounds }) {
  expectedRounds.forEach((count, i) => {
    const roundNumber = i + 1;
    const matchUpCount = roundMatchUps?.[roundNumber]?.length;
    expect(count && matchUpCount).toEqual(count);
  });
}

export function getMatchUpWinnerLoserIds({ drawDefinition, matchUpId }) {
  const { matchUp } = findDrawMatchUp({
    inContext: true,
    drawDefinition,
    matchUpId,
  });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };
  const { sides, winningSide } = matchUp;

  const sideWinning =
    winningSide &&
    sides?.reduce((sideWinning: any, side) => {
      return side.sideNumber === winningSide ? side : sideWinning;
    }, undefined);
  const sideLosing =
    winningSide &&
    sides?.reduce((sideLosing: any, side) => {
      return side.sideNumber === 3 - winningSide ? side : sideLosing;
    }, undefined);

  const winningParticipantId = sideWinning?.participantId;
  const losingParticipantId = sideLosing?.participantId;

  return { winningParticipantId, losingParticipantId };
}
