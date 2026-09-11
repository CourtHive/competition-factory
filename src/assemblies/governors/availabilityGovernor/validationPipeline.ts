/**
 * Validation Pipeline
 *
 * Multi-phase validation system for scheduling plans against engine state.
 * Runs validators in ordered phases and collects rule results with severity.
 *
 * Phases:
 * - PRECHECK: Basic data validity (valid venueId, day)
 * - INTEGRITY: No duplicate plan items
 * - ORDERING: Round ordering and dependency checks
 * - CAPACITY: Demand vs available court-hours
 */

import type { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import type { DayId } from './types';
import type { DayPlan } from './planState';

// ============================================================================
// Types
// ============================================================================

export type ValidationPhase = 'PRECHECK' | 'INTEGRITY' | 'ORDERING' | 'CAPACITY';

export type ValidationSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface FixAction {
  type: string;
  description: string;
  payload?: any;
}

export interface RuleResult {
  ruleId: string;
  phase: ValidationPhase;
  severity: ValidationSeverity;
  message: string;
  context?: {
    day?: string;
    venueId?: string;
    planItemId?: string;
  };
  fixAction?: FixAction;
}

export type IssueIndex = Map<string, RuleResult[]>;

export interface ValidationPipelineResult {
  results: RuleResult[];
  issueIndex: IssueIndex;
}

export interface ValidationPipelineParams {
  engine: AvailabilityEngine;
  day?: DayId;
  phases?: ValidationPhase[];
}

// ============================================================================
// Built-in Validators
// ============================================================================

/**
 * PRECHECK: Validate that plan items reference valid venues and days.
 */
function validatePrecheck(engine: AvailabilityEngine, plans: DayPlan[]): RuleResult[] {
  const results: RuleResult[] = [];
  const tournamentDays = new Set(engine.getTournamentDays());
  const courts = engine.listCourtMeta();
  const venueIds = new Set(courts.map((c) => c.ref.venueId));

  for (const plan of plans) {
    // Validate day is within tournament dates
    if (!tournamentDays.has(plan.day)) {
      results.push({
        ruleId: 'PRECHECK_INVALID_DAY',
        phase: 'PRECHECK',
        severity: 'ERROR',
        message: `Day '${plan.day}' is not within the tournament date range`,
        context: { day: plan.day },
      });
    }

    for (const item of plan.items) {
      // Validate venueId exists
      if (!venueIds.has(item.venueId)) {
        results.push({
          ruleId: 'PRECHECK_INVALID_VENUE',
          phase: 'PRECHECK',
          severity: 'ERROR',
          message: `Venue '${item.venueId}' does not exist in the tournament record`,
          context: { day: plan.day, venueId: item.venueId, planItemId: item.planItemId },
        });
      }

      // Validate notBeforeTime format if present
      if (item.notBeforeTime && !/^\d{2}:\d{2}$/.test(item.notBeforeTime)) {
        results.push({
          ruleId: 'PRECHECK_INVALID_TIME_FORMAT',
          phase: 'PRECHECK',
          severity: 'ERROR',
          message: `notBeforeTime '${item.notBeforeTime}' is not valid HH:MM format`,
          context: { day: plan.day, planItemId: item.planItemId },
        });
      }

      // Validate roundNumber is positive
      if (item.roundNumber < 1) {
        results.push({
          ruleId: 'PRECHECK_INVALID_ROUND',
          phase: 'PRECHECK',
          severity: 'ERROR',
          message: `roundNumber must be >= 1, got ${item.roundNumber}`,
          context: { day: plan.day, planItemId: item.planItemId },
        });
      }
    }
  }

  return results;
}

/**
 * INTEGRITY: Check for duplicate plan items.
 */
function validateIntegrity(_engine: AvailabilityEngine, plans: DayPlan[]): RuleResult[] {
  const results: RuleResult[] = [];
  const seenIds = new Set<string>();

  for (const plan of plans) {
    for (const item of plan.items) {
      if (seenIds.has(item.planItemId)) {
        results.push({
          ruleId: 'INTEGRITY_DUPLICATE_PLAN_ITEM',
          phase: 'INTEGRITY',
          severity: 'ERROR',
          message: `Duplicate plan item '${item.planItemId}'`,
          context: { day: plan.day, planItemId: item.planItemId },
        });
      }
      seenIds.add(item.planItemId);
    }
  }

  return results;
}

/**
 * ORDERING: Check that rounds within the same event are scheduled in order.
 * Later rounds should not be scheduled on earlier days than earlier rounds.
 */
function validateOrdering(_engine: AvailabilityEngine, plans: DayPlan[]): RuleResult[] {
  const results: RuleResult[] = [];

  // Group items by eventId+drawId
  const eventRounds = new Map<string, Array<{ day: string; roundNumber: number; planItemId: string }>>();

  for (const plan of plans) {
    for (const item of plan.items) {
      const key = `${item.eventId}|${item.drawId || ''}`;
      const list = eventRounds.get(key) ?? [];
      list.push({ day: plan.day, roundNumber: item.roundNumber, planItemId: item.planItemId });
      eventRounds.set(key, list);
    }
  }

  // Check ordering within each event
  for (const [eventKey, rounds] of eventRounds.entries()) {
    if (rounds.length < 2) continue;

    // Sort by roundNumber
    const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // Later round should not be on an earlier day
      if (curr.day < prev.day) {
        results.push({
          ruleId: 'ORDERING_ROUND_DAY_SEQUENCE',
          phase: 'ORDERING',
          severity: 'WARN',
          message: `Round ${curr.roundNumber} is scheduled on ${curr.day} which is before round ${prev.roundNumber} on ${prev.day} (event: ${eventKey.split('|')[0]})`,
          context: { day: curr.day, planItemId: curr.planItemId },
          fixAction: {
            type: 'MOVE_PLAN_ITEM',
            description: `Move round ${curr.roundNumber} to ${prev.day} or later`,
            payload: { planItemId: curr.planItemId, suggestedDay: prev.day },
          },
        });
      }
    }
  }

  return results;
}

