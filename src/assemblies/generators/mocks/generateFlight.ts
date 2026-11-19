import { addEventEntriesRecorded, addFlightRecorded } from './recordedWrites';
import { getQualifyingEntryPlan } from '@Helpers/entries/getQualifyingEntryPlan';
import { getParticipantId } from '@Functions/global/extractors';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { Entry, Event, Participant, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import type { MockDrawProfile } from '@Types/mocksTypes';

export function generateFlight({
  qualifyingParticipants = [],
  qualifyingPositions = 0,
  autoEntryPositions,
  tournamentRecord,
  drawParticipants,
  drawProfile,
  event,
}: {
  qualifyingParticipants?: Participant[];
  /** the MAIN places held for qualifiers: drawProfile.qualifyingPositions, or derived from its qualifyingProfiles */
  qualifyingPositions?: number;
  autoEntryPositions?: boolean;
  tournamentRecord: Tournament;
  drawParticipants: Participant[];
  drawProfile: MockDrawProfile;
  event: Event;
}) {
  const { drawType = SINGLE_ELIMINATION, drawSize = 0, drawName, drawId } = drawProfile;
  const stage = (drawProfile.stage ?? MAIN) as StageTypeUnion;

  const entriesCount = drawSize - qualifyingPositions;

  const drawParticipantIds = drawParticipants.slice(0, entriesCount).map(getParticipantId);

  if (drawParticipantIds.length) {
    const result = addEventEntriesRecorded({
      participantIds: drawParticipantIds,
      autoEntryPositions,
      entryStage: stage,
      tournamentRecord,
      event,
    });
    if (result.error) return result;
  }

  const drawEntries: Entry[] = drawParticipantIds.map((participantId) => ({
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: stage,
    participantId,
  }));

  // the drawProfile's qualifying structures are entered as the top-level path enters them (addQualifyingEntries)
  const qualifyingParticipantIds = qualifyingParticipants.map(getParticipantId);
  let qualifyingIndex = 0;
  for (const { participantsCount, entryStageSequence, roundTarget } of getQualifyingEntryPlan(
    drawProfile.qualifyingProfiles,
  )) {
    const participantIds = qualifyingParticipantIds.slice(qualifyingIndex, qualifyingIndex + participantsCount);
    qualifyingIndex += participantsCount;
    if (!participantIds.length) continue;

    const result = addEventEntriesRecorded({
      entryStage: QUALIFYING,
      entryStageSequence,
      autoEntryPositions,
      tournamentRecord,
      participantIds,
      roundTarget,
      event,
    });
    if (result.error) return result;

    participantIds.forEach((participantId) =>
      drawEntries.push({ entryStatus: DIRECT_ACCEPTANCE, entryStage: QUALIFYING, entryStageSequence, participantId }),
    );
  }

  const result = addFlightRecorded({
    drawName: drawName || drawType,
    qualifyingPositions,
    drawEntries,
    drawId: drawId as string, // addFlightRecorded assigns one when the profile names none
    event,
    stage,
  });
  if (result.error) {
    return result;
  }

  return { ...SUCCESS };
}
