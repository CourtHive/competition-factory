import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * `allocatedCourts` round-trip.
 *
 * A TEAM matchUp's court allocation is WRITTEN as `schedule.courtIds` (bare
 * strings) and READ back as `schedule.allocatedCourts` (court objects, hydrated
 * with names). `addMatchUpScheduleItems` used to destructure only `courtIds`,
 * so writing back a schedule you had just read dropped the allocation with no
 * error — the write simply ignored the key it did not recognise.
 */

const DRAW_ID = 'drawId';
const VENUE_ID = 'venueId';
const SCHEDULED_DATE = '2026-06-22';

function seed() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: VENUE_ID }],
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    startDate: SCHEDULED_DATE,
    endDate: '2026-06-28',
    setState: true,
  });
  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const matchUpIds = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m: any) => m.matchUpType === TEAM)
    .map((m: any) => m.matchUpId);
  return { matchUpId: matchUpIds[0], matchUpIds, courts };
}

const scheduleOf = (matchUpId: string) =>
  tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId)?.schedule;

it('accepts allocatedCourts as an alias for courtIds', () => {
  const { matchUpId, courts } = seed();

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, allocatedCourts: [courts[0].courtId, courts[1].courtId] },
    matchUpId,
    drawId: DRAW_ID,
  });
  expect(result.success).toEqual(true);
  expect(scheduleOf(matchUpId)?.allocatedCourts?.length).toEqual(2);
});

it('transfers an allocation carried on a schedule read off another matchUp', () => {
  // The defect this closes is a write that IGNORES the key, not one that wipes
  // it: re-writing a schedule onto the SAME matchUp passes either way, because
  // an absent `courtIds` simply leaves the existing allocation untouched. The
  // test therefore has to apply the read-back schedule to a DIFFERENT matchUp,
  // where the allocation must actually be transferred to survive.
  const { matchUpIds, courts } = seed();
  const [source, target] = matchUpIds;

  tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, courtIds: [courts[0].courtId, courts[1].courtId] },
    matchUpId: source,
    drawId: DRAW_ID,
  });

  // read it back — hydrated court objects, carrying courtName / venueName
  const readBack = scheduleOf(source);
  expect(readBack?.allocatedCourts?.[0]?.courtName).not.toBeUndefined();
  expect(scheduleOf(target)?.allocatedCourts).toBeUndefined();

  // …and apply exactly that object to another matchUp, as a scenario placement
  // or a copy-the-schedule caller would
  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { ...readBack },
    matchUpId: target,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();

  const allocated = scheduleOf(target)?.allocatedCourts ?? [];
  expect(allocated.length).toEqual(2);
  expect(allocated.map((c: any) => c.courtId).toSorted((a: string, b: string) => a.localeCompare(b))).toEqual(
    [courts[0].courtId, courts[1].courtId].toSorted((a, b) => a.localeCompare(b)),
  );
});

it('lets an explicit courtIds win when a caller supplies both', () => {
  const { matchUpId, courts } = seed();

  tournamentEngine.addMatchUpScheduleItems({
    schedule: {
      allocatedCourts: [{ courtId: courts[2].courtId }, { courtId: courts[3].courtId }],
      courtIds: [courts[0].courtId],
      scheduledDate: SCHEDULED_DATE,
    },
    matchUpId,
    drawId: DRAW_ID,
  });

  const allocated = scheduleOf(matchUpId)?.allocatedCourts ?? [];
  expect(allocated.length).toEqual(1);
  expect(allocated[0].courtId).toEqual(courts[0].courtId);
});

it('ignores a non-array allocatedCourts rather than erroring', () => {
  const { matchUpId } = seed();
  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, allocatedCourts: 'not-an-array' },
    matchUpId,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
  expect(scheduleOf(matchUpId)?.allocatedCourts).toBeUndefined();
});
