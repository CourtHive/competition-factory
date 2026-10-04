import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * **A convergence that loses an origin to a BYE settles where the kept origin puts it.**
 *
 * Census window w2, seeds 9100488 (COMPASS 32/32) and 9100068 (OLYMPIC 32/29), shrunk with the census
 * property set. A double exit upstream turned the seat of one of a convergence's two origins into a BYE.
 * That origin was not WITHDRAWN, so its provenance entry stayed behind naming an origin that no longer
 * exits, and the converged matchUp became a BYE still recording two carried exits. Its produced exit a
 * round further on was cleared while its provenance stayed; the kept carrier passed the BYE as a plain
 * arrival. The census reported MONOTONIC_DECISION.
 *
 * `settleRederivedDoubleExits` counts LIVE origins (`liveExitSides`): the convergence settles with the kept
 * origin's carry replayed, which RULE 1 carries past the BYE. Found and traced by the F2/F4 session.
 */
const SCENARIOS = [
  {
    seed: 9100488,
    config: { participantsCount: 32, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 9100488 },
    steps: [
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 15,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 1 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 2 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 1 } },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 10,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
    ],
  },
  {
    seed: 9100068,
    config: { participantsCount: 29, propagateExitStatus: true, drawSize: 32, drawType: 'OLYMPIC', seed: 9100068 },
    steps: [
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 14,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 7,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 4,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
    ],
  },
];

it.each(SCENARIOS)(
  'census w2 seed $seed replays clean',
  ({ config, steps }) => {
    setSubscriptions({});
    expect(replay(config, steps, `settle-bye-${config.seed}`)).toEqual(null);
  },
  180_000,
);
