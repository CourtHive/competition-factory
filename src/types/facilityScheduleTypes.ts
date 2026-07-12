/**
 * Shared-facility schedule contract.
 *
 * `ScheduleCell` is the slim, transport-agnostic unit of court occupancy — the single shape
 * the shared-facility schedule view speaks, produced by `getScheduleProjection` from one
 * tournamentRecord and merged across linked tournaments by `mergeFacilitySchedule`. It is
 * deliberately minimal (court occupancy, not hydrated participants) so a client can overlay
 * many linked peers without holding their full tournamentRecords, and so the same shape can
 * later be emitted by a server-side read-model without divergence.
 *
 * See planning/LINKED_TOURNAMENTS_AND_SHARED_FACILITY_SCHEDULING.md (§4.5, INV-3/5/6).
 */
export interface ScheduleCell {
  tournamentId: string;
  eventId?: string;
  drawId?: string;
  matchUpId: string;
  venueId?: string;
  courtId?: string;
  courtOrder?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  matchUpStatus?: string;
  matchUpType?: string;
  roundName?: string;
  roundNumber?: number;
  matchUpFormat?: string;
  // minimal side display text (participant names when available); NOT hydrated participants
  labels: string[];
}

export type FacilityScheduleConflictReason = 'SAME_COURT_ORDER' | 'SAME_SCHEDULED_TIME';

/**
 * Advisory double-booking: two or more distinct matchUps claim the same physical court on the
 * same date at the same `courtOrder` (SAME_COURT_ORDER) or the same `scheduledTime`
 * (SAME_SCHEDULED_TIME). Detection only — never blocks a mutation (INV-1/INV-2).
 */
export interface FacilityScheduleConflict {
  venueId: string;
  courtId: string;
  scheduledDate: string;
  reason: FacilityScheduleConflictReason;
  matchUpIds: string[];
  tournamentIds: string[];
  courtOrder?: number;
  scheduledTime?: string;
}

export interface FacilityCourtSchedule {
  venueId: string;
  courtId: string;
  // cells occupying this court, grouped by date, each list sorted by courtOrder then scheduledTime
  dates: { [scheduledDate: string]: ScheduleCell[] };
}

export interface FacilityVenueSchedule {
  venueId: string;
  courts: { [courtId: string]: FacilityCourtSchedule };
}

/**
 * The merged shared-facility view keyed (venueId → courtId → scheduledDate). `unplaced` holds
 * cells that could not be placed on the court grid (missing venueId, courtId, or scheduledDate).
 */
export interface FacilityScheduleGrid {
  venues: { [venueId: string]: FacilityVenueSchedule };
  conflicts: FacilityScheduleConflict[];
  unplaced: ScheduleCell[];
}
