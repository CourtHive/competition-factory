import { clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A BYE-MATCHUP-FED LOSER SEAT ROUND-TRIPS WHOLE (Mentat P58; census Phase B, COMPASS 32/30 policy-off, seed 30004303).
 *
 * The seat's BYE had two possible reasons: the feeder is a BYE matchUp, and a double exit whose produced exit the feeder
 * relays leaves its loser nobody. While the `byeClaims` ledger recorded who claimed it, whether the claim existed
 * depended on which reason came first, so CA ruling (b) (2026-10-20) left those claims out of the round trip. The
 * ledger is retired (CA, 2026-10-21): whether a loser seat's BYE stands is read from the draw (`feederSendsNobody`,
 * held at every step by LOSER_SEAT_DERIVED), so the exclusion is gone and the census schedule and its probes return
 * the draw they found with nothing left out.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 30004303 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const CENSUS_SCHEDULE = [
  at('East|1|5', clearOutcome),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|14', { winningSide: 2 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|1|14', { winningSide: 2 }),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|7', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|9', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|2', { winningSide: 2 }),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { winningSide: 1 }),
  at('East|1|7', clearOutcome),
  at('East|1|10', clearOutcome),
  at('East|1|6', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|2|1', { winningSide: 2 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|2|5', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
];

it('the census schedule and its probes leave the draw they found', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'bye-fed-claim-census', POLICY_OFF)).toMatchObject({
    verdict: 'clean',
    complete: true,
  });
});
