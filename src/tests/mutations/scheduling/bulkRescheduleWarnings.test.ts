import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, vi } from 'vitest';

// constants
import { ANACHRONISM } from '@Constants/errorConditionConstants';

/**
 * bulkRescheduleMatchUps writes through addMatchUpScheduleItems and must pass on the warnings that write returns,
 * each naming its matchUp, as the bulk schedulers do. No warning is reachable through the reschedule's own call today
 * (it waives the chronology check and writes only a date and a time), so the write is wrapped to add ANACHRONISM to
 * the reschedule's writes: the test is of the aggregation, not of when the warning is raised.
 */
vi.mock('@Mutate/matchUps/schedule/scheduleItems/scheduleItems', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    addMatchUpScheduleItems: (params: any) => {
      const result = original.addMatchUpScheduleItems(params);
      // only the reschedule waives the chronology check; the seeding bulkScheduleMatchUps call does not
      if (!result.success || params.checkChronology !== false) return result;
      return { ...result, warnings: [...(result.warnings ?? []), ANACHRONISM] };
    },
  };
});

const startDate = '2024-01-15';
const endDate = '2024-01-17';
const MATCHUP_IDS = ['m-1-1', 'm-1-2'];

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, idPrefix: 'm' }],
    setState: true,
    startDate,
    endDate,
  });
  const { tournamentId } = tournamentRecord;
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const result: any = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: MATCHUP_IDS.map((matchUpId) => ({
      schedule: { scheduledDate: startDate, scheduledTime: '10:00' },
      tournamentId,
      matchUpId,
      drawId,
    })),
  });
  expect(result.scheduled).toEqual(2);
  expect(result.warnings).toBeUndefined();
}

it('returns the warnings of each write, each carrying its matchUpId', () => {
  seed();

  let result: any = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 30 },
    matchUpIds: MATCHUP_IDS,
  });
  expect(result.success).toEqual(true);
  expect(result.allRescheduled).toEqual(true);
  expect(result.warnings).toEqual(MATCHUP_IDS.map((matchUpId) => ({ ...ANACHRONISM, matchUpId })));

  // a dry run validates the same writes, so it reports the same warnings
  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 1 },
    matchUpIds: MATCHUP_IDS,
    dryRun: true,
  });
  expect(result.warnings).toEqual(MATCHUP_IDS.map((matchUpId) => ({ ...ANACHRONISM, matchUpId })));
});

it('returns no warnings when a matchUp is refused before any write', () => {
  seed();

  // past endDate: refused by the reschedule itself, so nothing is written and nothing is warned
  const result: any = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 5 },
    matchUpIds: MATCHUP_IDS,
  });
  expect(result.success).toEqual(true);
  expect(result.notRescheduled.length).toEqual(2);
  expect(result.warnings).toBeUndefined();
});
