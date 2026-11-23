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
import { FEMALE, MALE } from '@Constants/genderConstants';
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

  const { participantsCount, participantType, largestTeamDraw, largestTeamSize, gendersCount, teamGenders } =
    getParticipantsCount({
      participantsProfile,
      eventProfiles,
      drawProfiles,
    });

  const teamKey = participantsProfile?.teamKey;
  // the profile's own pool, then the call's (an undefined top-level `uuids` replaced the profile's)
  const idPool = participantsProfile?.uuids ?? uuids;

  const generated = generateParticipants({
    consideredDate: startDate,
    consideredEndDate: tournamentRecord?.endDate,
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

  // generate Team participants: each team is dealt the men and women its tieFormat's gendered collections need, then
  // filled to size from whoever is left, in order. Dealt in order alone, a team could lack a gender its lines need.
  const individuals = participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  const ofSex = (sex: string) => individuals.filter(({ person }) => person?.sex === sex).map(getParticipantId);
  const queues = { [MALE]: ofSex(MALE), [FEMALE]: ofSex(FEMALE) };
  const dealt = new Set<string>();
  const take = (ids: string[], count: number) => {
    const taken = ids.filter((id) => !dealt.has(id)).slice(0, count);
    taken.forEach((id) => dealt.add(id));
    return taken;
  };
  // two passes: every team's gendered minimum first, then the fill to size, so an early team's fill cannot use up the
  // men or women a later team needs
  const teamMembers = generateRange(0, largestTeamDraw).map(() => [
    ...take(queues[MALE], teamGenders[MALE]),
    ...take(queues[FEMALE], teamGenders[FEMALE]),
  ]);
  const everyone = individuals.map(getParticipantId);
  teamMembers.forEach((members) => members.push(...take(everyone, largestTeamSize - members.length)));
  const idPrefix = participantsProfile?.idPrefix ? `${TEAM}-${participantsProfile.idPrefix}` : undefined;
  const teamParticipants: Participant[] = generateRange(0, largestTeamDraw).map((teamIndex) => {
    const individualParticipantIds = teamMembers[teamIndex];
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
