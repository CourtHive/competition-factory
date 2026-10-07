import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';

/**
 * The round trip F2 left open (CA, 2026-10-07: "fix that one finding now"). Census w2 9100377 (MFIC 16/11): the
 * `Main|2|1` loser goes to the consolation, passes a BYE, and arrives at `Consolation|3|2` where the WALKOVER that
 * `Consolation|2|3`'s double walkover produced stands pending; by RULE 2 they win it and go on to `4|1`. Then `Main|2|1`
 * is relabelled a WALKOVER: the loser now exits at the origin, and the exit has to be carried in, where it converges
 * with the produced one — exactly the state the draw is in when the WALKOVER is entered first.
 *
 * It was not: `relabelLoserExit` saw a matchUp with a result and refused the carry, so `3|2` stayed won by a
 * participant who was exiting, and they stayed in `4|1`. That win was the cascade's own award, not a result a director
 * recorded; it is taken back and the exit carried. A result the loser EARNED onward still stands.
 */
const drawId = 'relabel-back-to-exit';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const occupants = (m: any) => m.sides.map((side: any) => side.participantId).filter(Boolean);
const projection = (k: string) => {
  const m = find(k);
  return [m.matchUpStatus, m.winningSide, m.drawPositions, occupants(m)];
};
const config = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 9100377,
  drawSize: 16,
};
const base: [string, any][] = [
  ['Main|1|4', { winningSide: 2 }],
  ['Main|1|5', { winningSide: 1 }],
  ['Main|2|2', { winningSide: 2 }],
  ['Consolation|2|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 1 }],
];

afterEach(() => setOutcomePipeline());

function play(steps: [string, any][]) {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  expect(prepareDraw(config as any, drawId)).toEqual(true);
  for (const [k, outcome] of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(result.error, k).toBeUndefined();
  }
}

const valid = () => (tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid;

it('a walkover entered first: the carried exit converges with the produced one, and nobody stands in 4|1', () => {
  play([...base, ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }]]);
  expect(find('Consolation|3|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('Consolation|3|2').winningSide).toBeUndefined();
  expect(occupants(find('Consolation|4|1'))).toEqual([]);
  expect(valid()).toEqual(true);
});

it('played first, then relabelled a walkover: the award is taken back and the exit carried, to the same state', () => {
  play([...base, ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }]]);
  const walkoverFirst = ['Consolation|3|2', 'Consolation|4|1'].map(projection);

  play([...base, ['Main|2|1', { winningSide: 1 }]]);
  const loser = find('Main|2|1').sides.find((side: any) => side.sideNumber === 2).participantId;
  // CONTROL: the loser won the produced walkover on arrival and stands in 4|1
  expect(find('Consolation|3|2').matchUpStatus).toEqual(WALKOVER);
  expect(occupants(find('Consolation|4|1'))).toContain(loser);

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find('Main|2|1').matchUpId,
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(find('Consolation|3|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(occupants(find('Consolation|4|1'))).toEqual([]);
  expect(find('Consolation|4|1').matchUpStatus).toEqual(WALKOVER);
  expect(valid()).toEqual(true);
  expect(['Consolation|3|2', 'Consolation|4|1'].map(projection)).toEqual(walkoverFirst);
});

it('the full round trip: walkover, played, walkover again ends where the walkover alone ends', () => {
  play([...base, ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }]]);
  const walkoverFirst = ['Consolation|3|2', 'Consolation|4|1'].map(projection);

  play([
    ...base,
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    // F2 (#5275): the loser, no longer exiting, wins the produced walkover and goes on
    ['Main|2|1', { winningSide: 1 }],
    // and back (#5276): the award is taken back and the exit carried in again
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ]);
  expect(find('Consolation|3|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(occupants(find('Consolation|4|1'))).toEqual([]);
  expect(valid()).toEqual(true);
  expect(['Consolation|3|2', 'Consolation|4|1'].map(projection)).toEqual(walkoverFirst);
});
