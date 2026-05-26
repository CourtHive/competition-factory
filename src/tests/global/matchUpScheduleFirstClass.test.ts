/**
 * CODES Phase 2 — first-class promotion of schedule-related timeItems
 * (SCHEDULED_DATE, SCHEDULED_TIME, ASSIGN_COURT, ASSIGN_VENUE, COURT_ORDER,
 * COURT_ANNOTATION, ALLOCATE_COURTS, TIME_MODIFIERS, HOME_PARTICIPANT_ID,
 * ASSIGN_OFFICIAL) on matchUps.
 *
 * Verifies that the schedule writers behave consistently across NATIVE,
 * DUAL, and LEGACY modes and that buildFullSchedule reads them
 * symmetrically through the hydration shim. Lifecycle items
 * (START_TIME / STOP_TIME / RESUME_TIME / END_TIME) remain as timeItems —
 * matchUpDuration() depends on the ordered history — and are not exercised
 * here.
 *
 * The existing test fleet keeps its LEGACY assertions via the vitest
 * setupFiles pin; these tests own the new behavior.
 */
import { describe, expect, it } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import tournamentEngine from '../engines/syncEngine';
import { getTimeItem } from '@Query/base/timeItems';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { DUAL, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { SINGLES } from '@Constants/eventConstants';
import { ASSIGN_COURT, ASSIGN_VENUE, COURT_ORDER, SCHEDULED_DATE, SCHEDULED_TIME } from '@Constants/timeItemConstants';

function setupSingleMatchUpTournament() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    drawProfiles: [{ drawSize: 4, eventType: SINGLES }],
    venueProfiles: [{ venueName: 'Center', courtsCount: 2 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const matchUp =
    matchUps.find((m: any) => m.sides?.every((s: any) => s?.participantId) && m.roundNumber === 1) ??
    matchUps.find((m: any) => m.roundNumber === 1) ??
    matchUps[0];
  return { tournamentRecord, drawId, matchUpId: matchUp.matchUpId };
}

function rawMatchUp(drawId: string, matchUpId: string) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  for (const structure of drawDefinition.structures) {
    const match = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
    if (match) return match;
  }
  return undefined;
}

describe.each([NATIVE, DUAL, LEGACY] as SchemaWriteMode[])('matchUp.schedule.* end-to-end (mode=%s)', (mode) => {
  function assertSurfaces(rawMu: any, attribute: string, itemType: string, expected: any) {
    const firstClass = rawMu.schedule?.[attribute];
    const ti = (rawMu.timeItems ?? []).find((t: any) => t?.itemType === itemType);
    if (mode === NATIVE) {
      expect(firstClass).toEqual(expected);
      expect(ti).toBeUndefined();
    } else if (mode === DUAL) {
      expect(firstClass).toEqual(expected);
      expect(ti?.itemValue).toEqual(expected);
    } else {
      expect(firstClass).toBeUndefined();
      expect(ti?.itemValue).toEqual(expected);
    }
  }

  it('addMatchUpScheduledDate routes to the correct surface(s)', () => {
    setSchemaWriteMode(mode);
    const { drawId, matchUpId } = setupSingleMatchUpTournament();

    const r = tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2026-01-05' });
    expect(r.success).toEqual(true);
    assertSurfaces(rawMatchUp(drawId, matchUpId), 'scheduledDate', SCHEDULED_DATE, '2026-01-05');
  });

  it('addMatchUpScheduledTime routes correctly', () => {
    setSchemaWriteMode(mode);
    const { drawId, matchUpId } = setupSingleMatchUpTournament();

    const r = tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '14:00' });
    expect(r.success).toEqual(true);

    const raw = rawMatchUp(drawId, matchUpId);
    const written =
      mode === LEGACY
        ? (raw.timeItems ?? []).find((t: any) => t?.itemType === SCHEDULED_TIME)?.itemValue
        : raw.schedule?.scheduledTime;
    expect(written).toContain('14:00');
  });

  it('addMatchUpCourtOrder routes correctly', () => {
    setSchemaWriteMode(mode);
    const { drawId, matchUpId } = setupSingleMatchUpTournament();

    const r = tournamentEngine.addMatchUpCourtOrder({ drawId, matchUpId, courtOrder: 3 });
    expect(r.success).toEqual(true);
    assertSurfaces(rawMatchUp(drawId, matchUpId), 'courtOrder', COURT_ORDER, 3);
  });

  it('assignMatchUpVenue routes correctly', () => {
    setSchemaWriteMode(mode);
    const { tournamentRecord, drawId, matchUpId } = setupSingleMatchUpTournament();
    const venueId = tournamentRecord.venues[0].venueId;

    const r = tournamentEngine.assignMatchUpVenue({ drawId, matchUpId, venueId });
    expect(r.success).toEqual(true);
    assertSurfaces(rawMatchUp(drawId, matchUpId), 'venueId', ASSIGN_VENUE, venueId);
  });

  it('assignMatchUpCourt routes correctly', () => {
    setSchemaWriteMode(mode);
    const { tournamentRecord, drawId, matchUpId } = setupSingleMatchUpTournament();
    const venue = tournamentRecord.venues[0];
    const courtId = venue.courts[0].courtId;

    const r = tournamentEngine.assignMatchUpCourt({
      drawId,
      matchUpId,
      courtId,
      courtDayDate: '2026-01-05',
    });
    expect(r.success).toEqual(true);
    assertSurfaces(rawMatchUp(drawId, matchUpId), 'courtId', ASSIGN_COURT, courtId);
  });
});

