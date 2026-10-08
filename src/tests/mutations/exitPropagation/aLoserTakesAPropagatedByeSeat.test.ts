import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A loser directed onto a seat a double exit's BYE took is placed there: `directLoser`'s `holdsPropagatedBye` clause.
 *
 * S2D item 6 asked whether the clause was still reachable once #5154 refused a direct double exit beside an unreached
 * seat. Instrumented on dev 2026-10-06, it decided a placement 700 times across 56 test files and in every census
 * window. Playing all 600 matrix cells with it switched off gave identical final draws. But the full suite found this
 * one: sweep seed 6141627 (COMPASS 16/14), shrunk from 30 steps to 6, every step legal. Without the clause, relabelling
 * `East|1|2`'s walkover as a default returns ERR_OCCUPIED_DRAW_POSITION after the draw had already changed
 * (`ERROR_IMPLIES_NO_MUTATION`), because the loser's seat holds a BYE the cascade put there, which the clause lets
 * them take.
 *
 * **2026-10-08: the BYE this sequence produced was itself a divergence.** After the clear of `East|1|3`, the occupant of
 * `West|2|1` had arrived past the `West|1|1` BYE carrying `East|1|2`'s walkover, and the `West|1|2` double walkover's
 * convergence stamp replaced that carried exit with `{ BYE }` from its paired previous matchUp (fixed in
 * `keepCarriedExitOnPairedSide`). Forward play — the same results without the `East|1|3` detour — leaves the carried
 * exit in place, decides `West|2|1` for side 2, and sends the walked-over occupant on to Southwest drawPosition 1. The
 * corrected path now does the same, so the seat holds that participant, not a BYE. The `holdsPropagatedBye` clause is
 * still reached, and is pinned by `carriedExitProvenance.test.ts`'s seed 6141627 case, which fails without it.
 */
const drawId = 'loser-takes-propagated-bye';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

afterEach(() => setOutcomePipeline());

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
}

it('relabelling a walkover as a default after a cleared convergence keeps the seat and the draw valid', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = { participantsCount: 14, propagateExitStatus: true, drawSize: 16, drawType: COMPASS, seed: 6141627 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 });
  score('East|1|3', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });
  score('East|1|3', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED });

  // CONTROL: Southwest's drawPosition 1 holds the occupant who carried `East|1|2`'s walkover — as forward play leaves it
  const southwestSeat = () =>
    getDrawDefinition(drawId)
      .structures.find((structure: any) => structure.structureName === 'Southwest')
      .positionAssignments.find((assignment: any) => assignment.drawPosition === 1);
  expect(southwestSeat().participantId).toBeDefined();
  expect(southwestSeat().bye).toBeFalsy();

  // the relabel to a default succeeds over that state, and the draw stays valid
  score('East|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(southwestSeat().participantId).toBeDefined();
  expect(southwestSeat().bye).toBeFalsy();
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(true);
});
