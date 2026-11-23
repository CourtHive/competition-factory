import { setSchemaWriteMode } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { BRIDGE, LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

/**
 * A court CLEAR needs no day. `addMatchUpScheduleItems` applies `courtId` only together with a `scheduledDate`, which
 * is right for an assignment (a court is assigned for a day) and wrong for a clear: TMX's "take it off the court, keep
 * its time" sends `{ courtId: '', venueId: '', courtOrder: '' }` with no date, and the court was silently kept while
 * the venue and order were cleared — a matchUp on no grid cell and in neither sidebar list (production, 2026-11-17;
 * TMX#2022 works around it by sending the date).
 */
describe('clearing a court without a scheduledDate', () => {
  afterEach(() => setSchemaWriteMode(LEGACY));

  function setup(mode: string) {
    setSchemaWriteMode(mode as any);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      venueProfiles: [{ courtsCount: 2 }],
      startDate: '2026-11-17',
      endDate: '2026-11-17',
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const matchUp = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps[0];
    const { drawId, matchUpId } = matchUp;
    const court = courts[0];
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      removePriorValues: true,
      schedule: {
        scheduledDate: '2026-11-17',
        scheduledTime: '09:00',
        courtId: court.courtId,
        venueId: court.venueId,
        courtOrder: 1,
      },
    });
    expect(result.success).toEqual(true);
    const read = () => tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.schedule;
    expect(read()).toMatchObject({ courtId: court.courtId, courtOrder: 1, scheduledTime: '09:00' });
    return { drawId, matchUpId, court, read };
  }

  it.each([LEGACY, BRIDGE, NATIVE])('clears the court and keeps the day and time (%s)', (mode) => {
    const { drawId, matchUpId, read } = setup(mode);

    let result: any = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      removePriorValues: true,
      schedule: { courtId: '', venueId: '', courtOrder: '' },
    });
    expect(result.success).toEqual(true);

    const schedule = read();
    expect(schedule.courtId).toBeUndefined();
    expect(schedule.venueId).toBeUndefined();
    expect(schedule.courtOrder).toBeUndefined();
    expect(schedule).toMatchObject({ scheduledDate: '2026-11-17', scheduledTime: '09:00' });
  });

  it.each([LEGACY, BRIDGE, NATIVE])(
    'an assignment still needs its day: a court without a date is not applied (%s)',
    (mode) => {
      const { drawId, matchUpId, court, read } = setup(mode);
      const { courts } = tournamentEngine.getVenuesAndCourts();
      const other = courts.find((c) => c.courtId !== court.courtId);

      let result: any = tournamentEngine.addMatchUpScheduleItems({
        drawId,
        matchUpId,
        schedule: { courtId: other.courtId },
      });
      expect(result.success).toEqual(true);
      expect(read().courtId).toEqual(court.courtId);
    },
  );
});
