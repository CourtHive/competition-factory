import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants and types
import { HOME_PARTICIPANT_ID } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';
import { MATCHUP } from '@Constants/attributeConstants';

export function getHomeParticipantId(params: ScheduledMatchUpArgs) {
  const { timeStamp, schedule, matchUp } = params;
  const paramsCheck = checkRequiredParameters(params, [{ [MATCHUP]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { itemValue: homeParticipantId, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: HOME_PARTICIPANT_ID,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { homeParticipantId }
    : schedule;
}
