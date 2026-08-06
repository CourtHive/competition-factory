import { BLOCKED, MAINTENANCE, PRACTICE } from './bookingTypeValues';

export const DOUBLES_SINGLES = 'DOUBLES_SINGLES';
export const SINGLES_DOUBLES = 'SINGLES_DOUBLES';
export const TOTAL = 'total';

export const CONFLICT_PARTICIPANTS = 'participantConflict';
export const CONFLICT_POTENTIAL_PARTICIPANTS = 'potentialParticipantConflict';
export const CONFLICT_MATCHUP_ORDER = 'matchUpConflict';
export const CONFLICT_COURT_DOUBLE_BOOKING = 'courtDoubleBooking';
export const CONFLICT_POSITION_LINK = 'positionLinkConflict';
export const SCHEDULE_ISSUE_IDS = 'ISSUE_IDS';
export const SCHEDULE_CONFLICT = 'CONFLICT';
export const SCHEDULE_WARNING = 'WARNING';
export const SCHEDULE_ERROR = 'ERROR';
export const SCHEDULE_ISSUE = 'ISSUE';
export const SCHEDULE_STATE = 'STATE';

// Booking types for court grid bookings.
// Re-exported from the generated BookingTypeEnum mirror rather than redefined,
// so there is a single source. The full vocabulary (incl. CLOSED, DRYING,
// RESERVED, SCHEDULED) lives in `bookingTypeConstants`; these three are kept
// here as named exports because they are long-standing published surface via
// `factoryConstants.scheduleConstants`.
export { BLOCKED, MAINTENANCE, PRACTICE };

export const scheduleConstants = {
  SINGLES_DOUBLES,
  DOUBLES_SINGLES,
  TOTAL,

  CONFLICT_MATCHUP_ORDER,
  CONFLICT_PARTICIPANTS,
  CONFLICT_POTENTIAL_PARTICIPANTS,
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_POSITION_LINK,
  SCHEDULE_ISSUE_IDS,
  SCHEDULE_CONFLICT,
  SCHEDULE_WARNING,
  SCHEDULE_ERROR,
  SCHEDULE_ISSUE,
  SCHEDULE_STATE,

  BLOCKED,
  PRACTICE,
  MAINTENANCE,
};
