import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

type ParticipantInEntriesArgs = {
  drawDefinition: DrawDefinition;
  participantId: string;
  entryStatus?: string;
  entryStage?: string;
};
export function participantInEntries({
  participantId,
  drawDefinition,
  entryStatus,
  entryStage,
}: ParticipantInEntriesArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const inEntries = drawDefinition.entries?.find(
    (entry) =>
      entry.participantId === participantId &&
      (!entryStatus || entryStatus === entry.entryStatus) &&
      (!entryStage || entryStage === entry.entryStage),
  );
  return participantId && inEntries;
}
