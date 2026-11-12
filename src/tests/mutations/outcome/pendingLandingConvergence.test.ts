import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * 2a (outcome v2, after-1c ruling): a loser carrying an exit into its loser matchUp, where a PENDING exit a double exit
 * produced stands on the other side with no winner. v1 converges them by `progressExitStatus` RULE 4 (its gate asks
 * whether the opponent has itself exited, not who won), writing the double exit through `setMatchUpState` with its
 * score blank, then produces on from it. v2 plans the same convergence (`convergenceAt`'s pending landing).
 *
 * The early-exit census arm (`exitBeforeArrivalCensus`), CURTIS_CONSOLATION 32/31 seed 9700109, shrunk from 24 steps to
 * 15: the census first caught v2's convergence leaving the landing's score absent where v1 blanks it.
 */

const entries = vi.hoisted(() => ({ cascades: 0 }));

vi.mock('@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doubleExitAdvancement: (args: any) => {
      entries.cascades += 1;
      return actual.doubleExitAdvancement(args);
    },
  };
});

const drawId = 'pending-landing-convergence';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);

const STEPS: [string, any][] = [
  ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|7', { winningSide: 1 }],
  ['Main|1|10', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|2|4', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|1|2', { winningSide: 2 }],
  ['Main|2|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|1|8', { winningSide: 2 }],
  ['Main|1|11', { winningSide: 2 }],
  ['Main|3|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|12', { winningSide: 1 }],
  ['Main|2|6', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|3|3', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|1|9', { winningSide: 2 }],
];

afterEach(() => setOutcomePipeline());

function play(mode: OutcomePipelineMode) {
  setOutcomePipeline(mode);
  setSubscriptions({});
  const config = { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: CURTIS_CONSOLATION };
  expect(prepareDraw({ ...config, seed: 9700109 } as any, drawId)).toEqual(true);
  for (const [k, outcome] of STEPS)
    tournamentEngine.setMatchUpStatus({ matchUpId: find(k).matchUpId, propagateExitStatus: true, outcome, drawId });

  // CONTROL: the landing holds a pending default a double default produced, nobody winning it, and the matchUp after
  // it holds that exit's reservation (the landing's own position, advanced ahead of the arrival it awaits)
  const landing = find('Consolation 2|2|1');
  expect([landing.matchUpStatus, landing.winningSide, landing.drawPositions]).toEqual([DEFAULTED, undefined, [1]]);
  expect(Object.keys(landing.sideExitProvenance)).toEqual(['2']);
  expect(landing.sideExitProvenance[2].previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(find('Consolation 2|3|1').drawPositions).toEqual([1]);

  entries.cascades = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 2 },
    matchUpId: find('Main|4|2').matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();
  const converged = find('Consolation 2|2|1');
  const onward = find('Consolation 2|3|1');
  const draw = getDrawMatchUps(drawId)
    .map(({ matchUpId, matchUpStatus, winningSide, drawPositions, sideExitProvenance, score, matchUpStatusCodes }) =>
      JSON.stringify({
        matchUpId,
        matchUpStatus,
        winningSide,
        drawPositions,
        sideExitProvenance,
        score,
        matchUpStatusCodes,
      }),
    )
    .sort();
  return { converged, onward, draw, cascades: entries.cascades };
}

it('a carried default onto a pending produced default converges as v1 writes it, planned by v2', () => {
  const v1 = play('v1');
  const v2 = play('v2');

  // the two defaults meet: a DOUBLE_DEFAULT nobody wins, its score blank (`setMatchUpState`'s nested score write;
  // the draws below compare every score byte for byte)
  expect(v1.converged.matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(v1.converged.winningSide).toBeUndefined();
  expect(v1.converged.score?.scoreStringSide1 || v1.converged.score?.scoreStringSide2).toBeFalsy();
  // the reservation is taken back (`withdrawOwnAdvancement`) and the produced default stands pending, no position
  expect([v1.onward.matchUpStatus, v1.onward.winningSide, v1.onward.drawPositions ?? []]).toEqual([
    DEFAULTED,
    undefined,
    [],
  ]);
  expect(v2.draw).toEqual(v1.draw);

  // v1 cascades through `doubleExitAdvancement`; under v2 the call is planned and v1 never runs
  expect(v1.cascades).toBeGreaterThan(0);
  expect(v2.cascades).toEqual(0);
});
