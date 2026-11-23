import { getEventInconsistencies, EVENT_DATES_OUTSIDE_TOURNAMENT } from '@Query/event/getEventInconsistencies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

const startDate = '2025-06-02';
const endDate = '2025-06-08';

function seedRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    tournamentAttributes: { startDate, endDate },
  });
  return { tournamentRecord, event: tournamentRecord.events[0] };
}

test('an event range inside the tournament range is not reported', () => {
  const { tournamentRecord, event } = seedRecord();
  const result: any = getEventInconsistencies({ event, tournamentRecord });
  expect(result.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT)).toEqual([]);
});

test('an event range that overlaps the tournament edge is a warning, not disjoint', () => {
  const { tournamentRecord, event } = seedRecord();
  event.startDate = '2025-06-06';
  event.endDate = '2025-06-10';
  const result: any = getEventInconsistencies({ event, tournamentRecord });
  expect(result.valid).toEqual(true);
  const [issue] = result.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT);
  expect(issue).toEqual(
    expect.objectContaining({
      severity: 'warning',
      scope: 'EVENT',
      eventId: event.eventId,
      startDate: '2025-06-06',
      endDate: '2025-06-10',
      tournamentStartDate: startDate,
      tournamentEndDate: endDate,
      disjoint: false,
    }),
  );
});

test('a disjoint event range is flagged disjoint, through the engine at the tournament layer', () => {
  const { tournamentRecord, event } = seedRecord();
  event.startDate = '2025-06-15T00:00:00.000Z';
  event.endDate = '2025-06-17T00:00:00.000Z';
  tournamentEngine.setState(tournamentRecord);

  const result: any = tournamentEngine.getTournamentInconsistencies();
  expect(result.valid).toEqual(true);
  const issues = result.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT);
  expect(issues.length).toEqual(1);
  expect(issues[0]).toEqual(
    expect.objectContaining({
      tournamentId: tournamentRecord.tournamentId,
      eventId: event.eventId,
      startDate: '2025-06-15',
      endDate: '2025-06-17',
      disjoint: true,
    }),
  );
  expect(issues[0].fingerprint).toBeDefined();

  // setTournamentDates resets the disjoint range, and the finding clears
  let mutation: any = tournamentEngine.setTournamentDates({ startDate, endDate });
  expect(mutation.success).toEqual(true);
  expect(mutation.eventDateChanges).toEqual([expect.objectContaining({ eventId: event.eventId, reason: 'RESET' })]);
  const after: any = tournamentEngine.getTournamentInconsistencies();
  expect(after.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT)).toEqual([]);
});

test('an event before the tournament with only an endDate is disjoint', () => {
  const { tournamentRecord, event } = seedRecord();
  delete event.startDate;
  event.endDate = '2025-05-30';
  const result: any = getEventInconsistencies({ event, tournamentRecord });
  const [issue] = result.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT);
  expect(issue.disjoint).toEqual(true);
  expect(issue.startDate).toBeUndefined();
});

test('without a tournamentRecord the date check is skipped', () => {
  const { event } = seedRecord();
  event.startDate = '2030-01-01';
  const result: any = getEventInconsistencies({ event });
  expect(result.inconsistencies.filter((i) => i.issueType === EVENT_DATES_OUTSIDE_TOURNAMENT)).toEqual([]);
});
