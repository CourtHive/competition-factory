import { ABANDONED, CANCELLED, DEFAULTED, INCOMPLETE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { FORMAT_STANDARD } from '../scoring/matchUpFormats';
import { WITHDRAWN } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

const personalCircumstance = 'Personal circumstance';

export const POLICY_SCORING_USTA = {
  [POLICY_TYPE_SCORING]: {
    requireAllPositionsAssigned: false,
    // exit statuses (WALKOVER/DEFAULTED) propagate into the consolation by default
    propagateExitStatus: true,
    stage: {
      [MAIN]: {
        stageSequence: {
          1: {
            requireAllPositionsAssigned: true,
          },
        },
      },
    },
    defaultMatchUpFormat: FORMAT_STANDARD,
    matchUpFormats: [
      {
        description: 'Best of 3 tiebreak sets',
        matchUpFormat: FORMAT_STANDARD,
        categoryNames: [],
        categoryTypes: [],
      },
      {
        description: 'Two tiebreak sets, 7-point match tiebreak at one set all',
        matchUpFormat: 'SET3-S:6/TB7-F:TB7',
      },
      {
        description: 'Two tiebreak sets, 10-point match tiebreak at one set all',
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
      },
      {
        description: 'One standard tiebreak set to 6, 7-point tiebreak at 6 games all',
        matchUpFormat: 'SET1-S:6/TB7',
      },
      {
        description: 'Best of 3 sets to 4',
        matchUpFormat: 'SET3-S:4/TB7',
      },
      {
        description: 'Two out of three short sets to 4 with 5-point tiebreak at 3 games all',
        matchUpFormat: 'SET3-S:4/TB5@3',
      },
      {
        description: 'One short set to 4, 7-point tiebreak at 4 games all',
        matchUpFormat: 'SET1-S:4/TB7',
      },
      {
        description: 'One short set to 4, 5-point tiebreak at 3 games all',
        matchUpFormat: 'SET1-S:4/TB5@3',
      },
      {
        description: 'Two short sets to 4, 10-point match tiebreak at one set all',
        matchUpFormat: 'SET3-S:4/TB7-F:TB10',
      },
      {
        description: 'Two short sets to 4, 7-point match tiebreak at one set all',
        matchUpFormat: 'SET3-S:4/TB7-F:TB7',
      },
      {
        description: 'One no advantage set to 5, tiebreak to 9 at 4-4',
        matchUpFormat: 'SET1-S:5/TB9@4',
      },
      {
        description: 'One set to 6 with deciding game at 5 games all',
        matchUpFormat: 'SET1-S:6NOAD',
      },
      {
        description: 'One short set to 4, deciding game is played at 3 games all',
        matchUpFormat: 'SET1-S:4NOAD',
      },
      {
        description: 'Two short sets to 4 with deciding game at 3-3, 7-point match tiebreak at one set all',
        matchUpFormat: 'SET3-S:4NOAD-F:TB7',
      },
      {
        description: '8 game pro-set with 7 point tiebreak at 8 games all',
        matchUpFormat: 'SET1-S:8/TB7',
      },
      {
        description: '8 game pro-set with 7 point tiebreak at 7 games all',
        matchUpFormat: 'SET1-S:8/TB7@7',
      },
      {
        description: 'Best of 3 10-point tiebreak games',
        matchUpFormat: 'SET3-S:TB10',
      },
      {
        description: 'One 10-point tiebreak game',
        matchUpFormat: 'SET1-S:TB10',
      },
      {
        description: 'Timed 20 minute game - game based',
        matchUpFormat: 'SET1-S:T20',
      },
    ],
    matchUpStatusCodes: {
      [ABANDONED]: [
        {
          matchUpStatusCodeDisplay: 'Abandoned',
          label: 'Abandoned match',
          matchUpStatusCode: 'OA',
        },
      ],
      [CANCELLED]: [
        {
          matchUpStatusCodeDisplay: 'Unplayed or Cancelled',
          label: 'Cancelled match',
          matchUpStatusCode: 'OC',
        },
      ],
      [INCOMPLETE]: [
        {
          matchUpStatusCodeDisplay: 'Incomplete',
          label: 'Incomplete match',
          matchUpStatusCode: 'OI',
        },
      ],
      [DEFAULTED]: [
        {
          description: 'Disqualification for cause or ineligibility',
          label: 'Disqualification (ineligibility)',
          matchUpStatusCodeDisplay: 'Def [dq]',
          matchUpStatusCode: 'DQ',
        },
        {
          description: 'Misconduct before or between matches',
          label: 'Misconduct',
          matchUpStatusCodeDisplay: 'Def [cond]',
          matchUpStatusCode: 'DM',
        },
        {
          description: 'Failure to start match because of adult discipline',
          label: 'Fail. (adult discipline)',
          matchUpStatusCodeDisplay: 'Def [ad]',
          matchUpStatusCode: 'D5',
        },
        {
          description:
            'Refusal to start match for reason other than adult discipline, injury, illness, or personal circumstance. ' +
            '(After the Referee has conclusively confirmed that a player refuses to play a match, the Referee need not ' +
            'wait until the scheduled time of the match to records the result.)',
          label: 'Refusal to start match',
          matchUpStatusCodeDisplay: 'Def [refsl]',
          matchUpStatusCode: 'D4',
        },
        {
          label: 'Not showing up',
          matchUpStatusCodeDisplay: 'Def [ns]',
          matchUpStatusCode: 'D6',
        },
        {
          description:
            'Lateness for match including, but not limited to, intending to play but mistakenly arriving at the ' +
            'wrong time, location, or without proper equipment',
          label: 'Lateness for match',
          matchUpStatusCodeDisplay: 'Score + Def [late]',
          matchUpStatusCode: 'D7',
        },
        {
          label: 'Double default',
          matchUpStatusCodeDisplay: 'Def/Def',
          matchUpStatusCode: 'DD',
        },
        {
          description:
            'Refusal to continue playing a match for reason other than injury, illness, personal circumstance, or ' +
            'adult discipline',
          label: 'Refusal to continue match',
          matchUpStatusCodeDisplay: 'Def [refsl]',
          matchUpStatusCode: 'D9',
        },
        {
          description: 'Default for receiving an injection, IV, or supplemental oxygen',
          label: 'Default (PEDs)',
          matchUpStatusCodeDisplay: 'Def [med]',
          matchUpStatusCode: 'DI',
        },
        {
          description: 'Default under Point Penalty System',
          label: 'Default (Point Penalty System)',
          matchUpStatusCodeDisplay: 'Def [pps]',
          matchUpStatusCode: 'DP',
        },
      ],
      [WALKOVER]: [
        {
          matchUpStatusCodeDisplay: 'Wo [inj]',
          matchUpStatusCode: 'W1',
          label: 'Injury',
        },
        {
          matchUpStatusCodeDisplay: 'Wo [ill]',
          matchUpStatusCode: 'W2',
          label: 'Illness',
        },
        {
          matchUpStatusCodeDisplay: 'Wo [pc]',
          label: personalCircumstance,
          matchUpStatusCode: 'W3',
        },
        {
          matchUpStatusCodeDisplay: 'Wo/Wo',
          matchUpStatusCode: 'WOWO',
          label: 'Double walkover',
        },
        {
          matchUpStatusCodeDisplay: 'Wo [Tae]',
          label: 'Tournament Administrative Error',
          matchUpStatusCode: 'W4',
        },
        {
          matchUpStatusCodeDisplay: 'Wo/Withdrawn',
          matchUpStatusCode: 'W5',
          label: 'Withdrawn',
        },
      ],
      [RETIRED]: [
        {
          matchUpStatusCodeDisplay: 'Ret [inj]',
          matchUpStatusCode: 'RJ',
          label: 'Injury',
        },
        {
          matchUpStatusCodeDisplay: 'Ret [ill]',
          matchUpStatusCode: 'RI',
          label: 'Illness',
        },
        {
          matchUpStatusCodeDisplay: 'Ret [pc]',
          label: personalCircumstance,
          matchUpStatusCode: 'RC',
        },
        {
          description: 'Retirement because of adult discipline',
          label: 'Ret. (adult discipline)',
          matchUpStatusCodeDisplay: 'Ret [ad]',
          matchUpStatusCode: 'RD',
        },
        {
          description:
            'A player who retires from a match remains eligible for consolations, place playoffs, doubles and ' +
            'subsequent round robin matches',
          matchUpStatusCodeDisplay: 'Ret [elg]',
          label: 'Ret. (eligible)',
          matchUpStatusCode: 'RU',
        },
      ],
      [WITHDRAWN]: [
        {
          matchUpStatusCodeDisplay: 'Wd [inj]',
          matchUpStatusCode: 'WD.INJ',
          label: 'Injury',
        },
        {
          matchUpStatusCodeDisplay: 'Wd [ill]',
          matchUpStatusCode: 'WD.ILL',
          label: 'Illness',
        },
        {
          matchUpStatusCodeDisplay: 'Wd [pc]',
          label: personalCircumstance,
          matchUpStatusCode: 'WD.PC',
        },
        {
          matchUpStatusCodeDisplay: 'Wd/Wd',
          matchUpStatusCode: 'WD.WD',
          label: 'Double withdrawal',
        },
        {
          label: 'Tournament Administrative Error',
          matchUpStatusCodeDisplay: 'Wd [Tae]',
          matchUpStatusCode: 'WD.TAE',
        },
      ],
    },
  },
};

export default POLICY_SCORING_USTA;
