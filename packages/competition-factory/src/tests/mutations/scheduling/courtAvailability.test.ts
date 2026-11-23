import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { mocksEngine } from '../../..';
import { expect, test } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';

const startTime = '08:00';
const endTime = '20:00';
const scenarios = [
  {
    expectations: [],
    matchUpsAtStartTime: 8,
    lastScheduledMatchUpId: 'm-4-2',
  },
  {
    courtTimings: [{ startTime: '12:00' }, { endTime: '13:00' }],
    expectations: [
      { startTime: '12:00', endTime },
      { startTime, endTime: '13:00' },
      { startTime, endTime },
    ],
    matchUpsAtStartTime: 7,
    lastScheduledMatchUpId: 'm-4-2',
  },
  {
    courtTimings: [{ startTime: '11:00' }, { startTime: '12:00' }, { startTime: '13:00' }],
    expectations: [
      { startTime: '11:00', endTime },
      { startTime: '12:00', endTime },
      { startTime: '13:00', endTime },
    ],
    matchUpsAtStartTime: 5,
    lastScheduledMatchUpId: 'm-4-1',
  },
  {
    courtTimings: [
      { endTime: '11:00' },
      { endTime: '11:00' },
      { endTime: '11:00' },
      { endTime: '11:00' },
      { endTime: '11:00' },
      { endTime: '12:00' },
      { endTime: '12:00' },
    ],
    expectations: [
      { startTime, endTime: '11:00' },
      { startTime, endTime: '11:00' },
      { startTime, endTime: '11:00' },
      { startTime, endTime: '11:00' },
      { startTime, endTime: '11:00' },
      { startTime, endTime: '12:00' },
      { startTime, endTime: '12:00' },
    ],
    matchUpsAtStartTime: 8,
    lastScheduledMatchUpId: 'm-2-1',
  },
];

test.each(scenarios)('varying court availability is properly considered', (scenario) => {
  const drawId = 'drawId';
  const venueId = 'venueId';
  const startDate = extractDate(new Date().toISOString());
  const drawProfiles = [{ idPrefix: 'm', drawId, drawSize: 32 }];
  const venueProfiles = [
    {
      courtTimings: scenario.courtTimings,
      venueAbbreviation: 'VNU',
      courtsCount: 8,
      startTime,
      endTime,
      venueId,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId,
          rounds: [
            { drawId, winnerFinishingPositionRange: '1-16' },
            { drawId, winnerFinishingPositionRange: '1-8' },
            { drawId, winnerFinishingPositionRange: '1-4' },
            { drawId, winnerFinishingPositionRange: '1-2' },
            { drawId, winnerFinishingPositionRange: '1-1' },
          ],
        },
      ],
    },
  ];

  const { tournamentRecord, schedulerResult } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  scenario.expectations.forEach((expectation, index) => {
    expect(courts[index].dateAvailability[0].startTime).toEqual(expectation.startTime);
    expect(courts[index].dateAvailability[0].endTime).toEqual(expectation.endTime);
  });

  const matchUpsAtStartTime = Object.values(schedulerResult.matchUpScheduleTimes).filter(
    (scheduleTime) => scheduleTime === startTime,
  ).length;
  expect(matchUpsAtStartTime).toEqual(scenario.matchUpsAtStartTime);

  const scheduledMatchUpIds = Object.keys(schedulerResult.matchUpScheduleTimes);
  const lastScheduledMatchUpId = scheduledMatchUpIds[scheduledMatchUpIds.length - 1];
  expect(lastScheduledMatchUpId).toEqual(scenario.lastScheduledMatchUpId);
});
