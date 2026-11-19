import { getDrawProfileQualifyingPositions } from '@Query/drawDefinition/getStageParticipantsCount';
import { getQualifyingEntriesCount } from '@Helpers/entries/getQualifyingEntryPlan';
import { generateFlight } from './generateFlight';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ANY } from '@Constants/genderConstants';

// types
import type { Event, Participant, Tournament } from '@Types/tournamentTypes';
import type { MockDrawProfile } from '@Types/mocksTypes';

export function generateFlights({
  uniqueParticipants: eventUniqueParticipants = false,
  useExistingParticipants = false,
  uniqueDrawParticipants,
  autoEntryPositions,
  stageParticipants,
  tournamentRecord,
  drawProfiles,
  category,
  gender,
  event,
}: {
  /** the event generates its own participants for every draw (see generateEventWithFlights) */
  uniqueParticipants?: boolean;
  useExistingParticipants?: boolean;
  uniqueDrawParticipants: Participant[];
  autoEntryPositions?: boolean;
  stageParticipants: { [key: string]: Participant[] };
  tournamentRecord: Tournament;
  drawProfiles: MockDrawProfile[];
  category?: unknown;
  gender?: string;
  event: Event;
}) {
  let uniqueParticipantsIndex = 0;
  const takeUnique = (count: number) => {
    const taken = uniqueDrawParticipants.slice(uniqueParticipantsIndex, uniqueParticipantsIndex + count);
    uniqueParticipantsIndex += count;
    return taken;
  };

  for (const drawProfile of drawProfiles) {
    const { uniqueParticipants, stage = MAIN, drawSize = 0 } = drawProfile;
    const qualifyingPositions = getDrawProfileQualifyingPositions(drawProfile);

    const entriesCount = drawSize - qualifyingPositions;
    // Mirror getStageParticipantsCount: when caller passed preset participants
    // to generateTournamentRecord, pull from stageParticipants (the supplied
    // pool) rather than from uniqueDrawParticipants (which is empty because
    // event-level synthesis was skipped).
    // `gender: ANY` means "no gender constraint" — see getParticipantsCount.ts.
    const requiresUniqueParticipants =
      !useExistingParticipants &&
      (eventUniqueParticipants || uniqueParticipants || (gender && gender !== ANY) || category || stage === QUALIFYING);

    // if a drawProfile has specified uniqueParticipants...
    const drawParticipants = requiresUniqueParticipants
      ? takeUnique(entriesCount)
      : (stageParticipants[stage || MAIN] ?? []);

    // the entries of the drawProfile's own qualifying structures: unique, as getStageParticipantsCount counts them
    const qualifyingEntriesCount = getQualifyingEntriesCount(drawProfile.qualifyingProfiles);
    const qualifyingParticipants = useExistingParticipants
      ? (stageParticipants[QUALIFYING] ?? []).slice(0, qualifyingEntriesCount)
      : takeUnique(qualifyingEntriesCount);

    const result = generateFlight({
      qualifyingParticipants,
      autoEntryPositions,
      qualifyingPositions,
      drawParticipants,
      tournamentRecord,
      drawProfile,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}
