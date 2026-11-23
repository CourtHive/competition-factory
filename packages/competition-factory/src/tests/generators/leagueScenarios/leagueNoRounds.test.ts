import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { instanceCount } from '@Tools/arrays';

it('can generate Teams from drawProfiles without persisting events', () => {
  const matchUpCount = 2;
  const tieFormat = {
    collectionDefinitions: [
      {
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        collectionOrder: 1,
        matchUpValue: 1,
        gender: MIXED,
        matchUpCount,
      },
      {
        collectionName: 'Singles',
        matchUpType: SINGLES,
        collectionOrder: 2,
        matchUpValue: 1,
        gender: MALE,
        matchUpCount,
      },
      {
        collectionName: 'Singles',
        matchUpType: SINGLES,
        collectionOrder: 2,
        matchUpValue: 1,
        gender: FEMALE,
        matchUpCount,
      },
    ],
    winCriteria: { aggregateValue: true },
  };

  const teamNames = ['Team One', 'Team Two'];
  const drawSize = 4;
  const mockProfile = {
    participantsProfile: { participantsCount: 0 }, // do not generate participants unless specified by drawProfile(s)
    drawProfiles: [
      {
        eventType: TEAM_EVENT,
        addEvent: false, // do not add event to tournamentRecord, only generate participants
        generate: false,
        teamNames,
        tieFormat,
        drawSize,
      },
    ],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    setState: true,
    ...mockProfile,
  });

  const participantResult = tournamentEngine.getParticipants({ withIndividualParticipants: true });
  const teams = participantResult.participants.filter((p) => p.participantType === TEAM_PARTICIPANT);

  for (const team of teams) {
    const counts = instanceCount(team.individualParticipants.map((i) => i.person.sex));
    expect(counts.FEMALE).toEqual(matchUpCount);
    expect(counts.MALE).toEqual(matchUpCount);
  }

  expect(teams.map((team) => team.participantName).slice(0, 2)).toEqual(teamNames);

  const teamIndividualParticipants = teams
    .reduce((acc, team) => {
      acc.push(...team.individualParticipantIds);
      return acc;
    }, [])
    .map((participantId) => participantResult.participantMap[participantId]);

  const gendersCount = 2;
  expect(teamIndividualParticipants.length).toEqual(drawSize * matchUpCount * gendersCount);

  expect(tournamentRecord.events).toBeUndefined();
});
