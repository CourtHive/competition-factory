import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('can return version from all engines', () => {
  let result = tournamentEngine.version();
  expect(result).not.toBeUndefined();
  result = tournamentEngine.version();
  expect(result).not.toBeUndefined();
  result = mocksEngine.version();
  expect(result).not.toBeUndefined();
  result = tournamentEngine.credits();
  expect(result).not.toBeUndefined();
});
