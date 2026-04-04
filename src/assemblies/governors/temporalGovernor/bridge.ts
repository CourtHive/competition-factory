/**
 * Temporal Engine Factory Bridge
 *
 * Translation layer between Temporal Engine and Competition Factory TODS.
 * This module is the ONLY place where engine structures touch TODS structures.
 *
 * Key Functions:
 * - Convert venue rails -> TODS dateAvailability
 * - Update tournamentRecord with availability from engine
 * - Build schedulingProfile from UI selections
 *
 * Design: Pure functions, fully testable, no side effects.
 */

import { BLOCK_TYPES, type BlockType, type CourtRef, type VenueDayTimeline, type RailSegment } from './types';
import { resolveVenueId, resolveCourtId } from './railDerivation';
import type { TemporalEngine } from '@Assemblies/engines/temporal/TemporalEngine';

// ============================================================================
// TODS Type Definitions
// ============================================================================

/**
 * TODS dateAvailability structure
 * Represents when courts are available at a venue
 */
export interface TodsDateAvailability {
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  venueId: string;
  courtIds?: string[]; // Optional: specific courts, or all if omitted
}

/**
 * TODS venue structure (simplified for our needs)
 */
export interface TodsVenue {
  venueId?: string;
  venueName?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  courts?: TodsCourt[];
  dateAvailability?: TodsDateAvailability[];
}

/**
 * TODS court structure (simplified)
 */
export interface TodsCourt {
  courtId?: string;
  courtName?: string;
  surfaceType?: string;
  surfaceCategory?: string;
  courtDimensions?: string;
  indoor?: boolean;
  onlineResources?: any[];
}

/**
 * Scheduling profile round
 */
export interface SchedulingProfileRound {
  eventId: string;
  drawId?: string;
  roundNumber?: number;
  roundSegment?: string;
  matchUpType?: string; // 'SINGLES', 'DOUBLES', etc.
}

/**
 * Scheduling profile item (one date + venues + rounds)
 */
export interface SchedulingProfileItem {
  scheduleDate: string; // 'YYYY-MM-DD'
  venueIds: string[];
  rounds?: SchedulingProfileRound[];
}

/**
 * Complete scheduling profile
 */
export type SchedulingProfile = SchedulingProfileItem[];

/**
 * UI selection for scheduling profile builder
 */
export interface SchedulingSelection {
  scheduleDate: string;
  venueIds: string[];
  rounds: SchedulingProfileRound[];
}

// ============================================================================
// Bridge Configuration
// ============================================================================

export interface BridgeConfig {
  /**
   * Map courtId to TODS courtId (if they differ)
   */
  courtToCourtId?: (courtRef: CourtRef) => string;

  /**
   * Determine if a block status is "schedulable"
   * Default: AVAILABLE, SOFT_BLOCK, RESERVED
   */
  isSchedulableStatus?: (status: BlockType) => boolean;

  /**
   * Whether to aggregate court availability by venue
   * If true, creates one entry per venue with all courtIds
   * If false, creates one entry per court
   */
  aggregateByVenue?: boolean;
}

const DEFAULT_CONFIG: Required<BridgeConfig> = {
  courtToCourtId: (courtRef: CourtRef) => courtRef.courtId,
  isSchedulableStatus: (status: BlockType) =>
    status === BLOCK_TYPES.AVAILABLE || status === BLOCK_TYPES.SOFT_BLOCK || status === BLOCK_TYPES.RESERVED,
  aggregateByVenue: false,
};

// ============================================================================
// Core Translation: Rails -> TODS dateAvailability
// ============================================================================

/**
 * Convert venue timelines to TODS dateAvailability entries.
 *
 * Algorithm:
 * 1. For each venue/court/day, extract contiguous schedulable segments
 * 2. Convert each segment to dateAvailability format
 * 3. Optionally aggregate by venue
 *
 * @param timelines - Venue day timelines from engine
 * @param config - Bridge configuration
 * @returns Array of TODS dateAvailability entries
 */
export function railsToDateAvailability(
  timelines: VenueDayTimeline[],
  config: BridgeConfig = {},
): TodsDateAvailability[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const result: TodsDateAvailability[] = [];

  for (const venueTimeline of timelines) {
    const { day, venueId, rails } = venueTimeline;

    for (const rail of rails) {
      const { court, segments } = rail;
      const courtId = cfg.courtToCourtId(court);

      // Extract contiguous schedulable segments
      const schedulableSegments = extractSchedulableSegments(segments, cfg);

      // Convert each to dateAvailability
      for (const segment of schedulableSegments) {
        result.push({
          date: day,
          startTime: extractTime(segment.start),
          endTime: extractTime(segment.end),
          venueId,
          courtIds: [courtId],
        });
      }
    }
  }

  // Optionally aggregate by venue
  if (cfg.aggregateByVenue) {
    return aggregateAvailabilityByVenue(result);
  }

  return result;
}

/**
 * Extract contiguous schedulable segments from rail segments
 */
