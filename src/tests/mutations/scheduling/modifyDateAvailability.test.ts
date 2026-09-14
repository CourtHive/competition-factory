import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

it('recognizes scheduled matchUps when court dateAvailability changes', () => {
  const startDate = '2022-09-30';
  const endDate = '2022-10-02';

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

  competitionEngine.setState(tournamentRecord);

  const { rounds } = competitionEngine.getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  let result = competitionEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = competitionEngine.scheduleProfileRounds();
  expect(result.dateSchedulingProfiles[0].venues[0].rounds.map(({ roundTiming }) => roundTiming?.roundMinutes)).toEqual(
    [1440, 720, 360, 180, 90],
  );
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(23);

  result = competitionEngine.getVenuesAndCourts();
  const { courtId, dateAvailability } = result.courts[0];
  const modifiedDateAvailability = dateAvailability.slice(2);

  const courts = result.courts.map((court) =>
    court.courtId === courtId ? { ...court, dateAvailability: modifiedDateAvailability } : court,
  );
  const modifications = { courts };

  result = competitionEngine.modifyVenue({
    modifications,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.getVenuesAndCourts();
  const court = result.courts[0];
  expect(court.dateAvailability.length).toEqual(2);
  expect(dateAvailability.length).toEqual(4);
});
