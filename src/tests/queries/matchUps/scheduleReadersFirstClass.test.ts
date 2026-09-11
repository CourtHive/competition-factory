import { matchUpAllocatedCourts } from '@Query/matchUp/courtAllocations';
import { getHomeParticipantId } from '@Query/matchUp/getHomeParticipantId';
import { matchUpAssignedVenueId } from '@Query/matchUp/venueAssignment';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { matchUpAssignedCourtId } from '@Query/matchUp/courtAssignment';
import { matchUpTimeModifiers } from '@Query/matchUp/timeModifiers';
import { matchUpCourtOrder } from '@Query/matchUp/courtOrder';
import { describe, expect, it } from 'vitest';

import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_VENUE,
  COURT_ORDER,
  HOME_PARTICIPANT_ID,
  SCHEDULED_TIME,
  TIME_MODIFIERS,
} from '@Constants/timeItemConstants';

/**
 * CODES Phase 2 promoted schedule attributes from `matchUp.timeItems[]` to first-class
 * `matchUp.schedule.*`. Production runs NATIVE (first-class only, no timeItem mirror), but the
 * suite is pinned to LEGACY — so these readers were silently timeItem-only and under-returned in
 * production (schedule filters/reports returning nothing). This mode-independent spec constructs
 * each representation directly and asserts the contract: prefer first-class, fall back to the
 * legacy timeItem, first-class wins when both are present (BRIDGE).
 *
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */

const readers = [
  {
    name: 'scheduledTime',
    fn: scheduledMatchUpTime,
    attr: 'scheduledTime',
    itemType: SCHEDULED_TIME,
    fc: '2020-01-01T09:00',
    legacy: '2020-01-01T07:00',
  },
  {
    name: 'courtId',
    fn: matchUpAssignedCourtId,
    attr: 'courtId',
    itemType: ASSIGN_COURT,
    fc: 'court-first-class',
    legacy: 'court-legacy',
  },
  {
    name: 'venueId',
    fn: matchUpAssignedVenueId,
    attr: 'venueId',
    itemType: ASSIGN_VENUE,
    fc: 'venue-first-class',
    legacy: 'venue-legacy',
  },
  { name: 'courtOrder', fn: matchUpCourtOrder, attr: 'courtOrder', itemType: COURT_ORDER, fc: 3, legacy: 7 },
  {
    name: 'allocatedCourts',
    fn: matchUpAllocatedCourts,
    attr: 'allocatedCourts',
    itemType: ALLOCATE_COURTS,
    fc: [{ courtId: 'fc' }],
    legacy: [{ courtId: 'legacy' }],
  },
  {
    name: 'timeModifiers',
    fn: matchUpTimeModifiers,
    attr: 'timeModifiers',
    itemType: TIME_MODIFIERS,
    fc: ['fc-modifier'],
    legacy: ['legacy-modifier'],
  },
  {
    name: 'homeParticipantId',
    fn: getHomeParticipantId,
    attr: 'homeParticipantId',
    itemType: HOME_PARTICIPANT_ID,
    fc: 'home-first-class',
    legacy: 'home-legacy',
  },
];

describe('schedule readers resolve first-class with timeItem fallback', () => {
  it.each(readers)('$name — first-class only (NATIVE)', ({ fn, attr, fc }) => {
    const result: any = fn({ matchUp: { schedule: { [attr]: fc } } } as any);
    expect(result[attr]).toEqual(fc);
  });

  it.each(readers)('$name — timeItem only (LEGACY / unmigrated)', ({ fn, attr, itemType, legacy }) => {
    const result: any = fn({ matchUp: { timeItems: [{ itemType, itemValue: legacy }] } } as any);
    expect(result[attr]).toEqual(legacy);
  });

  it.each(readers)('$name — first-class wins when both present (BRIDGE)', ({ fn, attr, itemType, fc, legacy }) => {
    const result: any = fn({
      matchUp: { schedule: { [attr]: fc }, timeItems: [{ itemType, itemValue: legacy }] },
    } as any);
    expect(result[attr]).toEqual(fc);
  });

  it.each(readers)('$name — undefined when neither present', ({ fn, attr }) => {
    const result: any = fn({ matchUp: {} } as any);
    expect(result[attr]).toBeUndefined();
  });
});
