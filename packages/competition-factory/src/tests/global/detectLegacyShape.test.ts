import { detectLegacyShape } from '../../index';
import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import {
  SANCTIONING_CONSTRAINTS,
  APPLIED_POLICIES,
  SCHEDULE_LIMITS,
  ROUND_TARGET,
  FLIGHT_PROFILE,
  TALLY,
  DISABLE_AUTO_CALC,
  DISABLED,
  LINEUPS,
} from '@Constants/extensionConstants';
import { ASSIGN_COURT, CHECK_IN, CHECK_OUT, SCHEDULED_TIME, START_TIME } from '@Constants/timeItemConstants';
import { SIGN_IN_STATUS } from '@Constants/participantConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { expect, it } from 'vitest';

const report = (record: unknown) => detectLegacyShape(record as Tournament);
const extension = (name: string) => ({ name, value: 1 });
const item = (itemType: string, itemValue?: unknown) => ({ itemType, itemValue });

function freeze(value: unknown) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

it('counts only missing native fields at the corresponding owners, on a frozen imported record', () => {
  const match = {
    drawPositions: [undefined, 5],
    extensions: [extension(DISABLE_AUTO_CALC)],
    schedule: { scheduledTime: '08:00' },
    timeItems: [
      item(SCHEDULED_TIME),
      item(ASSIGN_COURT, 'A'),
      item(ASSIGN_COURT, null),
      item(CHECK_IN, 'p'),
      item(CHECK_OUT, 'p'),
      item(START_TIME),
    ],
    tieMatchUps: [{ extensions: [extension(DISABLE_AUTO_CALC)], timeItems: [item(CHECK_IN, 'p')] }],
  };
  const record = {
    extensions: [
      extension(APPLIED_POLICIES),
      extension(APPLIED_POLICIES),
      extension(SCHEDULE_LIMITS),
      extension(SANCTIONING_CONSTRAINTS),
    ],
    sanction: {},
    participants: [
      {
        timeItems: [item(SIGN_IN_STATUS, 'SIGNED_IN'), item(SIGN_IN_STATUS, 'SIGNED_OUT')],
        penalties: [{ penaltyType: 'Ball Abuse' }, { penaltyType: 'UNKNOWN' }, { penaltyType: 'BALL_ABUSE' }],
      },
    ],
    venues: [{ extensions: [extension(DISABLED)], courts: [{ extensions: [extension(DISABLED)] }] }],
    events: [
      {
        extensions: [extension(FLIGHT_PROFILE)],
        entries: [{ extensions: [extension(ROUND_TARGET)] }],
        drawDefinitions: [
          {
            extensions: [extension(LINEUPS), extension(FLIGHT_PROFILE)],
            entries: [{ extensions: [extension(ROUND_TARGET)] }],
            structures: [
              {
                structures: [
                  {
                    extensions: [extension(ROUND_TARGET)],
                    positionAssignments: [{ extensions: [extension(TALLY)] }],
                    matchUps: [match],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(record);
  freeze(record);
  const result = report(record);
  expect(result).toStrictEqual({
    success: true,
    total: 19,
    legacyShapes: {
      tournament: 3,
      events: 1,
      entries: 2,
      drawDefinitions: 1,
      structures: 1,
      positionAssignments: 1,
      matchUps: 1,
      matchUpScheduleTimeItems: 1,
      matchUpCheckIns: 2,
      drawPositions: 1,
      goesTo: 0,
      participantPresence: 2,
      penaltyLabels: 1,
      venues: 1,
      courts: 1,
    },
  });
  expect(report(record)).toStrictEqual(result);
  expect(record).toStrictEqual(before);
});

it('respects BRIDGE native precedence including falsy values, empty logs, grouped leaves and clear sentinels', () => {
  const record = {
    scheduling: { dailyLimits: null },
    extensions: [extension(SCHEDULE_LIMITS), extension(SANCTIONING_CONSTRAINTS)],
    sanction: { constraints: {} },
    venues: [{ disabled: false, extensions: [extension(DISABLED)] }],
    participants: [{ presence: [], timeItems: [item(SIGN_IN_STATUS)] }],
    events: [
      {
        flightProfile: {},
        extensions: [extension(FLIGHT_PROFILE)],
        drawDefinitions: [
          {
            structures: [
              {
                matchUps: [
                  {
                    roundNumber: 1,
                    roundPosition: 1,
                    finishingPositionRange: {},
                    disableAutoCalc: false,
                    extensions: [extension(DISABLE_AUTO_CALC)],
                    schedule: { courtId: '' },
                    checkIns: [],
                    timeItems: [item(ASSIGN_COURT, null), item(CHECK_OUT), item(START_TIME)],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  expect(report(record).total).toBe(0);
  const schedule = record.events[0].drawDefinitions[0].structures[0].matchUps[0].schedule;
  Object.assign(schedule, { courtId: undefined });
  expect(report(record).legacyShapes?.matchUpScheduleTimeItems).toBe(1);
});

it('uses the draw-wide stored-edge and finishing-range predicates without following destinations', () => {
  const round = (n: number) => ({ roundNumber: n, roundPosition: 1, finishingPositionRange: { winner: [1, 1] } });
  const structures = [
    { structureId: 'main', matchUps: [{ ...round(1), winnerMatchUpId: 'unresolved' }, round(1), round(2)] },
  ];
  const read = (draw: unknown) => report({ events: [{ drawDefinitions: [draw] }] }).legacyShapes?.goesTo;
  expect(read({ structures })).toBe(0); // a sibling missing its edge does not prove a missing structure-wide edge
  expect(read({ structures: [{ matchUps: [round(1)] }] })).toBe(0); // a final has no winner edge
  expect(read({ structures: [{ matchUps: [round(1), round(2)] }] })).toBe(1);
  expect(
    read({
      structures,
      links: [{ linkType: 'LOSER', source: { structureId: 'main' }, target: { structureId: 'away' } }],
    }),
  ).toBe(1);
  expect(read({ structures: [{ matchUps: [{ roundNumber: 1, roundPosition: 1 }] }] })).toBe(1); // finishing rounds are absent
  expect(read({ structures: [{ matchUps: [{ roundNumber: 1 }] }] })).toBe(0); // ad hoc
  expect(read({ structures: [{}] })).toBe(0);
  expect(read({ structures: [{ finishingPosition: 'WIN_RATIO', matchUps: [round(1), round(2)] }] })).toBe(0);
});

it('counts a match once for noncanonical positions and preserves its sparse stored shape', () => {
  const positions = [[], [2], [2, 5], [5, 2], [undefined, 3], [null], Array(2), [5, 0], [3, 3]];
  const record = {
    events: [
      {
        drawDefinitions: [
          {
            structures: [
              {
                matchUps: positions.map((drawPositions) => ({
                  drawPositions,
                  roundPosition: 1,
                  finishingPositionRange: {},
                })),
              },
            ],
          },
        ],
      },
    ],
  };
  freeze(record);
  expect(report(record).legacyShapes?.drawPositions).toBe(5);
  expect(Object.keys(positions[6])).toEqual([]);
});

it('tracks a shadow migration without counting retained envelopes as pending native fields', () => {
  const record = {
    extensions: [extension(SCHEDULE_LIMITS)],
    venues: [{ extensions: [extension(DISABLED)] }],
    events: [{ extensions: [extension(FLIGHT_PROFILE)] }],
  } as unknown as Tournament;
  expect(report(record).total).toBe(3);
  expect(migrateTournamentRecord({ tournamentRecord: record, clearLegacy: false }).totalPromoted).toBe(3);
  expect(record.extensions).toHaveLength(1);
  expect(report(record).total).toBe(0);
});

it('reports an invalid argument and accepts a record with omitted collections', () => {
  for (const input of [undefined, null, [], 42]) expect(report(input)).toEqual({ error: MISSING_TOURNAMENT_RECORD });
  expect(report({}).total).toBe(0);
});

it('skips non-array legacy fields that migration skips and still inspects valid siblings', () => {
  const record = {
    tournamentId: 'T',
    extensions: 'legacy',
    participants: [{ participantId: 'p', timeItems: { itemType: SIGN_IN_STATUS } }],
    venues: [{ extensions: { length: 1, 0: extension(DISABLED) }, courts: [{ extensions: [extension(DISABLED)] }] }],
    events: [
      {
        drawDefinitions: [
          {
            structures: [
              {
                matchUps: [
                  {
                    roundNumber: 1,
                    roundPosition: 1,
                    finishingPositionRange: { winner: [1, 1] },
                    timeItems: { itemType: CHECK_IN },
                    drawPositions: { length: 1, 0: 2 },
                  },
                  {
                    roundNumber: 1,
                    roundPosition: 2,
                    timeItems: [item(ASSIGN_COURT, 'A')],
                    drawPositions: '51',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const migration = migrateTournamentRecord({ tournamentRecord: structuredClone(record) as unknown as Tournament });
  expect(migration.totalPromoted).toBe(2);
  freeze(record);
  expect(report(record).legacyShapes).toStrictEqual(migration.promoted);
  expect(report(record).legacyShapes).toMatchObject({ courts: 1, matchUpScheduleTimeItems: 1, drawPositions: 0 });
});
