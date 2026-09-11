import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('handles devContext objects', () => {
  let result = tournamentEngine.devContext(true);
  expect(result.success).toEqual(true);

  let devContext = tournamentEngine.getDevContext();
  expect(devContext).toEqual(true);

  result = tournamentEngine.devContext({ WOWO: true });
  expect(result.success).toEqual(true);
  devContext = tournamentEngine.getDevContext();
  expect(devContext).toEqual({ WOWO: true });

  devContext = tournamentEngine.getDevContext({ WOWO: true });
  expect(devContext).toEqual({ WOWO: true });

  // providing getDevContext with a object to match produces false when there are not matching properties
  devContext = tournamentEngine.getDevContext({ FOO: true });
  expect(devContext).toEqual(false);

  devContext = tournamentEngine.getDevContext();
  expect(devContext).toEqual({ WOWO: true });
});
