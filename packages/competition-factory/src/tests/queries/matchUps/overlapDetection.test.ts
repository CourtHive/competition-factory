import { analyzeScheduleOverlap } from '@Mutate/matchUps/schedule/scheduleMatchUps/analyzeScheduleOverlap';
import { expect, it } from 'vitest';

const scenarios = [
  {
    participantBookings: [{ scheduleTime: '10:00', timeAfterRecovery: '12:30' }],
    scheduleTime: '09:30',
    timeAfterRecovery: '10:20',
    expectation: [true],
  },
  {
    participantBookings: [
      { timeAfterRecovery: '13:20', scheduleTime: '12:30' },
      { scheduleTime: '08:00', timeAfterRecovery: '08:50' },
    ],
    scheduleTime: '11:00',
    timeAfterRecovery: '13:30',
    expectation: [true, false],
  },
];

it.each(scenarios)('can detect overlaps in bookings', (scenario) => {
  const { expectation, scheduleTime, timeAfterRecovery, participantBookings } = scenario;
  const analysis = participantBookings.map((booking) =>
    analyzeScheduleOverlap({ scheduleTime, timeAfterRecovery }, booking),
  );
  const result = analysis.map((a) => !!a.hasOverlap);
  expect(result).toEqual(expectation);

  /*
  console.log({
    result,
    analysis,
    timeOverlap,
    scheduleTime,
    timeAfterRecovery,
    participantBookings,
  });
  */
});
