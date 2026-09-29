import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants
import { DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * `reconcileDecider` RETURNS THE ERROR OF THE WRITE IT MAKES.
 *
 * It was a bare call in a function that returned nothing. If the write to the decider failed, the
 * decider stayed as it was and `setMatchUpStatus` reported success — the caller was told the draw
 * was settled when it was not.
 *
 * ## This is FAULT INJECTION, and that is all it is
 *
 * The write is made to fail by replacing `modifyMatchUpScore`. Nothing in ordinary play makes it
 * fail here: the matchUp is handed to it directly. Over the 600 matrix cells under both policies —
 * 1,200 draws played to exhaustion — the engine returns NO error at all, so this test says nothing
 * about what the engine does in play. It pins one thing: IF the write fails, the caller hears of it.
 *
 * It does not assert the draw is unchanged. By the time the decider is reconciled the final has been
 * scored, and CA's standing ruling is that nothing in this cascade snapshots or restores.
 */

const forced = vi.hoisted(() => ({ context: undefined as string | undefined, hits: 0 }));
const FORCED_ERROR = { code: 'ERR_FORCED', message: 'forced by the test' };

vi.mock('@Mutate/matchUps/score/modifyMatchUpScore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    modifyMatchUpScore: (params: any) => {
      if (forced.context && params?.context === forced.context) {
        forced.hits += 1;
        return { error: FORCED_ERROR };
      }
      return actual.modifyMatchUpScore(params);
    },
  };
});

afterEach(() => {
  forced.context = undefined;
  forced.hits = 0;
});

const DRAW_ID = 'decider-error';
const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const final = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Main' && matchUp.roundNumber === 4);
const decider = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Decider');

function playToTheFinal() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawType: DOUBLE_ELIMINATION, drawSize: 8 }],
    nonRandom: 7001,
    setState: true,
  });
  for (let guard = 0; guard < 40; guard++) {
    const next = allMatchUps().find(
      (matchUp) =>
        matchUp.matchUpId !== final().matchUpId &&
        matchUp.structureName !== 'Decider' &&
        matchUp.matchUpStatus === TO_BE_PLAYED &&
        !matchUp.winningSide &&
        (matchUp.sides ?? []).filter((side: any) => side.participantId).length === 2,
    );
    if (!next) break;
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: next.matchUpId,
      outcome: { winningSide: 1 },
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);
  }
  // CONTROL: the final is ready to be scored and the decider has not been settled
  expect((final().sides ?? []).filter((side: any) => side.participantId).length).toEqual(2);
  expect(decider().matchUpStatus).toEqual(TO_BE_PLAYED);
}

it('settles the decider and reports success when the write succeeds', () => {
  playToTheFinal();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: final().matchUpId,
    outcome: { winningSide: 1 },
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  expect(decider().matchUpStatus).toEqual(DEAD_RUBBER);
  // CONTROL on the injection: with nothing forced, nothing was intercepted
  expect(forced.hits).toEqual(0);
});

it('returns the error when the write to the decider fails', () => {
  playToTheFinal();
  forced.context = 'reconcileDecider';

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: final().matchUpId,
    outcome: { winningSide: 1 },
    drawId: DRAW_ID,
  });

  // CONTROL: the write was attempted, and it was the one made to fail
  expect(forced.hits).toEqual(1);
  expect(result.success).toBeUndefined();
  expect(result.error).toEqual(FORCED_ERROR);
});
