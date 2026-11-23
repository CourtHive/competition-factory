import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INVALID_DATE } from '@Constants/errorConditionConstants';

test('can create a tournamentRecord', () => {
  let result = tournamentEngine.createTournamentRecord();
  expect(result.tournamentId).toBeDefined();
  result = tournamentEngine.createTournamentRecord({ tournamentName: 'Tournament Name' });
  expect(result.tournamentName).toEqual('Tournament Name');
  expect(result.tournamentId).toBeDefined();
  result = tournamentEngine.createTournamentRecord({ startDate: 'foo' });
  expect(result.error).toEqual(INVALID_DATE);
});

test('validates activeDates during creation', () => {
  const startDate = '2024-05-01';
  const endDate = '2024-05-07';

  // valid activeDates within range
  let result = tournamentEngine.createTournamentRecord({
    activeDates: [startDate, '2024-05-03', '2024-05-05'],
    startDate,
    endDate,
  });
  expect(result.tournamentId).toBeDefined();
  expect(result.activeDates).toEqual([startDate, '2024-05-03', '2024-05-05']);

  // activeDates before startDate
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['2024-04-30', '2024-05-03'],
    startDate,
    endDate,
  });
  expect(result.error).toEqual(INVALID_DATE);

  // activeDates after endDate
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['2024-05-03', '2024-05-08'],
    startDate,
    endDate,
  });
  expect(result.error).toEqual(INVALID_DATE);

  // invalid date string in activeDates
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['not-a-date'],
    startDate,
    endDate,
  });
  expect(result.error).toEqual(INVALID_DATE);

  // falsy values are filtered out
  result = tournamentEngine.createTournamentRecord({
    activeDates: [startDate, '', null, '2024-05-05'],
    startDate,
    endDate,
  });
  expect(result.tournamentId).toBeDefined();
  expect(result.activeDates).toEqual([startDate, '2024-05-05']);

  // activeDates without startDate/endDate derives them from min/max
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['2024-05-03', '2024-05-01', '2024-05-05'],
  });
  expect(result.tournamentId).toBeDefined();
  expect(result.activeDates).toEqual(['2024-05-03', '2024-05-01', '2024-05-05']);
  expect(result.startDate).toEqual('2024-05-01');
  expect(result.endDate).toEqual('2024-05-05');

  // activeDates with only startDate derives endDate
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['2024-05-01', '2024-05-03', '2024-05-05'],
    startDate,
  });
  expect(result.tournamentId).toBeDefined();
  expect(result.startDate).toEqual(startDate);
  expect(result.endDate).toEqual('2024-05-05');

  // activeDates with only endDate derives startDate
  result = tournamentEngine.createTournamentRecord({
    activeDates: ['2024-05-01', '2024-05-03', '2024-05-05'],
    endDate,
  });
  expect(result.tournamentId).toBeDefined();
  expect(result.startDate).toEqual('2024-05-01');
  expect(result.endDate).toEqual(endDate);
});
