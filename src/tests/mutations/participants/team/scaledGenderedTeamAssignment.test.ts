import { participantScaleItem } from '@Query/participant/participantScaleItem';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import { RANKING } from '@Constants/scaleConstants';

it('can generate balanced gendered teams for Mixed Gender events', () => {
  const GOLD_TEAM_SIZE = 8;
  const eventId = 'eid';
  const drawId = 'did';
  const drawSize = 8;
  const C18U = '18U';

  const mockProfile = {
    participantsProfile: { category: { categoryName: '18U' }, scaleAllParticipants: true },
    tournamentName: 'Gold Team Challenge',
    setState: true,
    drawProfiles: [
      {
        tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
        category: { ageCategoryCode: C18U },
        eventType: TEAM_EVENT,
        buildTeams: false,
        generate: false,
        drawSize,
        eventId,
        drawId,
      },
    ],
  };

  mocksEngine.generateTournamentRecord(mockProfile);

  const participants = tournamentEngine.getParticipants().participants;

  // expect that teams are generated but have no individualParticipantIds
  const entries = tournamentEngine.getEvent({ eventId }).event.entries;
  const teamParticipantIds = entries.map((entry) => entry.participantId);
  const enteredTeams = participants.filter((p) => teamParticipantIds.includes(p.participantId));
  expect(enteredTeams.every((team) => !team.individualParticipantIds.length)).toBe(true);

  const individualParticipants = participants.filter((p) => p.participantType === INDIVIDUAL);
  const individualParticipantsCount = drawSize * GOLD_TEAM_SIZE;
  const femaleParticipants = individualParticipants
    .filter((p) => p.person.sex === FEMALE)
    .slice(0, individualParticipantsCount / 2);
  const maleParticipants = individualParticipants
    .filter((p) => p.person.sex === MALE)
    .slice(0, individualParticipantsCount / 2);

  expect(femaleParticipants.length).toBe(maleParticipants.length);
  expect(femaleParticipants.length).toBe(individualParticipantsCount / 2);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: C18U,
  };

  const scaledFemaleParticipants = femaleParticipants.map((participant) => ({
    scaleValue: participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue,
    participantId: participant.participantId,
  }));
  let result = tournamentEngine.scaledTeamAssignment({
    scaledParticipants: scaledFemaleParticipants,
    teamParticipantIds,
  });
  expect(result.success).toBe(true);

  const scaledMaleParticipants = maleParticipants.map((participant) => ({
    scaleValue: participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue,
    participantId: participant.participantId,
  }));
  result = tournamentEngine.scaledTeamAssignment({
    scaledParticipants: scaledMaleParticipants,
    clearExistingAssignments: false,
    teamParticipantIds,
  });
  expect(result.success).toBe(true);

  const teamsWithIndividualParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantIds: teamParticipantIds },
    withIndividualParticipants: true,
  }).participants;
  expect(teamsWithIndividualParticipants.every((team) => team.individualParticipantIds.length === GOLD_TEAM_SIZE)).toBe(
    true,
  );

  const teamRankingProfiles = teamsWithIndividualParticipants.map((team) => {
    return team.individualParticipants.map((participant) => {
      const scaleItem = participantScaleItem({ participant, scaleAttributes })?.scaleItem;
      return { gender: participant.person.sex, value: scaleItem?.scaleValue };
    });
  });

  /**
   * Team Males and Females have been separately waterfalled by ranking value
   * This test confirms that the ranking values are in the expected order
   */
  teamRankingProfiles.forEach((teamRankingProfile, i) => {
    if (i) {
      const previousTeamRankingProfile = teamRankingProfiles[i - 1];
      teamRankingProfile.forEach((rankingProfile, j) => {
        const previousRankingProfile = previousTeamRankingProfile[j];
        const expectLess = j % 2;
        if (expectLess) {
          expect(rankingProfile.value).toBeLessThanOrEqual(previousRankingProfile.value);
        } else {
          expect(rankingProfile.value).toBeGreaterThanOrEqual(previousRankingProfile.value);
        }
      });
    }
  });
});
