// Constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, CalendarContext, CalendarEvent, Coordinates } from '@Types/sanctioningTypes';

function eventLabel(event: CalendarEvent): string {
  return event.tournamentName ?? event.sanctioningId ?? 'existing event';
}

export type CalendarConflict = {
  type: 'PROXIMITY' | 'SAME_WEEK' | 'BLACKOUT' | 'MAX_EVENTS_PER_WEEK';
  severity: 'error' | 'warning';
  message: string;
  conflictingEvent?: CalendarEvent;
};

type GetCalendarConflictsArgs = {
  sanctioningRecord: SanctioningRecord;
  calendarContext: CalendarContext;
};

export function getCalendarConflicts({ sanctioningRecord, calendarContext }: GetCalendarConflictsArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!calendarContext) return { error: INVALID_VALUES, context: { message: 'Missing calendarContext' } };

  const { existingEvents } = calendarContext;
  const calendarRules = calendarContext.calendarRules ?? sanctioningRecord.policySnapshot?.calendarRules ?? {};
  const { proposal } = sanctioningRecord;
  const conflicts: CalendarConflict[] = [];

  const proposedStart = new Date(proposal.proposedStartDate);
  const proposedEnd = new Date(proposal.proposedEndDate);

  checkBlackoutDates(calendarRules, proposedStart, proposedEnd, conflicts);

  for (const existing of existingEvents) {
    checkTemporalProximity(calendarRules, proposal, sanctioningRecord, proposedStart, proposedEnd, existing, conflicts);
    checkGeographicProximity(calendarRules, proposal, proposedStart, proposedEnd, existing, conflicts);
  }

  checkMaxEventsPerWeek(calendarRules, existingEvents, proposedStart, conflicts);

  const errors = conflicts.filter((c) => c.severity === 'error');
  const warnings = conflicts.filter((c) => c.severity === 'warning');

  return { ...SUCCESS, conflicts, errors, warnings, hasConflicts: conflicts.length > 0 };
}

function checkBlackoutDates(calendarRules, proposedStart: Date, proposedEnd: Date, conflicts: CalendarConflict[]) {
  if (!calendarRules.blackoutDates?.length) return;

  for (const blackout of calendarRules.blackoutDates) {
    const blackoutDate = new Date(blackout);
    if (blackoutDate >= proposedStart && blackoutDate <= proposedEnd) {
      conflicts.push({
        type: 'BLACKOUT',
        severity: 'error',
        message: `Proposed dates overlap with blackout date: ${blackout}`,
      });
    }
  }
}

function computeGap(proposedStart: Date, proposedEnd: Date, existStart: Date, existEnd: Date) {
  const isOverlapping = proposedStart <= existEnd && proposedEnd >= existStart;
  let gap: number;
  if (isOverlapping) {
    gap = 0;
  } else if (proposedStart > existEnd) {
    gap = proposedStart.getTime() - existEnd.getTime();
  } else {
    gap = existStart.getTime() - proposedEnd.getTime();
  }
  return { gap, isOverlapping };
}

function checkTemporalProximity(calendarRules, proposal, sanctioningRecord, proposedStart: Date, proposedEnd: Date, existing: CalendarEvent, conflicts: CalendarConflict[]) {
  if (!calendarRules.proximityWeeks) return;

  const existStart = new Date(existing.startDate);
  const existEnd = new Date(existing.endDate);
  const proximityMs = calendarRules.proximityWeeks * 7 * 24 * 60 * 60 * 1000;
  const { gap, isOverlapping } = computeGap(proposedStart, proposedEnd, existStart, existEnd);

  if (gap >= proximityMs) return;

  const sameSection =
    !proposal.calendarSection ||
    !existing.calendarSection ||
    proposal.calendarSection === existing.calendarSection;
  const sameTier =
    !sanctioningRecord.sanctioningLevel ||
    !existing.sanctioningTier ||
    sanctioningRecord.sanctioningLevel === existing.sanctioningTier;

  if (!sameSection || !sameTier) return;

  if (isOverlapping) {
    conflicts.push({
      type: 'SAME_WEEK',
      severity: 'error',
      message: `Overlapping dates with ${eventLabel(existing)} (${existing.startDate} - ${existing.endDate})`,
      conflictingEvent: existing,
    });
  } else {
    conflicts.push({
      type: 'PROXIMITY',
      severity: 'warning',
      message: `Within ${calendarRules.proximityWeeks} week(s) of ${eventLabel(existing)} (${existing.startDate} - ${existing.endDate})`,
      conflictingEvent: existing,
    });
  }
}

function checkGeographicProximity(calendarRules, proposal, proposedStart: Date, proposedEnd: Date, existing: CalendarEvent, conflicts: CalendarConflict[]) {
  if (!calendarRules.proximityRadiusKm || !proposal.venues?.length || !existing.coordinates) return;

  const proposedCoords = proposal.venues.find((v) => v.coordinates)?.coordinates;
  if (!proposedCoords) return;

  const existStart = new Date(existing.startDate);
  const existEnd = new Date(existing.endDate);
  const distance = haversineKm(proposedCoords, existing.coordinates);
  if (distance >= calendarRules.proximityRadiusKm) return;

  const isOverlapping = proposedStart <= existEnd && proposedEnd >= existStart;
  if (isOverlapping) {
    conflicts.push({
      type: 'PROXIMITY',
      severity: 'error',
      message: `Within ${Math.round(distance)}km of ${eventLabel(existing)} (min ${calendarRules.proximityRadiusKm}km required)`,
      conflictingEvent: existing,
    });
  }
}

function checkMaxEventsPerWeek(calendarRules, existingEvents: CalendarEvent[], proposedStart: Date, conflicts: CalendarConflict[]) {
  if (!calendarRules.maxEventsPerWeek) return;

  const proposedWeekStart = getWeekStart(proposedStart);
  const overlapping = existingEvents.filter((e) => {
    const eStart = getWeekStart(new Date(e.startDate));
    return eStart.getTime() === proposedWeekStart.getTime();
  });
  if (overlapping.length >= calendarRules.maxEventsPerWeek) {
    conflicts.push({
      type: 'MAX_EVENTS_PER_WEEK',
      severity: 'warning',
      message: `Week already has ${overlapping.length} events (max ${calendarRules.maxEventsPerWeek})`,
    });
  }
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
