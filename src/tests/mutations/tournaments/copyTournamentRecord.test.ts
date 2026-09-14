import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { addDays } from '@Tools/dateTime';

test('can copy a tournamentRecord', () => {
  const startDate = '2024-05-01';
  const tournamentId = 'tid';
  mocksEngine.generateTournamentRecord({ startDate, tournamentId, drawProfiles: [{ drawSize: 8 }], setState: true });
  let result = tournamentEngine.copyTournamentRecord();
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.copyTournamentRecord({ startDate: addDays(startDate, 7) });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.copyTournamentRecord({
    tournamentName: 'Tournament Copy',
    startDate: addDays(startDate, 7),
  });
  expect(result.tournamentRecord.tournamentName).toEqual('Tournament Copy');
  expect(result.tournamentRecord.tournamentId).not.toEqual(tournamentId);
});
