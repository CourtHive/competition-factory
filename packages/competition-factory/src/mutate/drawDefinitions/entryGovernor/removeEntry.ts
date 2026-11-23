import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';

// constants and types
import { DrawDefinition, StageTypeUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  MISSING_DRAW_DEFINITION,
  MISSING_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

type RemoveEntryArgs = {
  autoEntryPositions?: boolean;
  drawDefinition: DrawDefinition;
  stages?: StageTypeUnion[];
  participantId: string;
};

export function removeEntry({ autoEntryPositions = true, drawDefinition, participantId, stages }: RemoveEntryArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  const assignedParticipantIds =
    getAssignedParticipantIds({
      drawDefinition,
      stages,
    }).assignedParticipantIds ?? [];
  const isAssignedParticipant = assignedParticipantIds.includes(participantId);

  if (isAssignedParticipant) return { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT };

  if (drawDefinition?.entries) {
    drawDefinition.entries = drawDefinition.entries.filter((entry) => entry.participantId !== participantId);
  }

  if (autoEntryPositions) {
    drawDefinition.entries = refreshEntryPositions({
      entries: drawDefinition.entries,
    });
  }

  modifyDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}
