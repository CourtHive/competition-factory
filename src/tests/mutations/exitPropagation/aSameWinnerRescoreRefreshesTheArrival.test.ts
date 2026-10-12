import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RE-SCORE THAT KEEPS THE WINNER REWRITES THE ARRIVAL THAT WINNER LEFT ONWARD (census policy-off 20500008, 2026-10-12).
 *
 * COMPASS 16/16, `doubleExitPropagateBye: false`. `West|1|3` is a double walkover, so `West|2|2` is a produced exit
 * waiting for `West|1|4`'s winner. Miro wins `West|1|4` by default and arrives: `West|2|2` is a WALKOVER for him, and
 * his side records the arrival, `previousMatchUpStatus: DEFAULTED`. The director then corrects `West|1|4` to a played
 * win for the same Miro.
 *
 * A same-winner re-score re-directs into the seat the winner already holds, so nothing rewrote the arrival: it still
 * read DEFAULTED, where entering the played result directly records COMPLETED. The two routes to the same result must
 * leave the same record.
 *
 * Falsified: without `refreshArrivalsFrom` the corrected arrival reads DEFAULTED.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 20500008 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
type Step = [string, any];

const SETUP: Step[] = [
  ['East|1|8', { winningSide: 1 }],
  ['East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['East|1|7', { winningSide: 1 }],
  ['East|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const result = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error, coordinates).toBeUndefined();
  }
}

function arrival(drawId: string) {
  const matchUpId = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === 'West|2|2').matchUpId;
  const stored = getDrawDefinition(drawId)
    .structures.flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);
  expect(stored.matchUpStatus).toEqual(WALKOVER);
  return stored.sideExitProvenance?.[stored.winningSide];
}

it('the arrival records the default while the default stands', () => {
  play('defaulted', [...SETUP, ['West|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }]]);
  expect(arrival('defaulted')?.previousMatchUpStatus).toEqual(DEFAULTED);
});

it('a default corrected to a played win for the same winner records what entering the win directly records', () => {
  play('direct', [...SETUP, ['West|1|4', { winningSide: 1 }]]);
  expect(arrival('direct')?.previousMatchUpStatus).toEqual(COMPLETED);
  play('corrected', [
    ...SETUP,
    ['West|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['West|1|4', { winningSide: 1 }],
  ]);
  expect(arrival('corrected')?.previousMatchUpStatus).toEqual(COMPLETED);
});