function extractSchedulableSegments(
  segments: RailSegment[],
  config: Required<BridgeConfig>,
): Array<{ start: string; end: string }> {
  const schedulable: Array<{ start: string; end: string }> = [];
  let currentStart: string | null = null;
  let lastEnd: string | null = null;

  for (const segment of segments) {
    const isSchedulable = config.isSchedulableStatus(segment.status);

    if (isSchedulable) {
      if (!currentStart) {
        currentStart = segment.start;
      }
      lastEnd = segment.end;
    } else {
      // End of schedulable window
      if (currentStart && lastEnd) {
        schedulable.push({ start: currentStart, end: lastEnd });
      }
      currentStart = null;
      lastEnd = null;
    }
  }

  // Don't forget the last segment
  if (currentStart && lastEnd) {
    schedulable.push({ start: currentStart, end: lastEnd });
  }

  return schedulable;
}

/**
 * Extract time portion from ISO datetime (HH:MM)
 */
function extractTime(isoDateTime: string): string {
  // Handle both 'YYYY-MM-DDTHH:MM:SS' and 'YYYY-MM-DDTHH:MM:SS.sssZ'
  const timePart = isoDateTime.slice(11, 16); // 'HH:MM'
  return timePart;
}

/**
 * Aggregate availability entries by venue
 * Combines entries with same date/time/venue into single entry with multiple courtIds
 */
function aggregateAvailabilityByVenue(entries: TodsDateAvailability[]): TodsDateAvailability[] {
  const aggregated = new Map<string, TodsDateAvailability>();

  for (const entry of entries) {
    const key = `${entry.venueId}|${entry.date}|${entry.startTime}|${entry.endTime}`;

    if (aggregated.has(key)) {
      const existing = aggregated.get(key)!;
      if (entry.courtIds) {
        existing.courtIds = [...(existing.courtIds ?? []), ...entry.courtIds];
      }
    } else {
      aggregated.set(key, { ...entry });
    }
  }

  return Array.from(aggregated.values());
}

// ============================================================================
// Tournament Record Integration
// ============================================================================

/**
 * Apply temporal availability to a tournament record.
 * Updates venue dateAvailability fields with data from engine.
 *
 * @param tournamentRecord - TODS tournament record
 * @param timelines - Venue day timelines from engine
 * @param config - Bridge configuration
 * @returns Updated tournament record (new object, doesn't mutate input)
 */
export function applyTemporalAvailabilityToTournamentRecord(params: {
  tournamentRecord: any;
  timelines: VenueDayTimeline[];
  config?: BridgeConfig;
  engine?: TemporalEngine;
}): any {
  const { tournamentRecord, timelines, config = {}, engine } = params;

  // Generate dateAvailability from timelines
  const dateAvailability = railsToDateAvailability(timelines, config);

  // Clone tournament record (don't mutate input)
  const updated = structuredClone(tournamentRecord);

  // Group availability by venueId
  const byVenue = new Map<string, TodsDateAvailability[]>();
  for (const entry of dateAvailability) {
    const existing = byVenue.get(entry.venueId) ?? [];
    existing.push(entry);
    byVenue.set(entry.venueId, existing);
  }

  // Update venues in tournament record
  if (updated.venues && Array.isArray(updated.venues)) {
    const engineConfig = engine?.getConfig();
    const tournamentId = engineConfig?.tournamentId;

    for (const venue of updated.venues) {
      const venueId = resolveVenueId(venue);
      const availability = byVenue.get(venueId);

      if (availability) {
        venue.dateAvailability = availability;
      }

      // Write venue defaults from engine if available
      if (engine && tournamentId) {
        const venueDefaults = engine.getVenueAvailability(tournamentId, venueId);
        if (venueDefaults) {
          venue.defaultStartTime = venueDefaults.startTime;
          venue.defaultEndTime = venueDefaults.endTime;
        }
      }
    }
  }

  return updated;
}

// ============================================================================
// Scheduling Profile Builder
// ============================================================================

/**
 * Build a scheduling profile from UI selections.
 * Transforms UI state into Competition Factory's scheduling profile format.
 *
 * @param selections - Array of user selections (date + venues + rounds)
 * @returns Scheduling profile ready for Competition Factory
 */
export function buildSchedulingProfileFromUISelections(selections: SchedulingSelection[]): SchedulingProfile {
  // Validate and normalize selections
  const profile: SchedulingProfile = [];

  for (const selection of selections) {
    // Skip empty selections
    if (!selection.scheduleDate || !selection.venueIds.length) {
      continue;
    }

    profile.push({
      scheduleDate: selection.scheduleDate,
      venueIds: selection.venueIds,
      rounds: selection.rounds ?? [],
    });
  }

  return profile;
}

// ============================================================================
// Reverse Translation: TODS -> Engine Blocks
// ============================================================================

/**
 * Convert TODS dateAvailability to engine blocks.
 * Useful for initializing engine from existing tournament data.
 *
 * @param venue - TODS venue with dateAvailability
 * @param tournamentId - Tournament ID for block references
 * @returns Array of blocks representing availability
 */
