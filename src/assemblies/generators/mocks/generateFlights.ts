import { generateFlight } from './generateFlight';

import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function generateFlights({
  uniqueDrawParticipants,
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
    const requiresUniqueParticipants = uniqueParticipants || gender || category || stage === QUALIFYING;

    // if a drawProfile has specified uniqueParticipants...
    const drawParticipants = requiresUniqueParticipants
      ? uniqueDrawParticipants.slice(uniqueParticipantsIndex, uniqueParticipantsIndex + entriesCount)
      : stageParticipants[stage || MAIN] ?? [];

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
