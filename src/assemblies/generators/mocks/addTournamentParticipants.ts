import { createTeamsFromParticipantAttributes } from '@Mutate/participants/createTeamsFromAttributes';
import { getParticipantId } from '@Functions/global/extractors';
import { generateParticipants } from './generateParticipants';
import { getParticipantsCount } from './getParticipantsCount';
import { addParticipantsRecorded } from './recordedWrites';
import { generateRange } from '@Tools/arrays';

// constants and types
import type { MockDrawProfile, MockEventProfile, MockParticipantsProfile } from '@Types/mocksTypes';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { genParticipantId } from './genParticipantId';
import { SUCCESS } from '@Constants/resultConstants';

type AddTournamentParticipantsArgs = {
  participantsProfile?: MockParticipantsProfile;
  tournamentRecord: Tournament;
  random?: () => number;
  eventProfiles?: MockEventProfile[];
  drawProfiles?: MockDrawProfile[];
  startDate?: string;
  uuids?: string[];
};
export function addTournamentParticipants({
  participantsProfile,
  tournamentRecord,
  eventProfiles,
  drawProfiles,
  startDate,
  random,
  uuids,
}: AddTournamentParticipantsArgs) {
  if (participantsProfile?.participantsCount === 0) return { addedCount: 0, ...SUCCESS };

  const { participantsCount, participantType, largestTeamDraw, largestTeamSize, gendersCount } = getParticipantsCount({
    participantsProfile,
    eventProfiles,
    drawProfiles,
  });

  const teamKey = participantsProfile?.teamKey;
  // the profile's own pool, then the call's (an undefined top-level `uuids` replaced the profile's)
  const idPool = participantsProfile?.uuids ?? uuids;

  const generated = generateParticipants({
    consideredDate: startDate,
    ...participantsProfile,
    participantsCount,
    participantType,
    uuids: idPool,
    gendersCount,
    random,
  });
  if (generated.error) return generated;
  const participants = generated.participants as Participant[];

  let addedCount = 0;
  let result = addParticipantsRecorded({ tournamentRecord, participants });
  if (result.error) return result;
  addedCount += result.addedCount;

  if (teamKey) {
    // the teams are built, then added as a client adds participants: the build writes nothing itself
    const built = createTeamsFromParticipantAttributes({
      tournamentRecord,
      ...teamKey,
      addParticipants: false,
    });
    if (built.error) return built;
    const teams = 'newParticipants' in built ? built.newParticipants : [];
    const result = addParticipantsRecorded({ tournamentRecord, participants: teams });
    if (result.error) return result;
  }

  // generate Team participants
  const allIndividualParticipantIds = participants
    .filter(({ participantType }) => participantType === INDIVIDUAL)
    .map(getParticipantId);
  const idPrefix = participantsProfile?.idPrefix ? `${TEAM}-${participantsProfile.idPrefix}` : undefined;
  const teamParticipants: Participant[] = generateRange(0, largestTeamDraw).map((teamIndex) => {
    const individualParticipantIds = allIndividualParticipantIds.slice(
      teamIndex * largestTeamSize,
      (teamIndex + 1) * largestTeamSize,
    );
    const participantId = genParticipantId({
      index: teamIndex,
      participantType,
      uuids: idPool,
      idPrefix,
      random,
    });

    return {
      participantName: `Team ${teamIndex + 1}`,
      participantRole: COMPETITOR,
      individualParticipantIds,
      participantType: TEAM,
      participantId,
    };
  });

  result = addParticipantsRecorded({
    participants: teamParticipants,
    tournamentRecord,
  });
  if (result.error) return result;
  addedCount += result.addedCount;

  return { addedCount, ...SUCCESS };
}
