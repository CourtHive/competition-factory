import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT FED BY A BYE MATCHUP KEEPS ITS BYE WHEN ITS LAST CLAIM GOES (census Phase B, policy-off DO_UNDO_IDENTITY,
 * COMPASS 32/32 under `doubleExitPropagateBye: false`, seed 30007402, shrunk from 30 steps to 5 keeping the probe and the
 * first divergence).
 *
 * `East|1|3` walks over and `East|1|4` defaults, so `West|1|2` is a double walkover and `South|1|1`'s loser seat,
 * `Southeast|1|1` dp 1, is a BYE on `West|1|2`'s claim. `East|1|3` re-entered as a double default makes `South|1|1` a BYE
 * matchUp (its dp 2 a BYE `East|1|3` claims), so the seat's BYE now also stands because a BYE matchUp's loser is a BYE.
 * Correcting `East|1|4` to a played result dissolves `West|1|2` to a single default; its claim on the seat went, and
 * `withdrawByeSeats` cleared the BYE with it, though `South|1|1` still held its BYE. Every entry order of the standing
 * results leaves the BYE. The claim ledger records who claims a BYE, not why it stands (Mentat P58), so the rule
 * `removeDoubleExit` keeps on its own path (`aByeMatchUpsLoserSeatKeepsItsBye`) is now kept here too: a seat whose feeder
 * holds a BYE keeps its BYE when its last claim goes.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 30007402 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const SCHEDULE = [
  at('East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|4', { winningSide: 1 }),
];
/** the standing results alone, as forward play enters them */
const NET = [
  at('East|1|4', { winningSide: 1 }),
  at('East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
];
const CENSUS_SCHEDULE = [
  at('East|1|2', clearOutcome),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|12', { winningSide: 1 }),
  at('East|2|6', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|8', { winningSide: 1 }),
  at('East|1|9', { matchUpStatus: DOUBLE_DEFAULT }),
  at('West|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|14', { winningSide: 1 }),
  at('East|1|14', { winningSide: 2 }),
  at('East|1|12', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|2|6', { winningSide: 2 }),
  at('East|1|10', clearOutcome),
  at('East|1|7', { winningSide: 2 }),
  at('East|2|6', { winningSide: 2 }),
  at('East|1|6', { winningSide: 2 }),
  at('East|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|8', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('West|1|4', { winningSide: 1 }),
  at('East|1|16', { winningSide: 2 }),
  at('East|1|6', { winningSide: 2 }),
  at('West|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|16', { winningSide: 2 }),
  at('East|1|4', { winningSide: 1 }),
  at('East|1|10', { winningSide: 2 }),
  at('East|1|5', { winningSide: 1 }),
];

function southeast(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(drawId);
  const find = (key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
  const structure = getDrawDefinition(drawId).structures.find(
    (candidate: any) => candidate.structureName === 'Southeast',
  );
  return {
    feeder: find('South|1|1').matchUpStatus,
    seat: find('Southeast|1|1').matchUpStatus,
    dp1: structure.positionAssignments.find((assignment: any) => assignment.drawPosition === 1),
  };
}

it('the seat keeps its BYE while its feeder still holds one, as forward play leaves it', () => {
  const scheduled = southeast(SCHEDULE, 'feeder-bye-scheduled');
  expect(scheduled).toEqual({
    feeder: BYE,
    seat: BYE,
    dp1: { drawPosition: 1, bye: true, byeFromPropagation: true },
  });
  expect(scheduled).toEqual(southeast(NET, 'feeder-bye-net'));
});

it('the shrunk schedule and its probes leave the draw they found', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'feeder-bye-census', POLICY_OFF)).toMatchObject({ verdict: 'clean', complete: true });
});

it('the full census schedule passes', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'feeder-bye-full', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});
