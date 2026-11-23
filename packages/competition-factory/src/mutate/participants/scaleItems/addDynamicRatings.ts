import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { setParticipantScaleItem } from './addScaleItems';

// constants
import { OBJECT, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function addDynamicRatings(params) {
  const { tournamentRecord, modifiedScaleValues, removePriorValues } = params;
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { modifiedScaleValues: true, [OF_TYPE]: OBJECT },
  ]);
  if (paramsCheck.error) return paramsCheck;

  for (const participantId in modifiedScaleValues) {
    const result = setParticipantScaleItem({
      scaleItem: modifiedScaleValues[participantId],
      removePriorValues,
      tournamentRecord,
      participantId,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
