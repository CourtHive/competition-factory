import { replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

/**
 * **A settled convergence leaves nothing behind that the census can see.**
 *
 * Census seeds opened by the first cut of `settleRederivedDoubleExits`, shrunk with the census property
 * set. Each replays clean on dev, so each was this change's to close. Each scenario's comment names what
 * was left behind and where it is now cleared.
 */
const SCENARIOS = [
  {
    // stale legacy exit codes left on the settled matchUp (EXIT_CODE_ON_WINNER_SIDE); settling blanks them (`blankExitCodes`)
    seed: 9100514,
    config: { participantsCount: 30, propagateExitStatus: true, drawSize: 32, drawType: 'OLYMPIC', seed: 9100514 },
    steps: [
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 11,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 9,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 14,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 11,
        outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
      },
    ],
  },
  {
    // a produced exit left standing after its source reverted; `reconcileStaleExitOrigins` withdraws it unless the source's winner seat is a BYE (`winnerSeatIsBye`)
    seed: 9000562,
    config: {
      participantsCount: 11,
      propagateExitStatus: true,
      drawSize: 16,
      drawType: 'FEED_IN_CHAMPIONSHIP',
      seed: 9000562,
    },
    steps: [
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 4,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 4,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 5,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 3,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 3, outcome: { winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 3,
        roundPosition: 2,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
    ],
  },
  {
    // a BYE matchUp whose last carried exit was withdrawn reverted to TO_BE_PLAYED, and held BYEs on both sides once a double exit's BYE arrived; `withdrawFromMatchUp` keeps it a BYE
    seed: 9000477,
    config: { participantsCount: 29, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 9000477 },
    steps: [
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 12,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 8,
        outcome: {
          matchUpStatus: 'RETIRED',
          winningSide: 1,
          score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
        },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 6,
        outcome: {
          matchUpStatus: 'RETIRED',
          winningSide: 1,
          score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
        },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 4,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 10,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'East',
        roundNumber: 1,
        roundPosition: 3,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
    ],
  },
];

it.each(SCENARIOS)(
  'census seed $seed replays clean',
  ({ config, steps }) => {
    setSubscriptions({});
    expect(replay(config, steps, `settled-${config.seed}`)).toEqual(null);
  },
  180_000,
);
