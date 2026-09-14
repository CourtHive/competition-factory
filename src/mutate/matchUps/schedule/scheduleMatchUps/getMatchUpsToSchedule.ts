import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants
import { ErrorType } from '@Constants/errorConditionConstants';
import { MATCHUPS } from '@Constants/attributeConstants';
import {
  BYE,
  ABANDONED,
  DEFAULTED,
  RETIRED,
  WALKOVER,
  COMPLETED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
} from '@Constants/matchUpStatusConstants';

type GetMatchUpsToScheduleArgs = {
  matchUpPotentialParticipantIds?: { [key: string]: string[] };
  matchUpScheduleTimes?: { [key: string]: string };
  matchUpNotBeforeTimes?: { [key: string]: any };
  scheduleCompletedMatchUps?: boolean;
  dateScheduledMatchUpIds?: string[];
  orderedMatchUpIds?: string[];
  clearDate?: boolean;
  matchUps: any[];
};

export function getMatchUpsToSchedule(params: GetMatchUpsToScheduleArgs): {
  matchUpsToSchedule?: any[];
  error?: ErrorType;
  matchUpMap?: any;
} {
  const paramsCheck = checkRequiredParameters(params, [{ [MATCHUPS]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const {
    matchUpPotentialParticipantIds,
    dateScheduledMatchUpIds = [],
    scheduleCompletedMatchUps,
    matchUpNotBeforeTimes,
    matchUpScheduleTimes,
    orderedMatchUpIds,
    clearDate,
    matchUps,
  } = params;
  const alreadyScheduledMatchUpIds = matchUpScheduleTimes ? Object.keys(matchUpScheduleTimes) : [];

  // this must be done to preserve the order of matchUpIds
  const matchUpsToSchedule = (orderedMatchUpIds ?? [])
    .map((matchUpId) => matchUps.find((matchUp) => matchUp.matchUpId === matchUpId))
    .filter(Boolean)
    .filter((matchUp) => {
      const alreadyScheduled =
        !clearDate &&
        (dateScheduledMatchUpIds.includes(matchUp.matchUpId) || alreadyScheduledMatchUpIds.includes(matchUp.matchUpId));

      const doNotSchedule = [
        BYE,
        DEFAULTED,
        COMPLETED,
        ABANDONED,
        RETIRED,
        WALKOVER,
        DOUBLE_WALKOVER,
        DOUBLE_DEFAULT,
      ].includes(matchUp?.matchUpStatus);

      return (
        scheduleCompletedMatchUps || // override for mocksEngine
        (!alreadyScheduled && !matchUp.winningSide && !doNotSchedule)
      );
    });

  // for optimization, build up an object for each tournament and an array for each draw with target matchUps
  // keep track of matchUps counts per participant and don't add matchUps for participants beyond those limits
  const matchUpMap =
    matchUpPotentialParticipantIds && matchUpNotBeforeTimes
      ? matchUpsToSchedule.reduce(
          (aggregator, matchUp) => {
            const { drawId, tournamentId } = matchUp;

            if (!aggregator.matchUpMap[tournamentId]) aggregator.matchUpMap[tournamentId] = {};
            if (!aggregator.matchUpMap[tournamentId][drawId]) {
              aggregator.matchUpMap[tournamentId][drawId] = [matchUp];
            } else {
              aggregator.matchUpMap[tournamentId][drawId].push(matchUp);
            }

            // since this matchUp is to be scheduled, update the matchUpPotentialParticipantIds
            processNextMatchUps({
              matchUpPotentialParticipantIds,
              matchUpNotBeforeTimes,
              matchUp,
            });

            return aggregator;
          },
          { matchUpMap: {} },
        ).matchUpMap
      : {};

  return { matchUpsToSchedule, matchUpMap };
}
