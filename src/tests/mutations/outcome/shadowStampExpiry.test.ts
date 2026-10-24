import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

/**
 * THE SHADOW'S STAMP NORMALISATION HAS AN EXPIRY (debate-ruled 2026-10-24, pending CA review).
 *
 * S1's `differential` shadow comparison leaves structure stamps out and reads matchUp and draw stamps as present or
 * absent, because v1 stamps once per NOTICE: one first-round score in a single elimination draw moves the draw's stamp
 * on by 2 ms in the one call, a notice for each matchUp it writes. F2 (i) (CA 2026-10-19) says once per call, 1 ms on
 * from a stamp already as late as the call's instant, and Phase C changes v1 to match. When it does, this test fails:
 * take the normalisation out of `outcome/shadow.ts` with it, and compare stamps by value.
 */
const T = '2026-10-24T12:00:00.000Z';

afterEach(() => {
  setClock();
});

it('v1 still stamps the draw once per notice, so the shadow still normalises stamps', () => {
  setClock(T);
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8, drawId: 'd' }], nonRandom: 1, setState: true });
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1);
  const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const stampOf = () => new Date(tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition.updatedAt).getTime();
  const before = stampOf();
  // CONTROL: generation stamped the draw past the call's instant, so F2 (i) would move it on by exactly 1 ms
  expect(before).toBeGreaterThanOrEqual(new Date(T).getTime());
  const result = tournamentEngine.setMatchUpStatus({ matchUpId: first.matchUpId, outcome, drawId: 'd' });
  expect(result.success).toEqual(true);
  // F2 (i): 1; v1: one per notice, the matchUp scored and the one its winner went to
  expect(stampOf() - before).toEqual(2);
});
