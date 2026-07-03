import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

import { MATCHUPS_SCHEDULED_OUTSIDE_DATES } from '@Constants/errorConditionConstants';
import { DUAL, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

/**
 * Write-mode parity for unscheduling.
 *
 * The default vitest setup hook (setSchemaWriteModeLegacy) pins every other test
 * to LEGACY, where schedule data lives in `matchUp.timeItems[]`. Production TMX +
 * server run in the default NATIVE mode, where schedule data is first-class
 * `matchUp.schedule.*` with no timeItem mirror. `clearScheduledMatchUps` used to
 * only strip timeItems, so unscheduling was a silent no-op in NATIVE — a date
 * change that force-unscheduled a matchUp returned SCHEDULE_NOT_CLEARED and left
 * the placement intact. These tests exercise NATIVE and DUAL explicitly so the
 * regression can't hide behind the LEGACY-pinned suite again.
 */

// The setup hook re-pins LEGACY before each test; restore it after each so a
// mode set here doesn't leak into unrelated specs sharing the module worker.
afterEach(() => setSchemaWriteMode(LEGACY));

function scheduleOutOfRange(mode: string) {
  setSchemaWriteMode(mode as any);
  const drawId = 'drawId';
  const venueProfiles = [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: 'venueId' }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    drawProfiles: [{ drawId, drawSize: 32 }],
    startDate: '2026-06-22',
    endDate: '2026-06-28',
  });
  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const target = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m) => m.roundNumber === 1 && m.sides?.every((s) => s.participant));
  // catalog-style placement: date + court + courtOrder, no scheduledTime
  tournamentEngine.addMatchUpScheduleItems({
    drawId,
    matchUpId: target.matchUpId,
    removePriorValues: true,
    schedule: { scheduledDate: '2026-06-22', courtOrder: 3, venueId: 'venueId', courtId: courts[2].courtId },
  });
  // "called to court" stamp — a full unschedule must drop this too
  tournamentEngine.setMatchUpCalledAt({ drawId, matchUpId: target.matchUpId, calledAt: '2026-06-22T09:00:00.000Z' });
  return { drawId, matchUpId: target.matchUpId };
}

function rawMatchUp(tournamentRecord: any, matchUpId: string) {
  for (const event of tournamentRecord.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? [])
        for (const matchUp of structure.matchUps ?? []) if (matchUp.matchUpId === matchUpId) return matchUp;
  return undefined;
}

it.each([NATIVE, DUAL, LEGACY])('clearScheduledMatchUps clears the placement in %s write mode', (mode) => {
  const { matchUpId } = scheduleOutOfRange(mode);
  // operate on (and assert against) the same record instance the function mutates
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;

  const result = clearScheduledMatchUps({ scheduledDates: ['2026-06-22'], tournamentRecord });
  expect(result.clearedScheduleCount).toEqual(1);

  const after = rawMatchUp(tournamentRecord, matchUpId);
  expect(after.schedule?.scheduledDate).toBeUndefined();
  expect(after.schedule?.courtId).toBeUndefined();
  expect(after.schedule?.courtOrder).toBeUndefined();
  expect(after.schedule?.calledAt).toBeUndefined();
  // legacy schedule timeItems are also gone
  const scheduleTimeItems = (after.timeItems ?? []).filter((ti: any) => ti.itemType?.startsWith('SCHEDULE.'));
  expect(scheduleTimeItems.length).toEqual(0);
});

it.each([NATIVE, DUAL, LEGACY])(
  'setTournamentDates force-unschedules an out-of-range matchUp in %s write mode',
  (mode) => {
    const { matchUpId } = scheduleOutOfRange(mode);

    // without force → blocked (non-completed matchUp scheduled outside range)
    const blocked = tournamentEngine.setTournamentDates({ startDate: '2026-06-23' });
    expect(blocked.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);

    // with force → proceeds and clears the placement (this returned SCHEDULE_NOT_CLEARED
    // in NATIVE before the first-class clear was added)
    const forced = tournamentEngine.setTournamentDates({ startDate: '2026-06-23', force: true });
    expect(forced.success).toEqual(true);
    expect(forced.unscheduledMatchUpIds).toEqual([matchUpId]);
    expect(tournamentEngine.getTournamentInfo().tournamentInfo.startDate).toEqual('2026-06-23');

    const after = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === matchUpId);
    expect(after.schedule?.scheduledDate).toBeUndefined();
  },
);