describe('Hydration shim — buildFullSchedule reads first-class then timeItem', () => {
  it.each([NATIVE, DUAL, LEGACY] as SchemaWriteMode[])(
    'mode=%s produces the same hydrated matchUp.schedule.scheduledDate',
    (mode) => {
      setSchemaWriteMode(mode);
      const { drawId, matchUpId } = setupSingleMatchUpTournament();

      tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2026-01-05' });
      tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '10:30' });

      // hydrate via inContext: true so buildFullSchedule runs over the matchUp
      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
      const hydrated = matchUps.find((m: any) => m.matchUpId === matchUpId);
      expect(hydrated.schedule?.scheduledDate).toEqual('2026-01-05');
      expect(hydrated.schedule?.scheduledTime).toContain('10:30');
    },
  );
});

describe('NATIVE invariant — schedule timeItems are stripped on first-class writes', () => {
  it('LEGACY-written timeItem is removed when a NATIVE write replaces it', () => {
    setSchemaWriteMode(LEGACY);
    const { drawId, matchUpId } = setupSingleMatchUpTournament();
    tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2026-01-05' });

    // Legacy write produced a timeItem
    const beforeRaw = rawMatchUp(drawId, matchUpId);
    expect(getTimeItem({ element: beforeRaw, itemType: SCHEDULED_DATE }).timeItem).toBeDefined();
    expect(beforeRaw.schedule?.scheduledDate).toBeUndefined();

    // Switch to NATIVE and overwrite
    setSchemaWriteMode(NATIVE);
    tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2026-01-07' });

    const afterRaw = rawMatchUp(drawId, matchUpId);
    expect(afterRaw.schedule?.scheduledDate).toEqual('2026-01-07');
    const remainingScheduledDates = (afterRaw.timeItems ?? []).filter((t: any) => t?.itemType === SCHEDULED_DATE);
    expect(remainingScheduledDates).toHaveLength(0);
  });
});

describe('clearMatchUpSchedule wipes both surfaces', () => {
  it('removes the timeItem AND the first-class attribute (DUAL fixture)', () => {
    setSchemaWriteMode(DUAL);
    const { drawId, matchUpId } = setupSingleMatchUpTournament();
    tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: '2026-01-05' });
    tournamentEngine.addMatchUpCourtOrder({ drawId, matchUpId, courtOrder: 2 });

    // DUAL wrote both
    const before = rawMatchUp(drawId, matchUpId);
    expect(before.schedule?.scheduledDate).toEqual('2026-01-05');
    expect(before.schedule?.courtOrder).toEqual(2);
    expect((before.timeItems ?? []).some((t: any) => t?.itemType === SCHEDULED_DATE)).toEqual(true);

    tournamentEngine.clearMatchUpSchedule({ drawId, matchUpId });

    const after = rawMatchUp(drawId, matchUpId);
    expect(after.schedule?.scheduledDate).toBeUndefined();
    // clearMatchUpSchedule's default scheduleAttributes does not include COURT_ORDER,
    // so the courtOrder write should survive.
    expect(after.schedule?.courtOrder).toEqual(2);
    expect((after.timeItems ?? []).some((t: any) => t?.itemType === SCHEDULED_DATE)).toEqual(false);
  });
});
