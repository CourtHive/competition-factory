import { requireParams } from '@Helpers/parameters/requireParams';

import { MISSING_PARTICIPANT_IDS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SCALE } from '@Constants/timeItemConstants';

export function removeParticipantsScaleItems({ tournamentRecord, scaleAttributes, participantIds }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!participantIds) return { error: MISSING_PARTICIPANT_IDS };
  if (!scaleAttributes) return { error: MISSING_VALUE, info: 'scaleAttributes required' };

  const { scaleType, eventType, scaleName } = scaleAttributes;
  const itemType = [SCALE, scaleType, eventType, scaleName].join('.');
  tournamentRecord.participants?.forEach((participant) => {
    if (participantIds.includes(participant.participantId) && participant.timeItems) {
      participant.timeItems = participant.timeItems.filter((timeItem) => {
        return timeItem && timeItem?.itemType !== itemType;
      });
    }
  });

  return { ...SUCCESS };
}
