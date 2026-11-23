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

  // CODES Phase 2 promoted HOME_PARTICIPANT_ID to first-class matchUp.schedule.homeParticipantId.
  // Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
  const firstClassHomeParticipantId = matchUp?.schedule?.homeParticipantId;

  const { itemValue: legacyHomeParticipantId, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: HOME_PARTICIPANT_ID,
  });

  const homeParticipantId = firstClassHomeParticipantId ?? legacyHomeParticipantId;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { homeParticipantId }
    : schedule;
}
