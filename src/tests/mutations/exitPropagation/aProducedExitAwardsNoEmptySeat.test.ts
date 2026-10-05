import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * Q3, a second path (CA 2026-10-03 "land pending", 2026-10-04 "BYE holder, exit sent on"): a produced exit
 * is awarded only to an opponent IN PLACE. A seat a BYE advanced forward, still waiting for the loser fed
 * into it from another structure, holds a drawPosition and nobody.
 *
 * Census w1 9000477 (COMPASS 32/29), its first seven steps. `South|1|3` converges into a double walkover
 * whose produced exit reaches `South|2|2`, where dp 7 was BYE-advanced from `South|1|4` and holds no
 * participant. Two writers awarded it: `conditionallyAdvanceDrawPosition` (`South|2|2`) and the arrival of
 * the empty dp 7 into the next produced exit (`South|3|1`). When the seat's real occupant later arrived,
 * `South|3|1` held two positions from one feeder.
 */
const drawId = 'no-empty-seat-award';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const occupants = (m: any) => m.sides.filter((side: any) => side?.participantId).length;

afterEach(() => setOutcomePipeline());

it('a produced exit reaching a seat nobody occupies lands pending, there and one round on', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  const config = { participantsCount: 29, propagateExitStatus: true, drawSize: 32, drawType: COMPASS, seed: 9000477 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  const steps: [string, any][] = [
    ['East|1|12', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['East|1|8', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }],
    ['East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['East|1|3', { winningSide: 1 }],
    ['East|1|10', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { winningSide: 1 }],
  ];
  for (const [k, outcome] of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(result.error, k).toBeUndefined();
  }

  for (const k of ['South|2|2', 'South|3|1']) {
    const matchUp = find(k);
    // CONTROL: the shape is reached, a produced exit beside a seat that holds a drawPosition and nobody
    expect(matchUp.matchUpStatus, k).toEqual(WALKOVER);
    expect(occupants(matchUp), k).toEqual(0);
    expect(matchUp.drawPositions.filter(Boolean).length, k).toEqual(1);
    // and nothing is awarded to that seat
    expect(matchUp.winningSide, k).toBeUndefined();
  }
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? []).toEqual([]);
});
