import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getMatchUpFormatRecoveryTimes } from './getMatchUpFormatRecoveryTimes';
import { getMatchUpFormatAverageTimes } from './getMatchUpFormatAverageTimes';
import { getScheduleTiming } from './getScheduleTiming';

// constants and types
import { DOUBLES_SINGLES, SINGLES_DOUBLES } from '@Constants/scheduleConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Event, Tournament, EventTypeUnion } from '@Types/tournamentTypes';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ResultType } from '@Types/factoryTypes';

type GetMatchUpFormatTimingArgs = {
  defaultRecoveryMinutes?: number;
  defaultAverageMinutes?: number;
  tournamentRecord: Tournament;
  matchUpFormat: string;
  categoryName?: string;
  categoryType?: string;
  eventType?: EventTypeUnion;
  event?: Event;
};

export function getMatchUpFormatTiming({
  defaultAverageMinutes = 90,
  defaultRecoveryMinutes = 0,
  tournamentRecord,
  matchUpFormat,
  categoryName,
  categoryType,
  eventType,
  event,
}: GetMatchUpFormatTimingArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  // event is optional, so eventType can also be passed in directly
  eventType = eventType ?? event?.eventType ?? SINGLES_EVENT;
  const defaultTiming = {
    averageTimes: [{ minutes: { default: defaultAverageMinutes } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  const { scheduleTiming } = getScheduleTiming({
    tournamentRecord,
    categoryName,
    categoryType,
    event,
  });

  const timingDetails = {
    ...scheduleTiming,
    matchUpFormat,
    categoryType,
    defaultTiming,
  };

  return matchUpFormatTimes({ eventType, timingDetails });
}

type MatchUpFormatTimesArgs = {
  eventType: EventTypeUnion;
  timingDetails: any;
};
export function matchUpFormatTimes({ timingDetails, eventType }: MatchUpFormatTimesArgs): ResultType & {
  typeChangeRecoveryMinutes?: number;
  recoveryMinutes?: number;
  averageMinutes?: number;
} {
  const averageTimes = getMatchUpFormatAverageTimes(timingDetails);
  const averageKeys = Object.keys(averageTimes?.minutes ?? {});

  const averageMinutes =
    averageTimes?.minutes &&
    ((averageKeys?.includes(eventType) && averageTimes.minutes[eventType]) || averageTimes.minutes.default);

  const recoveryTimes = getMatchUpFormatRecoveryTimes({
    ...timingDetails,
    averageMinutes,
  });

  const recoveryKeys = Object.keys(recoveryTimes?.minutes ?? {});
  const recoveryMinutes =
    recoveryTimes?.minutes &&
    ((recoveryKeys?.includes(eventType) && recoveryTimes.minutes[eventType]) || recoveryTimes.minutes.default);

  const formatChangeKey = isMatchUpEventType(SINGLES_EVENT)(eventType) ? SINGLES_DOUBLES : DOUBLES_SINGLES;

  const typeChangeRecoveryMinutes =
    recoveryTimes?.minutes &&
    ((recoveryKeys?.includes(formatChangeKey) && recoveryTimes.minutes[formatChangeKey]) || recoveryMinutes);

  return { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes };
}
