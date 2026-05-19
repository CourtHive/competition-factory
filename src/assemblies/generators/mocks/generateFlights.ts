import { generateFlight } from './generateFlight';

import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function generateFlights({
  uniqueDrawParticipants,
  useExistingParticipants = false,
  autoEntryPositions,
  stageParticipants,
  tournamentRecord,
  drawProfiles,
  category,
  gender,
  event,
}) {
  let uniqueParticipantsIndex = 0;
  for (const drawProfile of drawProfiles) {
    const { qualifyingPositions = 0, uniqueParticipants, stage = MAIN, drawSize = 0 } = drawProfile;

    const entriesCount = drawSize - qualifyingPositions;
    // Mirror getStageParticipantsCount: when caller passed preset participants
    // to generateTournamentRecord, pull from stageParticipants (the supplied
    // pool) rather than from uniqueDrawParticipants (which is empty because
    // event-level synthesis was skipped).
    const requiresUniqueParticipants =
      !useExistingParticipants && (uniqueParticipants || gender || category || stage === QUALIFYING);

    // if a drawProfile has specified uniqueParticipants...
    const drawParticipants = requiresUniqueParticipants
      ? uniqueDrawParticipants.slice(uniqueParticipantsIndex, uniqueParticipantsIndex + entriesCount)
      : (stageParticipants[stage || MAIN] ?? []);

    if (requiresUniqueParticipants) uniqueParticipantsIndex += entriesCount;

    const result = generateFlight({
      autoEntryPositions,
      drawParticipants,
      tournamentRecord,
      drawProfile,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
