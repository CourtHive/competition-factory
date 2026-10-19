import {
  getDrawMatchUps,
  getDrawDefinition,
  observeMutation,
  clearOutcome,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A RELEASED POSITION TAKES ITS ARRIVAL WITH IT (census A1 group R4: case 25, FIRST_MATCH_LOSER_CONSOLATION 16/13,
 * seed 20483283, under `allowChangePropagation`).
 *
 * A double walkover at `Main|2|4` makes `Consolation|2|4` a BYE, so dp 3 wins `Consolation|3|2` on the walkover there
 * and arrives in `Consolation|4|1`, which records the arrival: `{ previousMatchUpStatus: WALKOVER, sourceMatchUpId }`
 * naming `3|2`. Clearing the double walkover takes the BYE back, `3|2` is undecided again, and dp 3 is released from
 * `4|1`, but the arrival stayed, naming a source that had sent nobody (ARRIVAL_TRUE). Provenance "records where each
 * side came from" (exit-propagation.md); `releaseAdvancedDrawPosition` now withdraws the arrival the released
 * position's feeder left, and the round trip restores the draw exactly.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const view = (matchUp: any) => ({
  drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
  sideExitProvenance: matchUp.sideExitProvenance,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

/** The census replay: a step whose matchUp does not hold two participants is skipped; a refusal is part of the schedule. */
function schedule({ config, policy, steps, drawId }: { config: any; policy?: any; steps: Step[]; drawId: string }) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policy)).toEqual(true);
  for (const step of steps) {
    const target = find(drawId, coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
}

/** Apply the probe to the scheduled draw, then clear it. */
function probeAndClear(drawId: string, probe: Step) {
  const { matchUpId } = find(drawId, coordinate(probe));
  const forward = observeMutation({ propagateExitStatus: true, matchUpId, outcome: probe.outcome, drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();
}

const CASE_25 = {
  config: {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 13,
    seed: 20483283,
    drawSize: 16,
  },
  steps: [
    at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|2', { winningSide: 2 }),
    at('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|7', { winningSide: 1 }),
    at('Main|1|6', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|2|2', { winningSide: 1 }),
    at('Main|1|2', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Main|1|5', { winningSide: 1 }),
    at('Main|1|5', { winningSide: 1 }),
    at('Main|1|5', { winningSide: 1 }),
    at('Main|1|6', { winningSide: 1 }),
    at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|3', { winningSide: 1 }),
    at('Consolation|1|3', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|3|1', { winningSide: 1 }),
    at('Main|2|3', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|7', { winningSide: 1 }),
    at('Main|1|2', { winningSide: 2 }),
    at('Main|1|4', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|2|2', { winningSide: 1 }),
    at('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  ],
  probe: at('Main|2|4', { matchUpStatus: DOUBLE_WALKOVER }),
};

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

it('the released dp 3 leaves no arrival in Consolation|4|1, and the round trip restores the draw', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const drawId = 'released-position-arrival';
  schedule({ ...CASE_25, drawId });
  const before = projectDraw(getDrawDefinition(drawId));
  const held = view(find(drawId, 'Consolation|4|1'));
  probeAndClear(drawId, CASE_25.probe);
  expect(view(find(drawId, 'Consolation|4|1'))).toEqual(held);
  expect(projectDraw(getDrawDefinition(drawId))).toEqual(before);
});
