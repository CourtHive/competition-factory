import { addDrawDefinitionExtension } from '../extensions/addRemoveExtensions';
import { getParticipantIds } from '@Functions/global/extractors';
import { intersection } from '@Tools/arrays';

import { PARTICIPANT_REPRESENTATIVES } from '@Constants/extensionConstants';
import { DRAW_DEFINITION_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';

export function setDrawParticipantRepresentativeIds({ representativeParticipantIds, drawDefinition }) {
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  if (!Array.isArray(representativeParticipantIds)) return { error: INVALID_VALUES };

  const enteredParticipantIds = getParticipantIds(drawDefinition?.entries ?? []);

  // An empty array is valid; if ids provided...
  // check that all representativeParticipantIds are enteredParticipantIds
  if (
    representativeParticipantIds.length &&
    intersection(representativeParticipantIds, enteredParticipantIds).length < representativeParticipantIds.length
  ) {
    return { error: INVALID_VALUES };
  }

  const extension = {
    name: PARTICIPANT_REPRESENTATIVES,
    value: representativeParticipantIds,
  };

  return addDrawDefinitionExtension({ drawDefinition, extension });
}
