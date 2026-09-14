import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { extractDate, extractTime } from '@Tools/dateTime';

// constants
import { BYE } from '@Constants/matchUpStatusConstants';

export function addScheduleItem(params) {
  const {
    participantMap,
    participantId,
    matchUpStatus,
    roundPosition,
    structureId,
    matchUpType,
    roundNumber,
    matchUpId,
    potential,
    schedule,
    drawId,
    score,
  } = params;
  if (!schedule || !Object.keys(schedule).length) return;

  const ignoreMatchUp = matchUpStatus === BYE;
  if (!ignoreMatchUp) {
    participantMap[participantId].scheduleItems.push({
      ...schedule,
      scheduledDate: extractDate(schedule?.scheduledDate),
      scheduledTime: extractTime(schedule?.scheduledTime),
      checkScoreHasValue: checkScoreHasValue({ score }),
      matchUpStatus,
      roundPosition,
      structureId,
      matchUpType,
      roundNumber,
      matchUpId,
      potential,
      drawId,
    });
  }
}