/**
 * CAPACITY: Check if total estimated demand exceeds available court-hours.
 */
function validateCapacity(engine: AvailabilityEngine, plans: DayPlan[]): RuleResult[] {
  const results: RuleResult[] = [];

  for (const plan of plans) {
    // Calculate total demand for this day (sum of estimated durations)
    let totalDemandMinutes = 0;
    const itemsWithDuration = plan.items.filter((i) => i.estimatedDurationMinutes);
    for (const item of itemsWithDuration) {
      totalDemandMinutes += item.estimatedDurationMinutes!;
    }

    if (totalDemandMinutes === 0) continue;

    // Calculate available court-hours for this day
    const timeRange = engine.getVisibleTimeRange(plan.day);
    const startMin = hhmmToMin(timeRange.startTime);
    const endMin = hhmmToMin(timeRange.endTime);
    const dayLengthMinutes = endMin - startMin;

    const courts = engine.listCourtMeta();
    // Filter courts by venue if all items target same venue
    const venueIds = new Set(plan.items.map((i) => i.venueId));
    const relevantCourts = venueIds.size === 1 ? courts.filter((c) => c.ref.venueId === [...venueIds][0]) : courts;
    const totalAvailableMinutes = relevantCourts.length * dayLengthMinutes;

    if (totalDemandMinutes > totalAvailableMinutes) {
      results.push({
        ruleId: 'CAPACITY_DEMAND_EXCEEDS_SUPPLY',
        phase: 'CAPACITY',
        severity: 'WARN',
        message: `Estimated demand (${Math.round(totalDemandMinutes / 60)}h) exceeds available court-hours (${Math.round(totalAvailableMinutes / 60)}h) on ${plan.day}`,
        context: { day: plan.day },
      });
    } else if (totalDemandMinutes > totalAvailableMinutes * 0.9) {
      results.push({
        ruleId: 'CAPACITY_NEAR_LIMIT',
        phase: 'CAPACITY',
        severity: 'INFO',
        message: `Demand is at ${Math.round((totalDemandMinutes / totalAvailableMinutes) * 100)}% of capacity on ${plan.day}`,
        context: { day: plan.day },
      });
    }
  }

  return results;
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ============================================================================
// Pipeline Runner
// ============================================================================

const PHASE_ORDER: ValidationPhase[] = ['PRECHECK', 'INTEGRITY', 'ORDERING', 'CAPACITY'];

const PHASE_VALIDATORS: Record<ValidationPhase, (engine: AvailabilityEngine, plans: DayPlan[]) => RuleResult[]> = {
  PRECHECK: validatePrecheck,
  INTEGRITY: validateIntegrity,
  ORDERING: validateOrdering,
  CAPACITY: validateCapacity,
};

/**
 * Run the validation pipeline against engine state and plans.
 *
 * @param params.engine - The AvailabilityEngine instance
 * @param params.day - Optional: validate only a specific day's plan
 * @param params.phases - Optional: run only specific phases (default: all)
 * @returns Results array and issue index keyed by planItemId
 */
export function runValidationPipeline(params: ValidationPipelineParams): ValidationPipelineResult {
  const { engine, day, phases } = params;

  // Gather plans
  let plans: DayPlan[];
  if (day) {
    const dayPlan = engine.getDayPlan(day);
    plans = dayPlan ? [dayPlan] : [];
  } else {
    plans = engine?.getAllPlans();
  }

  // Determine which phases to run
  const activePhases = phases ? PHASE_ORDER.filter((p) => phases.includes(p)) : PHASE_ORDER;

  // Run validators in phase order
  const results: RuleResult[] = [];
  for (const phase of activePhases) {
    const validator = PHASE_VALIDATORS[phase];
    const phaseResults = validator(engine, plans);
    results.push(...phaseResults);

    // Stop on ERROR in PRECHECK (data is invalid, later phases are meaningless)
    if (phase === 'PRECHECK' && phaseResults.some((r) => r.severity === 'ERROR')) {
      break;
    }
  }

  // Build issue index keyed by planItemId
  const issueIndex: IssueIndex = new Map();
  for (const result of results) {
    const key = result.context?.planItemId || '__global__';
    const existing = issueIndex.get(key) ?? [];
    existing.push(result);
    issueIndex.set(key, existing);
  }

  return { results, issueIndex };
}
