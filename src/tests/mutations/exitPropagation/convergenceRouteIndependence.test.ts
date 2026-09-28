import { runPath, type Step } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE IS THE SAME DRAW WHICHEVER ROUTE REACHED IT.
 *
 * **Punch-list P42, the propagation half.** Two exits delivered into one matchUp are a double exit.
 * Ordinary play reaches that through `handleEmptyExitLoser`; a single exit RE-SCORED UP to a double
 * reaches it through `advanceFromTarget`, at a matchUp whose occupant the same mutation has just
 * removed. The two routes left different draws at 52 of 192 cells of `correctionDivergence`'s UPGRADE
 * arm, and it took two changes to close them. Each consequence is pinned here on the smallest draw
 * that shows it, because the sweep says THAT a cell diverged and these say WHY.
 *
 * Compared by the harness's coordinate signature, so a difference in status, winningSide,
 * drawPositions or provenance at ANY matchUp fails — not only at the coordinate each test names.
 */

const SEED = 9000230;
const asDouble = { matchUpStatus: DOUBLE_WALKOVER };
const asSingle = { matchUpStatus: WALKOVER, winningSide: 1 };
const cleared = { matchUpStatus: TO_BE_PLAYED, winningSide: undefined, score: undefined };

const at = (structureName: string, roundPosition: number, outcome: any): Step => ({
  roundNumber: 1,
  structureName,
  roundPosition,
  outcome,
});

function signatures(drawType: string, drawSize: number, steps: Step[], drawId: string) {
  setSubscriptions({});
  const { signature, refusals } = runPath(
    { drawType, drawSize, participantsCount: drawSize, seed: SEED, propagateExitStatus: true },
    steps,
    drawId,
  );
  // CONTROL: a refused step means the two draws did not run the same experiment
  expect(refusals, `${drawId} ran every step`).toEqual([]);
  return Object.fromEntries(signature);
}

it('a seat advanced by a produced exit survives the removal of whoever later sat in it', () => {
  // NOT a re-score: the matchUp being corrected never holds a double exit. Score it, clear it, and
  // the draw must be where it was.
  for (const drawType of [FIRST_ROUND_LOSER_CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION]) {
    const untouched = signatures(drawType, 8, [at('Main', 1, asDouble)], 'untouched');
    const scoredAndCleared = signatures(
      drawType,
      8,
      [at('Main', 1, asDouble), at('Main', 2, asSingle), at('Main', 2, cleared)],
      'scored-and-cleared',
    );

    // CONTROL: the advancement under test exists — the produced exit advanced the seat beside it
    expect(untouched['Consolation|2|1'], `${drawType}: the pending winner's seat advanced`).toMatch(/dp=[\d.]+/);
    expect(untouched['Consolation|1|1']).toMatch(/^WALKOVER ws=2 /);

    expect(scoredAndCleared, `${drawType}: a cleared result leaves no trace`).toEqual(untouched);
  }
});

it('a convergence reached by re-scoring matches the one reached directly', () => {
  const direct = signatures(
    FIRST_ROUND_LOSER_CONSOLATION,
    8,
    [at('Main', 1, asDouble), at('Main', 2, asDouble)],
    'direct',
  );
  const rescored = signatures(
    FIRST_ROUND_LOSER_CONSOLATION,
    8,
    [at('Main', 2, asSingle), at('Main', 1, asDouble), at('Main', 2, asDouble)],
    'rescored',
  );

  // CONTROL: the convergence happened, and it is one by the record and not only by the status
  expect(direct['Consolation|1|1']).toEqual(
    'DOUBLE_WALKOVER ws=- dp=1.2 prov=1:DOUBLE_WALKOVER->WALKOVER,2:DOUBLE_WALKOVER->WALKOVER',
  );

  // the consequence, which is what diverged: TO_BE_PLAYED holding the WRONG seat and no provenance
  expect(rescored['Consolation|2|1']).toEqual(direct['Consolation|2|1']);
  expect(rescored['Consolation|2|1']).toMatch(/^WALKOVER .*prov=1:DOUBLE_WALKOVER->WALKOVER$/);

  expect(rescored).toEqual(direct);
});

it('an exit carried through a BYE on a re-score is awarded to the side yet to arrive', () => {
  const direct = signatures(
    FIRST_MATCH_LOSER_CONSOLATION,
    8,
    [at('Main', 1, asDouble), at('Main', 2, asDouble)],
    'direct',
  );
  const rescored = signatures(
    FIRST_MATCH_LOSER_CONSOLATION,
    8,
    [at('Main', 2, asSingle), at('Main', 1, asDouble), at('Main', 2, asDouble)],
    'rescored',
  );

  // CONTROL: the hop under test is a BYE, and the exit went through it
  expect(direct['Consolation|2|1']).toMatch(/^BYE /);
  // CA, 2026-09-20: the side carrying the exit does not win it; the side yet to arrive does
  expect(direct['Consolation|3|1']).toMatch(/^WALKOVER ws=2 /);

  expect(rescored['Consolation|3|1'], 'the occupant this mutation removed is not seen as advancing').toEqual(
    direct['Consolation|3|1'],
  );
  expect(rescored).toEqual(direct);
});

it('a convergence does not walk its own loser link, whose seat the first exit already resolved', () => {
  const direct = signatures(COMPASS, 16, [at('East', 1, asDouble), at('East', 2, asDouble)], 'direct');
  const rescored = signatures(
    COMPASS,
    16,
    [at('East', 2, asSingle), at('East', 1, asDouble), at('East', 2, asDouble)],
    'rescored',
  );

  // CONTROL: the convergence is in West, and South is what its loser link feeds
  expect(direct['West|1|1']).toMatch(/^DOUBLE_WALKOVER /);
  expect(direct['South|1|1']).toMatch(/^BYE /);

  // South|2|1 side 1 is the seat the loser of West|1|2 arrives into: nobody delivered an exit there
  expect(rescored['South|2|1']).toMatch(/^TO_BE_PLAYED .*prov=-$/);
  expect(rescored).toEqual(direct);
});
