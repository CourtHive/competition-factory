import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

test('hasParticipantsCount value filters matchUps', () => {
  const startDate = '2023-06-16';
  const venueId = 'vid';
  const drawId = 'did';
  const drawSize = 16;

  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId, courtsCount: 3 }],
    drawProfiles: [{ drawId, drawSize: 16 }],
    startDate: '2023-06-16',
    endDate: '2023-06-22',
    setState: true,
  });

  const matchUps = tournamentEngine.allCompetitionMatchUps({
    nextMatchUps: true,
    inContext: true,
  }).matchUps;

  const scheduleMatchUps = {
    params: { scheduledDate: startDate, matchUps },
    method: 'proAutoSchedule',
  };

  // First schedule all matchUps
  let result = tournamentEngine.executionQueue([scheduleMatchUps]);
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps();
  expect(result.dateMatchUps.length).toEqual(drawSize - 1);

  result = tournamentEngine.competitionScheduleMatchUps({ contextFilters: { hasParticipantsCount: 2 } });
  expect(result.dateMatchUps.length).toEqual(drawSize / 2);
});
