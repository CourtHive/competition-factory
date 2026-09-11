import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureGroups } from '@Query/structure/getStructureGroups';

import { SUCCESS } from '@Constants/resultConstants';

export function resequenceStructures({
  drawDefinition,
  tournamentRecord,
  disableNotice,
  event,
}: {
  drawDefinition: any;
  tournamentRecord?: any;
  disableNotice?: boolean;
  event?: any;
}) {
  const { maxQualifyingDepth, structureProfiles } = getStructureGroups({
    drawDefinition,
  });

  for (const structure of drawDefinition.structures) {
    const profile = structureProfiles[structure.structureId];
    if (profile.distanceFromMain) {
      structure.stageSequence = maxQualifyingDepth + 1 - profile.distanceFromMain;
    }
  }

  if (!disableNotice) {
    modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  }

  return { ...SUCCESS };
}
