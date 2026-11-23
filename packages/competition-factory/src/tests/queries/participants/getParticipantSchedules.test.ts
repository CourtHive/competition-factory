import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('can return participant scheduled matchUps', () => {
  const startDate = '2022-09-24';
  const endDate = '2022-09-28';

  const venueProfiles = [{ courtsCount: 3 }];
  const {
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { rounds } = tournamentEngine.getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  let result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.dateSchedulingProfiles[0].venues[0].rounds.map(({ roundTiming }) => roundTiming?.roundMinutes)).toEqual(
    [1440, 720, 360, 180, 90],
  );
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(23);

  result = tournamentEngine.getParticipantSchedules();
  expect(result.participantSchedules.map(({ matchUps }) => matchUps.length)).toEqual([
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  ]);
  expect(result.participantSchedules.map(({ potentialMatchUps }) => potentialMatchUps.length)).toEqual([
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
  ]);
});
