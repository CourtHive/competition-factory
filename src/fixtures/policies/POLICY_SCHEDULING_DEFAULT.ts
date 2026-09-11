import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { FORMAT_STANDARD } from '../scoring/matchUpFormats';

// categoryTypes
const ADULT = 'ADULT';
const JUNIOR = 'JUNIOR';
const WHEELCHAIR = 'WHEELCHAIR';

export const POLICY_SCHEDULING_DEFAULT = {
  [POLICY_TYPE_SCHEDULING]: {
    allowModificationWhenMatchUpsScheduled: {
      courts: false,
      venues: false,
    },
    defaultTimes: {
      averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
      recoveryTimes: [{ minutes: { [DOUBLES]: 30, default: 60 } }],
      // Minimum rest between the last matchUp of one day and the first of the
      // next. USTA Friend at Court states 12 hours for junior divisions; adult
      // play carries no equivalent constraint, hence the unconstrained
      // catch-all rather than a single flat figure. Zero means "no rule",
      // which is what a consumer must report rather than inventing one.
      overnightTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 720 } }, { minutes: { default: 0 } }],
    },
    defaultDailyLimits: {
      [SINGLES]: 2,
      [DOUBLES]: 2,
      total: 3,
    },
    matchUpAverageTimes: [
      {
        matchUpFormatCodes: [FORMAT_STANDARD], // Best of 3 tiebreak sets
        averageTimes: [
          {
            categoryNames: [],
            minutes: { default: 90 },
          },
          {
            categoryTypes: [WHEELCHAIR],
            minutes: { default: 120 },
          },
        ],
      },
      {
        matchUpFormatCodes: ['SET3-S:6/TB7-F:TB10'], // Two tiebreak sets, 10-point match tiebreak at one set all
        averageTimes: [{ categoryNames: [], minutes: { default: 85 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:6/TB7-F:TB7'], // Two tiebreak sets, 7-point match tiebreak at one set all
        averageTimes: [{ categoryNames: [], minutes: { default: 70 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4NOAD-F:TB7'], // Two short sets to 4 with deciding game at 3-3, 7-point match tiebreak at one set all
        averageTimes: [{ categoryNames: [], minutes: { default: 55 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4/TB7'], // Best of 3 sets to 4
        averageTimes: [{ categoryNames: [], minutes: { default: 60 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4/TB7-F:TB7'], // Two short sets to 4, 7-point match tiebreak at one set all
        averageTimes: [{ categoryNames: [], minutes: { default: 50 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4/TB7-F:TB10'], // Two short sets to 4, 10-point match tiebreak at one set all
        averageTimes: [{ categoryNames: [], minutes: { default: 55 } }],
      },
      {
        matchUpFormatCodes: ['SET3-S:4/TB5@3'], // Two out of three short sets to 4 with 5-point tiebreak at 3 games all
        averageTimes: [{ categoryNames: [], minutes: { default: 45 } }],
      },
      {
        matchUpFormatCodes: [
          'SET1-S:8/TB7' /* 8 game pro-set with 7 point tiebreak at 8 games all */,
          'SET1-S:8/TB7@7' /* 8 game pro-set with 7 point tiebreak at 7 games all */,
        ],
        averageTimes: [{ categoryNames: [], minutes: { default: 40 } }],
      },
      {
        matchUpFormatCodes: ['SET1-S:5/TB9@4'], // One no advantage set to 5, tiebreak to 9 at 4-4
        averageTimes: [{ categoryNames: [], minutes: { default: 30 } }],
      },
      {
        matchUpFormatCodes: ['SET1-S:6/TB7'], // One standard tiebreak set to 6, 7-point tiebreak at 6 games all
        averageTimes: [{ categoryNames: [], minutes: { default: 30 } }],
      },
      {
        matchUpFormatCodes: ['SET1-S:6NOAD'], // One set to 6 with deciding game at 5 games all
        averageTimes: [{ categoryNames: [], minutes: { default: 30 } }],
      },
      {
        matchUpFormatCodes: [
          'SET1-S:4/TB7' /* One short set to 4, 7-point tiebreak at 4 games all */,
          'SET1-S:4/TB5@3' /* One short set to 4, 5-point tiebreak at 3 games all */,
          'SET3-S:TB10' /* Best of 3 10-point tiebreak games */,
          'SET1-S:T20' /* Timed 20 minute game - game based' */,
        ],
        averageTimes: [{ categoryNames: [], minutes: { default: 20 } }],
      },
      {
        matchUpFormatCodes: ['SET1-S:4NOAD'], // One short set to 4, deciding game is played at 3 games all
        averageTimes: [{ categoryNames: [], minutes: { default: 20 } }],
      },
      {
        matchUpFormatCodes: ['SET1-S:TB10'], // One 10-point tiebreak game
        averageTimes: [{ categoryNames: [], minutes: { default: 10 } }],
      },
    ],
    matchUpRecoveryTimes: [
      {
        matchUpFormatCodes: [
          'SET3-S:6/TB7' /* Best of 3 tiebreak sets */,
          'SET3-S:6/TB7-F:TB10' /* Two tiebreak sets, 10-point match tiebreak at one set all */,
          'SET3-S:6/TB7-F:TB7' /* Two tiebreak sets, 7-point match tiebreak at one set all */,
        ],
        recoveryTimes: [
          {
            categoryTypes: [ADULT, WHEELCHAIR],
            minutes: { default: 60, [DOUBLES]: 30 },
          },
          {
            categoryTypes: [JUNIOR],
            minutes: { default: 60, [DOUBLES]: 60 },
          },
        ],
      },
      {
        matchUpFormatCodes: [
          'SET3-S:4/TB7-F:TB7' /* Two short sets to 4, 7-point match tiebreak at one set all */,
          'SET3-S:4/TB7-F:TB10' /* Two short sets to 4, 10-point match tiebreak at one set all */,
          'SET3-S:4NOAD-F:TB7' /* Two short sets to 4 with deciding game at 3-3, 7-point match tiebreak at one set all */,
          'SET3-S:4/TB7' /* Best of 3 sets to 4 */,
          'SET3-S:4/TB5@3' /* Two out of three short sets to 4 with 5-point tiebreak at 3 games all */,
        ],
        recoveryTimes: [
          {
            categoryTypes: [ADULT, WHEELCHAIR],
            minutes: { default: 30 },
          },
          {
            categoryTypes: [JUNIOR],
            minutes: { default: 60 },
          },
        ],
      },
      {
        matchUpFormatCodes: [
          'SET1-S:8/TB7' /* 8 game pro-set with 7 point tiebreak at 8 games all */,
          'SET1-S:8/TB7@7' /* 8 game pro-set with 7 point tiebreak at 7 games all */,
          'SET1-S:5/TB9@4' /* One no advantage set to 5, tiebreak to 9 at 4-4 */,
          'SET1-S:6/TB7' /* One standard tiebreak set to 6, 7-point tiebreak at 6 games all */,
          'SET1-S:6NOAD' /* One set to 6 with deciding game at 5 games all */,
          'SET1-S:4/TB7' /* One short set to 4, 7-point tiebreak at 4 games all */,
          'SET1-S:4NOAD' /* One short set to 4, deciding game is played at 3 games all */,
          'SET3-S:TB10' /* Best of 3 10-point tiebreak games */,
          'SET1-S:T20' /* Timed 20 minute game - game based */,
        ],
        recoveryTimes: [
          {
            categoryNames: [],
            minutes: { default: 30 },
          },
        ],
      },
      {
        matchUpFormatCodes: ['SET1-S:4/TB5@3'], // One short set to 4, 5-point tiebreak at 3 games all
        recoveryTimes: [
          {
            categoryTypes: [ADULT, JUNIOR],
            minutes: { default: 30 },
          },
          {
            categoryTypes: [WHEELCHAIR],
            minutes: { default: 15 },
          },
        ],
      },
      {
        matchUpFormatCodes: ['SET1-S:TB10'], // One 10-point tiebreak game
        recoveryTimes: [
          {
            categoryNames: [],
            minutes: { default: 15 },
          },
        ],
      },
    ],
    matchUpDailyLimits: [],
  },
};

export default POLICY_SCHEDULING_DEFAULT;
