import { AVAILABLE, IF_NEEDED, UNAVAILABLE } from '@Constants/availabilityConstants';

// Person-declarations tier payload types. Phase 1 covers the AVAILABILITY
// declaration only (jim.tennis-shaped, per-day, no times). Other declaration
// payloads (REGISTRATION, OFFICIAL_SELF_NOMINATION, …) share the envelope but
// are added as those types are built.

// A day carrying no explicit state is NOT_SET (absent from `days`); the three
// positive states below are the only values ever stored in the map.
export type DayState = typeof AVAILABLE | typeof IF_NEEDED | typeof UNAVAILABLE;

export type AvailabilityTimeAway = {
  from: string; // 'YYYY-MM-DD' inclusive
  to: string; // 'YYYY-MM-DD' inclusive
  reason?: string;
};

export type AvailabilityPayload = {
  span: { from: string; to: string }; // rolling window the declaration covers ('YYYY-MM-DD')
  days: { [date: string]: DayState }; // sparse; a date absent from the map is NOT_SET
  timeAway?: AvailabilityTimeAway[]; // date-range overrides forcing UNAVAILABLE (mark-time-away)
  currentThroughWeek?: string; // 'YYYY-MM-DD' "up to date as of" nudge (advisory)
};
