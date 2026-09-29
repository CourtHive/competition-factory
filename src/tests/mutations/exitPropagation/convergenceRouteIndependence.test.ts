import { runPath, type Step } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
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
    {
      // these are the shapes a double exit leaves when it produces an EXIT — see `PRODUCED_EXIT_POLICY`
      doubleExitPropagateBye: false,
      participantsCount: drawSize,
      propagateExitStatus: true,
      seed: SEED,
      drawType,
      drawSize,
    },
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
    expect(untouched['Consolation|2|1'], `${drawType}: the pending winner's seat advanced`).toMatch(/dp=(BYE\.)?\d+/);
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

it('an exit carried through a BYE is pending on both routes', () => {
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
  // pending: the exit is recorded on its side and awards nobody until an opponent arrives
  expect(direct['Consolation|3|1']).toMatch(/^WALKOVER ws=- dp=- prov=1:DOUBLE_WALKOVER->WALKOVER$/);

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

it('a pending exit is awarded when its opponent arrives, to the side that arrived', () => {
  // P44. The convergence awards nobody and holds no seat; this is what makes that safe.
  const drawId = 'arrival';
  const before = signatures(
    FIRST_ROUND_LOSER_CONSOLATION,
    8,
    [at('Main', 1, asDouble), at('Main', 2, asDouble)],
    drawId,
  );
  // CONTROL: pending — the produced exit, its origin, and neither a seat nor a winner
  expect(before['Consolation|2|1']).toEqual('WALKOVER ws=- dp=- prov=1:DOUBLE_WALKOVER->WALKOVER');

  const find = (structureName: string, roundNumber: number, roundPosition: number): any =>
    (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );
  const complete = (structureName: string, roundPosition: number) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, matchUpStatus: 'COMPLETED' },
      matchUpId: find(structureName, 1, roundPosition).matchUpId,
      drawId,
    });
    expect(result.success, `${structureName}|1|${roundPosition}`).toEqual(true);
  };

  // two ordinary results in Main send two losers into Consolation|1|2, and they play
  complete('Main', 3);
  complete('Main', 4);
  complete('Consolation', 2);

  const settled = find('Consolation', 2, 1);
  expect(settled.matchUpStatus).toEqual(WALKOVER);
  const winner = (settled.sides ?? []).find((side: any) => side.sideNumber === settled.winningSide);
  expect(winner?.participantId, 'the award goes to somebody who is there').toBeTruthy();
  // the winner's own entry records an ARRIVAL (they won upstream); the delivered exit is opposite
  expect(settled.sideExitProvenance?.[settled.winningSide]?.previousMatchUpStatus).not.toEqual(DOUBLE_WALKOVER);
  expect(settled.sideExitProvenance?.[3 - settled.winningSide]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
});
