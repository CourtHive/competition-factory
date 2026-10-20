import { clearOutcome, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A RELABEL REACHES THE CARRY ON A BYE-HELD MATCHUP (census Phase B, policy-off DO_UNDO_IDENTITY, CURTIS_CONSOLATION 8/6
 * under `doubleExitPropagateBye: false`, seed 30009232, shrunk from 30 steps to 5 keeping the probe and the first
 * divergence).
 *
 * `Main|1|3`'s double default claims `Play Off|1|1` dp 2, so `Play Off|1|1` reads BYE. `Main|2|1` walks over, and its
 * loser's carry is recorded on `Play Off|1|1` beside that BYE. Re-entered as a default, the winner unchanged, the exit
 * relabels its carry (#5554), but the relabel looks for the loser's standing matchUp and passes over a BYE, so the entry
 * on `Play Off|1|1` kept WALKOVER. Correcting `Main|1|3` to a played result took the BYE away, and `Play Off|1|1` was
 * decided by the stale label, where entering the default directly, or replaying the standing results in any order,
 * reaches DEFAULTED. The relabel now rewrites the carry's label on every BYE-held matchUp of the loser's structure.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = {
  drawType: CURTIS_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 6,
  drawSize: 8,
  seed: 30009232,
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const BEFORE_RELABEL = [
  at('Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
];
const RELABEL = at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 });
const BYE_GOES = at('Main|1|3', { winningSide: 1 });
const SCHEDULE = [...BEFORE_RELABEL, RELABEL, BYE_GOES];
const CENSUS_SCHEDULE = [
  at('Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|1|3', clearOutcome),
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|1|3', { winningSide: 2 }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|2', clearOutcome),
  at('Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|2|1', clearOutcome),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { winningSide: 1 }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
];

function playOff(steps: Step[], drawId: string) {
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
  const matchUp = getDrawMatchUps(drawId).find((candidate: any) => coordinate(candidate) === 'Play Off|1|1');
  return {
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide ?? null,
    carry: matchUp.sideExitProvenance?.[1]
      ? [matchUp.sideExitProvenance[1].matchUpStatus, matchUp.sideExitProvenance[1].previousMatchUpStatus]
      : null,
  };
}

it('the relabel rewrites the carry recorded beside the BYE', () => {
  expect(playOff(BEFORE_RELABEL, 'relabel-bye-held-before')).toEqual({
    matchUpStatus: BYE,
    winningSide: null,
    carry: [WALKOVER, WALKOVER],
  });
  expect(playOff([...BEFORE_RELABEL, RELABEL], 'relabel-bye-held-after')).toEqual({
    matchUpStatus: BYE,
    winningSide: null,
    carry: [DEFAULTED, DEFAULTED],
  });
});

it('once the BYE goes, the relabelled exit decides the matchUp as the exit entered directly does', () => {
  const relabelled = playOff(SCHEDULE, 'relabel-bye-held-relabelled');
  const direct = playOff([BEFORE_RELABEL[0], BEFORE_RELABEL[1], RELABEL, BYE_GOES], 'relabel-bye-held-direct');
  expect(relabelled).toEqual({ matchUpStatus: DEFAULTED, winningSide: 2, carry: [DEFAULTED, DEFAULTED] });
  expect(relabelled).toEqual(direct);
});

it('the shrunk schedule and its probes leave the draw they found', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'relabel-bye-held-census', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});

it('the full census schedule passes', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'relabel-bye-held-full', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});
