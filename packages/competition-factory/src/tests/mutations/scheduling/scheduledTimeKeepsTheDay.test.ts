import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_DATE } from '@Constants/errorConditionConstants';

/**
 * A scheduled time given as a date-time names its day. It gives a matchUp with no date that date; one naming another
 * day than the matchUp's scheduledDate is refused, never stored against it (scheduling-pipeline.md § 9.9,
 * CA 2026-10-28). A date given beside it in a schedule write is the matchUp's date.
 */
const scheduleOf = (matchUpId: string) => tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule ?? {};

it('refuses a date-time naming another day than the stored date, and writes nothing', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const [{ matchUpId, drawId }, other] = tournamentEngine.allTournamentMatchUps().matchUps;

  let result: any = tournamentEngine.addMatchUpScheduledTime({ matchUpId, drawId, scheduledTime: '2026-10-02T09:00' });
  expect(result.success).toEqual(true);
  expect(scheduleOf(matchUpId)).toMatchObject({ scheduledDate: '2026-10-02', scheduledTime: '09:00' });

  result = tournamentEngine.addMatchUpScheduledTime({ matchUpId, drawId, scheduledTime: '2026-10-02T10:00' });
  expect(result.success).toEqual(true);
  expect(scheduleOf(matchUpId).scheduledTime).toEqual('10:00');

  result = tournamentEngine.addMatchUpScheduledTime({ matchUpId, drawId, scheduledTime: '2026-10-03T11:00' });
  expect(result.error).toEqual(INVALID_DATE);
  expect(scheduleOf(matchUpId)).toMatchObject({ scheduledDate: '2026-10-02', scheduledTime: '10:00' });

  // through a schedule write: refused before anything is written
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledTime: '2026-10-03T11:00', courtOrder: 2 },
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DATE);
  expect(scheduleOf(matchUpId).courtOrder).toBeUndefined();

  // a date given beside a date-time is the matchUp's date
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: '2026-10-03', scheduledTime: '2026-10-01T12:00' },
    matchUpId: other.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(scheduleOf(other.matchUpId)).toMatchObject({ scheduledDate: '2026-10-03', scheduledTime: '12:00' });
});
