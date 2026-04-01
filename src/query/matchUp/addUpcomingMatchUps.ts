import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getParticipantIds } from '@Functions/global/extractors';
import { findStructure } from '@Acquire/findStructure';
import { timeStringMinutes } from '@Tools/dateTime';
import { numericSort } from '@Tools/sorting';
import { ensureInt } from '@Tools/ensureInt';

// constants
import { FIRST_MATCHUP, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

export function addUpcomingMatchUps({ drawDefinition, inContextDrawMatchUps }) {
  const scheduleConflictMatchUpIds = {};

  inContextDrawMatchUps.forEach((inContextMatchUp) => {
    const { matchUpId, structureId, drawPositions = [] } = inContextMatchUp;
    const { structure } = findStructure({ drawDefinition, structureId });
    if (structure?.finishingPosition === WIN_RATIO) {
      addRoundRobinSidesTo({ inContextMatchUp, structure, drawPositions });
    } else {
      addEliminationUpcomingInfo({
        scheduleConflictMatchUpIds,
        inContextDrawMatchUps,
        inContextMatchUp,
        drawDefinition,
        matchUpId,
      });
    }
  });

  if (Object.keys(scheduleConflictMatchUpIds).length) {
    inContextDrawMatchUps.forEach((inContextMatchUp) => {
      if (Object.keys(scheduleConflictMatchUpIds).includes(inContextMatchUp.matchUpId))
        inContextMatchUp.schedule.scheduleConflict = scheduleConflictMatchUpIds[inContextMatchUp.matchUpId];
    });
  }

  return { scheduleConflictMatchUpIds };
}

function addRoundRobinSidesTo({ inContextMatchUp, structure, drawPositions }) {
  const { roundNumber } = inContextMatchUp;
  const nextRoundNumber = roundNumber && ensureInt(roundNumber) + 1;
  const matchUps = structure.matchUps ?? [];
  const { roundMatchUps } = getRoundMatchUps({ matchUps });

  if (nextRoundNumber && roundMatchUps?.[nextRoundNumber]) {
    const sidesTo = [...drawPositions]
      .sort(numericSort)
      .map((drawPosition, index) => {
        const nextRoundMatchUp = roundMatchUps[nextRoundNumber].find((matchUp) =>
          matchUp.drawPositions?.includes(drawPosition),
        );
        return {
          matchUpId: nextRoundMatchUp?.matchUpId,
          roundNumber: nextRoundNumber,
          schedule: nextRoundMatchUp?.schedule,
          sideNumber: index + 1,
          structureName: structure.structureName,
        };
      });
    Object.assign(inContextMatchUp, { sidesTo });
  }
}

function addEliminationUpcomingInfo({
  scheduleConflictMatchUpIds,
  inContextDrawMatchUps,
  inContextMatchUp,
  drawDefinition,
  matchUpId,
}) {
  const targetData = positionTargets({
    useTargetMatchUpIds: true,
    inContextDrawMatchUps,
    inContextMatchUp,
    drawDefinition,
    matchUpId,
  });
  let { winnerMatchUp } = targetData.targetMatchUps;
  const { loserMatchUp } = targetData.targetMatchUps;

  if (!inContextMatchUp.winnerMatchUpId && winnerMatchUp) {
    inContextMatchUp.winnerMatchUpId = winnerMatchUp.matchUpId;
  }
  if (!inContextMatchUp.loserMatchUpId && loserMatchUp) {
    inContextMatchUp.loserMatchUpId = loserMatchUp.matchUpId;
  }

  const winnerTo = getUpcomingInfo({ upcomingMatchUp: winnerMatchUp });
  let loserTo = getUpcomingInfo({ upcomingMatchUp: loserMatchUp });

  if (inContextMatchUp.matchUpStatus !== BYE && loserMatchUp?.matchUpStatus === BYE) {
    const { matchUp: nextMatchUp } =
      getNextToBePlayedMatchUp({
        matchUp: loserMatchUp,
        drawDefinition,
        inContextDrawMatchUps,
      }) || {};
    loserTo = (nextMatchUp && getUpcomingInfo({ upcomingMatchUp: nextMatchUp })) || loserTo;
  }

  const timeAfterRecovery = inContextMatchUp.schedule?.timeAfterRecovery;
  if (timeAfterRecovery) {
    checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo: winnerTo });
    checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo: loserTo });
  }
  Object.assign(inContextMatchUp, { winnerTo, loserTo });

  if (inContextMatchUp.drawPositions?.filter(Boolean).length) {
    addPotentialParticipants({
      inContextDrawMatchUps,
      inContextMatchUp,
      winnerMatchUp,
      loserMatchUp,
      targetData,
    });
  }
}

function checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo }) {
  if (upcomingTo?.schedule?.scheduledTime) {
    const scheduleConflict =
      timeStringMinutes(upcomingTo.schedule.scheduledTime) < timeStringMinutes(timeAfterRecovery);
    if (scheduleConflict) {
      scheduleConflictMatchUpIds[upcomingTo.matchUpId] = inContextMatchUp.matchUpId;
      upcomingTo.schedule.scheduleConflict = inContextMatchUp.matchUpId;
    }
  }
}

function addPotentialParticipants({
  inContextDrawMatchUps,
  inContextMatchUp,
  winnerMatchUp,
  loserMatchUp,
  targetData,
}) {
  const loserTargetLink = targetData.targetLinks?.loserTargetLink;
  const firstMatchUp = loserTargetLink?.linkCondition === FIRST_MATCHUP;

  const participants = getMatchUpParticipants(inContextMatchUp);
  if (!participants.length) return;

  const winnerParticipantIds = getParticipantIds(winnerMatchUp?.sides);
  const loserParticipantIds = getParticipantIds(loserMatchUp?.sides);
  const winnerDetermined = participants.find(({ participantId }) => winnerParticipantIds.includes(participantId));
  const winnerPotentials = !winnerDetermined ? participants : [];
  const loserDetermined = participants.find(({ participantId }) => loserParticipantIds.includes(participantId));
  const loserPotentials = !loserDetermined ? participants : [];
  if (loserMatchUp && firstMatchUp && loserPotentials.length < 2) {
    loserPotentials.push({ bye: true, tbd: true }); // tbd: true indiciates that for FMLC, WO/DEF could propagate a player
  }

  if (winnerPotentials?.length && winnerMatchUp) {
    if (!targetData.targetMatchUpIds && winnerMatchUp) {
      winnerMatchUp = inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === winnerMatchUp.matchUpId);
    }

    if (!winnerMatchUp.potentialParticipants) winnerMatchUp.potentialParticipants = [];
    winnerMatchUp.potentialParticipants.push(winnerPotentials);
  }
  if (loserPotentials?.length && loserMatchUp) {
    if (!targetData.targetMatchUpIds) {
      winnerMatchUp = inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    }

    if (!loserMatchUp.potentialParticipants) {
      loserMatchUp.potentialParticipants = [];
    }

    loserMatchUp.potentialParticipants.push(loserPotentials);
  }
}

function getMatchUpParticipants(matchUp) {
  return (
    matchUp?.sides
      ?.map(
        ({ participant, participantId, qualifier }) =>
          participant || (participantId && { participantId }) || (qualifier && { qualifier }),
      )
      .filter(Boolean) || []
  );
}

function getNextToBePlayedMatchUp({ matchUp, drawDefinition, inContextDrawMatchUps }) {
  const { matchUpId, matchUpStatus, structureId } = matchUp || {};
  if (!matchUp || !structureId || matchUp?.matchUpStatus === TO_BE_PLAYED) return { matchUp };
  if (matchUpStatus === BYE) {
    let winnerMatchUp;

    if (matchUp.winnerMatchUpId) {
      winnerMatchUp = inContextDrawMatchUps.find(({ matchUpId }) => matchUpId === matchUp.winnerMatchUpId);
    } else {
      const targetData = positionTargets({
        inContextDrawMatchUps,
        drawDefinition,
        matchUpId,
      });
      ({ winnerMatchUp } = targetData?.targetMatchUps || {});
    }

    return getNextToBePlayedMatchUp({
      matchUp: winnerMatchUp,
      drawDefinition,
      inContextDrawMatchUps,
    });
  }
  return { matchUp: undefined };
}

function getUpcomingInfo(params) {
  if (!params?.upcomingMatchUp) return;
  return (({ matchUpId, structureId, schedule, roundNumber, roundPosition, structureName }) => ({
    matchUpId,
    structureId,
    schedule,
    roundNumber,
    roundPosition,
    structureName,
  }))(params.upcomingMatchUp);
}
