import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

test('mocksEngine supports devContext', () => {
  const { tournamentRecord } = mocksEngine.devContext(true).generateTournamentRecord();
  expect(tournamentRecord).not.toBeUndefined();
});
