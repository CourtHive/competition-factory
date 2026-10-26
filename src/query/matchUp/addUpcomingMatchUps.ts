import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getParticipantIds } from '@Functions/global/extractors';
import { extractDate, timeStringMinutes } from '@Tools/dateTime';
import { ensureInt } from '@Tools/ensureInt';
import { numericSort } from '@Tools/sorting';
import {
  buildTargetIndex,
  indexedStructure,
  PositionTargetLinks,
  positionTargets,
  TargetIndex,
} from '@Query/matchUp/positionTargets';

// constants
import { BYE, completedMatchUpStatuses, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

export function addUpcomingMatchUps({ drawDefinition, inContextDrawMatchUps }) {
  const scheduleConflictMatchUpIds = {};
  // built once for this call: every matchUp's targets are read from the same draw
  const targetIndex = buildTargetIndex(inContextDrawMatchUps);

  inContextDrawMatchUps.forEach((inContextMatchUp) => {
    const { matchUpId, structureId, drawPositions = [] } = inContextMatchUp;
    const { structure } = indexedStructure({ drawDefinition, targetIndex, structureId });
    if (structure?.finishingPosition === WIN_RATIO) {
      addRoundRobinSidesTo({ inContextMatchUp, structure, drawPositions });
    } else {
      addEliminationUpcomingInfo({
        scheduleConflictMatchUpIds,
        inContextDrawMatchUps,
        inContextMatchUp,
        drawDefinition,
        targetIndex,
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
    const sidesTo = [...drawPositions].sort(numericSort).map((drawPosition, index) => {
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
  targetIndex,
  matchUpId,
}: {
  scheduleConflictMatchUpIds: Record<string, string>;
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  targetIndex: TargetIndex;
  matchUpId: string;
}) {
  const targetData = positionTargets({
    useTargetMatchUpIds: true,
    inContextDrawMatchUps,
    inContextMatchUp,
    drawDefinition,
    targetIndex,
    matchUpId,
  });
  /**
   * A MALFORMED ROUND LINK LEAVES THIS MATCHUP UNDECORATED (CA, 2026-10-06: it is an error). This is
   * hydration, with no error channel: every `nextMatchUps` read takes it, `modifyMatchUpScore`,
   * scheduling and the outcome view among them. Failing it would replace the error the directing call
   * returns with an unrelated one. The error is returned wherever the link is followed.
   */
  if (targetData.error) return;
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

  // the matchUp a loser actually reaches: past a BYE, the next one to be played (CA 2026-10-26, hydration OPEN-3)
  let loserReached = loserMatchUp;
  if (inContextMatchUp.matchUpStatus !== BYE && loserMatchUp?.matchUpStatus === BYE) {
    const { matchUp: nextMatchUp } =
      getNextToBePlayedMatchUp({
        matchUp: loserMatchUp,
        drawDefinition,
        inContextDrawMatchUps,
      }) ?? {};
    loserTo = (nextMatchUp && getUpcomingInfo({ upcomingMatchUp: nextMatchUp })) || loserTo;
    if (nextMatchUp) loserReached = nextMatchUp;
  }

  const timeAfterRecovery = inContextMatchUp.schedule?.timeAfterRecovery;
  if (timeAfterRecovery) {
    checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo: winnerTo });
    checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo: loserTo });
  }
  Object.assign(inContextMatchUp, { winnerTo, loserTo });

  if (inContextMatchUp.drawPositions?.filter(Boolean).length) {
    addPotentialParticipants({
      targetLinks: targetData.targetLinks,
      loserMatchUp: loserReached,
      inContextMatchUp,
      winnerMatchUp,
      targetIndex,
    });
  }
}

function checkScheduleConflict({ scheduleConflictMatchUpIds, inContextMatchUp, timeAfterRecovery, upcomingTo }) {
  if (upcomingTo?.schedule?.scheduledTime) {
    // date and time together where both dates are known: the next day's morning is not before tonight's recovery
    // (CA 2026-10-26, hydration OPEN-8); a target with no date is compared by the clock, as it always was
    const afterDate = inContextMatchUp.schedule?.dateAfterRecovery;
    const targetDate = upcomingTo.schedule.scheduledDate ?? extractDate(upcomingTo.schedule.scheduledTime);
    const earlierClock = timeStringMinutes(upcomingTo.schedule.scheduledTime) < timeStringMinutes(timeAfterRecovery);
    const scheduleConflict =
      afterDate && targetDate ? targetDate < afterDate || (targetDate === afterDate && earlierClock) : earlierClock;
    if (scheduleConflict) {
      scheduleConflictMatchUpIds[upcomingTo.matchUpId] = inContextMatchUp.matchUpId;
      upcomingTo.schedule.scheduleConflict = inContextMatchUp.matchUpId;
    }
  }
}

function addPotentialParticipants({
  inContextMatchUp,
  winnerMatchUp,
  loserMatchUp,
  targetLinks,
  targetIndex,
}: {
  inContextMatchUp: HydratedMatchUp;
  winnerMatchUp?: HydratedMatchUp;
  loserMatchUp?: HydratedMatchUp;
  targetLinks: PositionTargetLinks;
  targetIndex: TargetIndex;
}) {
  const loserTargetLink = targetLinks.loserTargetLink;
  const firstMatchUp = loserTargetLink?.linkCondition === FIRST_MATCHUP;

  const participants = getMatchUpParticipants(inContextMatchUp);
  if (!participants.length) return;

  // a decided matchUp has already placed whoever it sends on; one it has not placed (a loser an FMLC feed keeps out)
  // is going nowhere, and a BYE has no loser at all: none of them is a potential participant of a target
  const { matchUpStatus, winningSide } = inContextMatchUp;
  const decided = !!winningSide || (!!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus));
  if (decided || matchUpStatus === BYE) return;

  const winnerParticipantIds = getParticipantIds(winnerMatchUp?.sides);
  const loserParticipantIds = getParticipantIds(loserMatchUp?.sides);
  const winnerDetermined = participants.find(({ participantId }) => winnerParticipantIds.includes(participantId));
  // each target gets its own list: the FMLC marker below is the loser target's only (CA 2026-10-26, hydration OPEN-2)
  const winnerPotentials = !winnerDetermined ? [...participants] : [];
  const loserDetermined = participants.find(({ participantId }) => loserParticipantIds.includes(participantId));
  const loserPotentials = !loserDetermined ? [...participants] : [];
  if (loserMatchUp && firstMatchUp && loserPotentials.length < 2) {
    loserPotentials.push({ bye: true, tbd: true }); // tbd: true indiciates that for FMLC, WO/DEF could propagate a player
  }

  // a target resolved from the draw's links is a COPY (`positionTargets` returns copies unless asked for references),
  // so the potentials are written onto the in-context matchUp the caller is handed. `targetMatchUpIds` does not say
  // which a target is: the stored-id shortcut returns references without setting it, the full path copies with it set
  const inContextTarget = (target) => targetIndex.byMatchUpId.get(target.matchUpId) ?? target;

  // a BYE is never played: nobody is a potential participant of it (CA 2026-10-26, hydration OPEN-3)
  if (winnerPotentials.length && winnerMatchUp && winnerMatchUp.matchUpStatus !== BYE) {
    const target = inContextTarget(winnerMatchUp);
    target.potentialParticipants ??= [];
    target.potentialParticipants.push(winnerPotentials);
  }
  if (loserPotentials.length && loserMatchUp && loserMatchUp.matchUpStatus !== BYE) {
    const target = inContextTarget(loserMatchUp);
    target.potentialParticipants ??= [];
    target.potentialParticipants.push(loserPotentials);
  }
}

function getMatchUpParticipants(matchUp) {
  return (
    matchUp?.sides
      ?.map(
        ({ participant, participantId, qualifier }) =>
          participant || (participantId && { participantId }) || (qualifier && { qualifier }),
      )
      .filter(Boolean) ?? []
  );
}

function getNextToBePlayedMatchUp({ matchUp, drawDefinition, inContextDrawMatchUps }) {
  const { matchUpId, matchUpStatus, structureId } = matchUp ?? {};
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
      ({ winnerMatchUp } = targetData?.targetMatchUps ?? {});
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
