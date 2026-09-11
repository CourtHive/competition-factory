/**
 * Plan State - Scheduling Profile Plan Items
 *
 * Defines the types and helpers for managing scheduling plan items.
 * A plan represents which event/draw/rounds are assigned to which
 * day and venue, enabling the scheduling profile workflow.
 */

import type { DayId, VenueId } from './types';

// ============================================================================
// Plan Item Types
// ============================================================================

export interface PlanItem {
  planItemId: string; // computed: day|venueId|eventId|drawId|R{roundNumber}
  day: DayId;
  venueId: VenueId;
  eventId: string;
  drawId?: string;
  structureId?: string;
  roundNumber: number;
  roundSegment?: { segmentNumber: number; segmentsCount: number };
  matchUpType?: string; // 'SINGLES', 'DOUBLES', etc.
  notBeforeTime?: string; // 'HH:MM'
  estimatedDurationMinutes?: number;
}

export interface DayPlan {
  day: DayId;
  items: PlanItem[];
}

// ============================================================================
// Plan Item ID Computation
// ============================================================================

/**
 * Compute the canonical planItemId from a PlanItem's key fields.
 *
 * Format: day|venueId|eventId[|drawId]|R{roundNumber}
 *
 * The planItemId uniquely identifies a plan item by its scheduling key fields.
 * Two items with the same key fields will produce the same ID, which is used
 * for deduplication (replace-on-add semantics).
 */
export function computePlanItemId(
  item: Pick<PlanItem, 'day' | 'venueId' | 'eventId' | 'drawId' | 'roundNumber'>,
): string {
  const parts = [item.day, item.venueId, item.eventId];
  if (item.drawId) parts.push(item.drawId);
  parts.push(`R${item.roundNumber}`);
  return parts.join('|');
}
