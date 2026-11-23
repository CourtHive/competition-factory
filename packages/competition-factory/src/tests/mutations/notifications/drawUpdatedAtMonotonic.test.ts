import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, test } from 'vitest';
import { setClock } from '@Tools/clock';

/**
 * `drawDefinition.updatedAt` (and each touched structure's) is an ORDERING stamp: every mutation must
 * leave it strictly greater than before. It bumped only when the clock read EXACTLY the previous
 * stamp, so under a fixed clock three updates gave T, T+1, T: the third went backwards. A clock that
 * moved backwards was not caught at all. `stampMatchUpUpdatedAt` already bumps on `<=`; draws now do.
 *
 * Under a frozen clock the stamp therefore runs ahead of "now". It orders updates; it does not record
 * when one occurred.
 */
afterEach(() => {
  setClock();
});

const FIXED = '2026-10-01T12:00:00.000Z';

function setup() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16 }], setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  const drawStamps = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    return {
      draw: new Date(drawDefinition.updatedAt).getTime(),
      structure: new Date(drawDefinition.structures[0].updatedAt).getTime(),
    };
  };
  const score = (index: number) => {
    const { matchUpId } = matchUps[index];
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  };
  return { drawStamps, score };
}

test('under a fixed clock, repeated updates advance the draw and structure stamps every time', () => {
  setClock(FIXED);
  const { drawStamps, score } = setup();

  let previous = drawStamps();
  for (let index = 0; index < 4; index++) {
    score(index);
    const current = drawStamps();
    expect(current.draw).toBeGreaterThan(previous.draw);
    expect(current.structure).toBeGreaterThan(previous.structure);
    previous = current;
  }
});

test('a clock moved backwards still leaves the stamps ahead of the previous ones', () => {
  setClock(FIXED);
  const { drawStamps, score } = setup();
  score(0);
  const before = drawStamps();

  setClock(Date.parse(FIXED) - 60 * 60 * 1000);
  score(1);
  const after = drawStamps();
  expect(after.draw).toBeGreaterThan(before.draw);
  expect(after.structure).toBeGreaterThan(before.structure);
});
