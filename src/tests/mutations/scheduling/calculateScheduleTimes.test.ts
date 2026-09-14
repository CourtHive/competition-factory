import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

it('can calculste Schedule Times', () => {
  const venueProfiles = [
    {
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 3,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
  });
  competitionEngine.setState(tournamentRecord);
  const { startDate } = competitionEngine.getCompetitionDateRange();

  const { scheduleTimes } = competitionEngine.calculateScheduleTimes({
    scheduleDate: startDate,
  });

  expect(scheduleTimes.length).toEqual(23);
});
