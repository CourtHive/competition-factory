import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { CURTIS } from '@Constants/drawDefinitionConstants';

/**
 * ONE `updatedAt` PER TOUCHED ENTITY PER CALL (F2 (i), CA 2026-10-19; outcome v2 executor plan, Phase C).
 *
 * A stamp means "changed in this call". v1 used to stamp at each notice, so one first-round score moved the draw's
 * stamp on by 2 ms in a single call (a notice for the matchUp scored and one for the matchUp its winner went to). The
 * engine call's ledger (`getCapturedStamps`, opened with the captured clock) now keeps an entity's first stamp of the
 * call. v2 writes the same values (`outcome/ops.ts` `nextStamp`), and `differential` compares them by value.
 *
 * Under a fixed clock every stamp of the call is T, or the previous stamp + 1 ms when that is already T or later.
 */
const T = '2026-10-24T12:00:00.000Z';
const ms = (stamp?: string) => new Date(stamp as string).getTime();
/** F2 (i)'s one stamp: T, or 1 ms past the previous stamp when that is already T or later */
const oneStampAfter = (previous?: string) => (!previous || ms(previous) < ms(T) ? ms(T) : ms(previous) + 1);

afterEach(() => {
  setClock();
});

function firstRoundDraw({ drawType }: { drawType?: string } = {}) {
  setClock(T);
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'd', ...(drawType ? { drawType } : {}) }],
    nonRandom: 1,
    setState: true,
  });
  const firstRound = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.filter((matchUp: any) => matchUp.roundNumber === 1 && !matchUp.structureName?.includes('Play'))
    .slice(0, 2);
  const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  return { firstRound, outcome };
}

const drawDefinition = () => tournamentEngine.getEvent({ drawId: 'd' }).drawDefinition;
const storedMatchUp = (matchUpId: string) => tournamentEngine.findMatchUp({ drawId: 'd', matchUpId }).matchUp;

it('moves the draw stamp on once for a call that raises several notices for it', () => {
  const { firstRound, outcome } = firstRoundDraw();
  const before = ms(drawDefinition().updatedAt);
  // CONTROL: generation stamped the draw at or past T, so the call moves it on by exactly 1 ms
  expect(before).toBeGreaterThanOrEqual(ms(T));

  const result = tournamentEngine.setMatchUpStatus({ matchUpId: firstRound[0].matchUpId, outcome, drawId: 'd' });
  expect(result.success).toEqual(true);
  // two matchUps written, two MODIFY_MATCHUP notices, each stamping the draw: one stamp
  expect(ms(drawDefinition().updatedAt) - before).toEqual(1);
});

it('stamps each matchUp the call writes once', () => {
  const { firstRound, outcome } = firstRoundDraw();
  const scored = firstRound[0].matchUpId;
  const winnerTo = firstRound[0].winnerMatchUpId;
  const scoredBefore = storedMatchUp(scored).updatedAt;
  const winnerToBefore = storedMatchUp(winnerTo).updatedAt;

  tournamentEngine.setMatchUpStatus({ matchUpId: scored, outcome, drawId: 'd' });

  expect(ms(storedMatchUp(scored).updatedAt)).toEqual(oneStampAfter(scoredBefore));
  expect(ms(storedMatchUp(winnerTo).updatedAt)).toEqual(oneStampAfter(winnerToBefore));
});

it('stamps the draw once for an executionQueue that scores two matchUps', () => {
  const { firstRound, outcome } = firstRoundDraw();
  const before = ms(drawDefinition().updatedAt);

  const result: any = tournamentEngine.executionQueue(
    firstRound.map((matchUp: any) => ({
      params: { matchUpId: matchUp.matchUpId, outcome, drawId: 'd' },
      method: 'setMatchUpStatus',
    })),
  );
  expect(result.success).toEqual(true);
  // CONTROL: both were scored
  for (const matchUp of firstRound) expect(storedMatchUp(matchUp.matchUpId).winningSide).toEqual(1);
  expect(ms(drawDefinition().updatedAt) - before).toEqual(1);
});

it('still moves the stamp on in each of two calls, under a fixed clock', () => {
  const { firstRound, outcome } = firstRoundDraw();
  const before = ms(drawDefinition().updatedAt);

  for (const matchUp of firstRound)
    tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId: 'd' });

  // a new call is a new ledger: the second call's stamp is past the first's, though both read T
  expect(ms(drawDefinition().updatedAt) - before).toEqual(2);
});

/**
 * ONLY THE STRUCTURE THE MATCHUP IS IN. A matchUp notice stamps the draw and the one top-level structure holding the
 * matchUp; until 2026-10-24 it stamped every top-level structure, so a CURTIS main score stamped its Play Off.
 */
it("stamps the matchUp's own structure, and not a structure the result never reaches", () => {
  const { firstRound, outcome } = firstRoundDraw({ drawType: CURTIS });
  const structureNamed = (name: string) =>
    drawDefinition().structures.find((structure: any) => structure.structureName?.includes(name));
  // CONTROL: CURTIS has a play-off, and the main first-round score does not reach it
  expect(structureNamed('Play')).toBeDefined();
  const playOffBefore = structureNamed('Play').updatedAt;
  const mainBefore = structureNamed('Main').updatedAt;

  tournamentEngine.setMatchUpStatus({ matchUpId: firstRound[0].matchUpId, outcome, drawId: 'd' });

  expect(structureNamed('Play').updatedAt).toEqual(playOffBefore);
  expect(ms(structureNamed('Main').updatedAt)).toEqual(oneStampAfter(mainBefore));
});