export function todsAvailabilityToBlocks(params: {
  venue: TodsVenue;
  tournamentId: string;
  blockType?: BlockType;
}): Array<{
  court: CourtRef;
  start: string;
  end: string;
  type: BlockType;
}> {
  const { venue, tournamentId, blockType = BLOCK_TYPES.AVAILABLE } = params;
  const blocks: Array<{
    court: CourtRef;
    start: string;
    end: string;
    type: BlockType;
  }> = [];

  if (!venue.dateAvailability) {
    return blocks;
  }

  const venueId = resolveVenueId(venue);

  for (const availability of venue.dateAvailability) {
    const { date, startTime, endTime, courtIds } = availability;

    // If courtIds specified, create blocks for those courts
    if (courtIds && courtIds.length > 0) {
      for (const courtId of courtIds) {
        blocks.push({
          court: {
            tournamentId,
            venueId: venueId,
            courtId,
          },
          start: `${date}T${startTime}:00`,
          end: `${date}T${endTime}:00`,
          type: blockType,
        });
      }
    } else if (venue.courts && venue.courts.length > 0) {
      // No specific courts - apply to all courts in venue
      for (const court of venue.courts) {
        const courtId = resolveCourtId(court);
        blocks.push({
          court: {
            tournamentId,
            venueId: venueId,
            courtId,
          },
          start: `${date}T${startTime}:00`,
          end: `${date}T${endTime}:00`,
          type: blockType,
        });
      }
    }
  }

  return blocks;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a scheduling profile is well-formed
 */
export function validateSchedulingProfileFormat(profile: SchedulingProfile): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(profile)) {
    errors.push('Profile must be an array');
    return { valid: false, errors };
  }

  for (let i = 0; i < profile.length; i++) {
    const item = profile[i];

    if (!item.scheduleDate) {
      errors.push(`Item ${i}: missing scheduleDate`);
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(item.scheduleDate)) {
      errors.push(`Item ${i}: invalid scheduleDate format (expected YYYY-MM-DD)`);
    }

    if (!item.venueIds || !Array.isArray(item.venueIds) || item.venueIds.length === 0) {
      errors.push(`Item ${i}: missing or empty venueIds array`);
    }

    if (item.rounds) {
      if (!Array.isArray(item.rounds)) {
        errors.push(`Item ${i}: rounds must be an array`);
      } else {
        for (let j = 0; j < item.rounds.length; j++) {
          const round = item.rounds[j];
          if (!round.eventId) {
            errors.push(`Item ${i}, round ${j}: missing eventId`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate TODS dateAvailability entries
 */
export function validateDateAvailability(entries: TodsDateAvailability[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(entries)) {
    errors.push('Entries must be an array');
    return { valid: false, errors };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      errors.push(`Entry ${i}: invalid or missing date`);
    }

    if (!entry.startTime || !/^\d{2}:\d{2}$/.test(entry.startTime)) {
      errors.push(`Entry ${i}: invalid or missing startTime (expected HH:MM)`);
    }

    if (!entry.endTime || !/^\d{2}:\d{2}$/.test(entry.endTime)) {
      errors.push(`Entry ${i}: invalid or missing endTime (expected HH:MM)`);
    }

    if (entry.startTime && entry.endTime && entry.startTime >= entry.endTime) {
      errors.push(`Entry ${i}: startTime must be before endTime`);
    }

    if (!entry.venueId) {
      errors.push(`Entry ${i}: missing venueId`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merge overlapping availability entries
 * Useful for simplifying availability after bulk operations
 */
export function mergeOverlappingAvailability(entries: TodsDateAvailability[]): TodsDateAvailability[] {
  if (entries.length === 0) return entries;

  // Group by venue and date
  const groups = new Map<string, TodsDateAvailability[]>();
  for (const entry of entries) {
    const key = `${entry.venueId}|${entry.date}`;
    const existing = groups.get(key) ?? [];
    existing.push(entry);
    groups.set(key, existing);
  }

  const merged: TodsDateAvailability[] = [];

  for (const groupEntries of groups.values()) {
    // Sort by start time
    groupEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));

    let current = { ...groupEntries[0] };

    for (let i = 1; i < groupEntries.length; i++) {
      const next = groupEntries[i];

      // Check if we can merge (overlapping or adjacent)
      if (next.startTime <= current.endTime) {
        // Merge: extend current to cover next
        current.endTime = next.endTime > current.endTime ? next.endTime : current.endTime;

        // Merge courtIds if present
        if (current.courtIds && next.courtIds) {
          current.courtIds = [...new Set([...current.courtIds, ...next.courtIds])];
        }
      } else {
        // Can't merge - push current and start new
        merged.push(current);
        current = { ...next };
      }
    }

    // Don't forget the last one
    merged.push(current);
  }

  return merged;
}

/**
 * Calculate total court-hours from availability entries
 */
export function calculateCourtHours(entries: TodsDateAvailability[]): number {
  let totalHours = 0;

  for (const entry of entries) {
    const startMinutes = timeToMinutes(entry.startTime);
    const endMinutes = timeToMinutes(entry.endTime);
    const durationHours = (endMinutes - startMinutes) / 60;
    const courtCount = entry.courtIds?.length || 1;

    totalHours += durationHours * courtCount;
  }

  return totalHours;
}

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
