/**
 * Temporal Engine - Core State Machine
 *
 * Pure JavaScript state machine for managing court availability as continuous
 * time-based capacity streams. UI-agnostic and fully testable.
 *
 * Architecture:
 * - Blocks are the only canonical state (stored in Map indices)
 * - All higher structures (rails, capacity) are derived on-demand
 * - Mutations return results with warnings/conflicts
 * - Event subscribers notified of changes
 *
 * Note: View state (selectedDay, selectedVenue, layerVisibility) is NOT part
 * of this engine. Those are UI concerns managed by the controller layer.
 */

import {
  BLOCK_TYPES,
  type ApplyBlockOptions,
  type ApplyTemplateOptions,
  type Block,
  type BlockId,
  type BlockMutation,
  type BlockType,
  type CapacityCurve,
  type CourtDayAvailability,
  type CourtMeta,
  type CourtRef,
  type CourtRail,
  type CourtSchedulingSummary,
  type DayId,
  type EngineConfig,
  type EngineContext,
  type EngineEvent,
  type TournamentId,
  type VenueDayTimeline,
  type VenueId,
  type MoveBlockOptions,
  type MutationResult,
  type ResizeBlockOptions,
  type Rule,
  type RuleId,
  type SimulationResult,
  type Template,
  type TemplateId,
} from '@Assemblies/governors/temporalGovernor/types';

import { extractDate } from '@Tools/dateTime';

import {
  courtDayKey,
  courtKey,
  venueKey,
  deriveRailSegments,
  extractDay,
  resolveVenueId,
  resolveCourtId,
} from '@Assemblies/governors/temporalGovernor/railDerivation';

import { generateCapacityCurve } from '@Assemblies/governors/temporalGovernor/capacityCurve';

import { type PlanItem, type DayPlan, computePlanItemId } from '@Assemblies/governors/temporalGovernor/planState';

// ============================================================================
// Temporal Engine Class
// ============================================================================

export class TemporalEngine {
  private config!: EngineConfig;
  private tournamentRecord: any = null;

  // Core state: blocks indexed by ID and by court+day
  private blocksById: Map<BlockId, Block> = new Map();
  private blocksByCourtDay: Map<string, BlockId[]> = new Map();

  // Per-court-per-day availability
  // Key: courtKey(courtRef)|day, or courtKey(courtRef)|DEFAULT, or GLOBAL|DEFAULT
  private courtDayAvailability: Map<string, CourtDayAvailability> = new Map();

  // Per-venue-per-day availability
  // Key: venueKey|day, or venueKey|DEFAULT
  private venueDayAvailability: Map<string, CourtDayAvailability> = new Map();

  // Templates and rules
  private templates: Map<TemplateId, Template> = new Map();
  private rules: Map<RuleId, Rule> = new Map();

  // Scheduling plan state (user-created scheduling profile plans)
  private plans: Map<DayId, DayPlan> = new Map();

  // Event subscribers
  private readonly subscribers: Array<(event: EngineEvent) => void> = [];

  // Resolved granularity (authoritative)
  private resolvedGranularity = 15;

  // Block ID counter
  private nextBlockId = 1;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize engine with tournament record and configuration
   */
  init(tournamentRecord: any, config?: Partial<EngineConfig>): void {
    this.tournamentRecord = tournamentRecord;

    // Merge with default config
    this.config = {
      tournamentId: config?.tournamentId || tournamentRecord?.tournamentId || 'tournament-1',
      dayStartTime: config?.dayStartTime || '06:00',
      dayEndTime: config?.dayEndTime || '23:00',
      slotMinutes: config?.slotMinutes || 15,
      granularityMinutes: config?.granularityMinutes,
      typePrecedence: config?.typePrecedence || [
        BLOCK_TYPES.HARD_BLOCK,
        BLOCK_TYPES.LOCKED,
        BLOCK_TYPES.SCHEDULED,
        BLOCK_TYPES.MAINTENANCE,
        BLOCK_TYPES.CLOSED,
        BLOCK_TYPES.BLOCKED,
        BLOCK_TYPES.PRACTICE,
        BLOCK_TYPES.RESERVED,
        BLOCK_TYPES.SOFT_BLOCK,
        BLOCK_TYPES.AVAILABLE,
        BLOCK_TYPES.UNSPECIFIED,
      ],
      conflictEvaluators: config?.conflictEvaluators || [],
    };

    // Resolve canonical granularity: explicit granularityMinutes -> slotMinutes fallback -> 15
    this.resolvedGranularity = this.config.granularityMinutes ?? this.config.slotMinutes ?? 15;

    // Clear plans on fresh init (plans are user-created and should not survive re-init)
    this.plans.clear();

    // Initialize from tournament record if it has existing blocks
    this.loadBlocksFromTournamentRecord();

    this.emit({
      type: 'STATE_CHANGED',
      payload: { reason: 'INIT' },
    });
  }

  /**
   * Update tournament record (e.g., after external mutations)
   */
  updateTournamentRecord(tournamentRecord: any): void {
    this.tournamentRecord = tournamentRecord;
    this.loadBlocksFromTournamentRecord();

    this.emit({
      type: 'STATE_CHANGED',
      payload: { reason: 'TOURNAMENT_RECORD_UPDATED' },
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): EngineConfig {
    return { ...this.config };
  }

  /**
   * Get the resolved canonical granularity in minutes.
   * Resolution order: explicit granularityMinutes -> slotMinutes -> 15
   */
  getResolvedGranularityMinutes(): number {
    return this.resolvedGranularity;
  }

  // ============================================================================
  // Court Availability
  // ============================================================================

  /**
   * Get availability for a court on a specific day.
   * Resolves court-level and venue-level independently, then intersects.
   *
   * Court resolution: courtKey|day -> courtKey|DEFAULT (or null)
   * Venue resolution: venueKey|day -> venueKey|DEFAULT (or null)
   *
   * If both exist -> intersection: max(startTime), min(endTime).
   *   Guard: if intersection is empty (start >= end), use venue availability.
   * If only court -> use court.
   * If only venue -> use venue.
   * If neither -> GLOBAL|DEFAULT -> engine config fallback.
   */
  getCourtAvailability(court: CourtRef, day: DayId): CourtDayAvailability {
    // Resolve court-level
    const ck = courtKey(court);
    const courtAvail =
      this.courtDayAvailability.get(`${ck}|${day}`) ?? this.courtDayAvailability.get(`${ck}|DEFAULT`) ?? null;

    // Resolve venue-level
    const vk = venueKey(court.tournamentId, court.venueId);
    const venueAvail =
      this.venueDayAvailability.get(`${vk}|${day}`) ?? this.venueDayAvailability.get(`${vk}|DEFAULT`) ?? null;

    if (courtAvail && venueAvail) {
      // Intersection: later start, earlier end
      const start = courtAvail.startTime > venueAvail.startTime ? courtAvail.startTime : venueAvail.startTime;
      const end = courtAvail.endTime < venueAvail.endTime ? courtAvail.endTime : venueAvail.endTime;
      // Guard: if intersection is empty, fall back to venue availability
      if (start >= end) return venueAvail;
      return { startTime: start, endTime: end };
    }

    if (courtAvail) return courtAvail;
    if (venueAvail) return venueAvail;

    // Global default
    const globalAvail = this.courtDayAvailability.get('GLOBAL|DEFAULT');
    if (globalAvail) return globalAvail;

    // Engine config fallback
    return {
      startTime: this.config.dayStartTime,
      endTime: this.config.dayEndTime,
    };
  }

  /**
   * Set availability for a specific court on a specific day
   */
  setCourtAvailability(court: CourtRef, day: DayId, avail: CourtDayAvailability): void {
    const ck = courtKey(court);
    this.courtDayAvailability.set(`${ck}|${day}`, avail);
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { court, day, avail },
    });
  }

  /**
   * Set default availability for a court across all days
   */
  setCourtAvailabilityAllDays(court: CourtRef, avail: CourtDayAvailability): void {
    const ck = courtKey(court);
    this.courtDayAvailability.set(`${ck}|DEFAULT`, avail);
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { court, scope: 'all-days', avail },
    });
  }

  /**
   * Set global default availability for all courts
   */
  setAllCourtsDefaultAvailability(avail: CourtDayAvailability): void {
    this.courtDayAvailability.set('GLOBAL|DEFAULT', avail);
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { scope: 'global', avail },
    });
  }

  /**
   * Clear all court-level availability entries (both DEFAULT and day-specific)
   * for every court in the given venue. After clearing, courts inherit from
   * venue defaults via the resolution chain.
   */
  clearCourtAvailabilityForVenue(tournamentId: TournamentId, venueId: VenueId): void {
    const prefix = `${tournamentId}|${venueId}|`;
    for (const key of [...this.courtDayAvailability.keys()]) {
      if (key.startsWith(prefix)) {
        this.courtDayAvailability.delete(key);
      }
    }
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { tournamentId, venueId, scope: 'clear-venue-courts' },
    });
  }

  /**
   * Returns the day/DEFAULT suffixes for all courtDayAvailability entries
   * for a given court. E.g. ['DEFAULT'] or ['2026-06-15', '2026-06-16'] or [].
   * Caller checks .length > 0 to detect whether the court has overrides.
   */
  getCourtAvailabilityKeys(court: CourtRef): string[] {
    const ck = courtKey(court);
    const prefix = `${ck}|`;
    const keys: string[] = [];
    for (const key of this.courtDayAvailability.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  // ============================================================================
  // Venue Availability
  // ============================================================================

  /**
   * Get venue-level availability. Checks day-specific first, then DEFAULT.
   * Returns null if no venue-level availability is set.
   */
  getVenueAvailability(tournamentId: TournamentId, venueId: VenueId, day?: DayId): CourtDayAvailability | null {
    const vk = venueKey(tournamentId, venueId);
    if (day) {
      const dayAvail = this.venueDayAvailability.get(`${vk}|${day}`);
      if (dayAvail) return dayAvail;
    }
    return this.venueDayAvailability.get(`${vk}|DEFAULT`) ?? null;
  }

  /**
   * Set default venue-level availability (applies to all days unless overridden).
   */
  setVenueDefaultAvailability(tournamentId: TournamentId, venueId: VenueId, avail: CourtDayAvailability): void {
    const vk = venueKey(tournamentId, venueId);
    this.venueDayAvailability.set(`${vk}|DEFAULT`, avail);
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { tournamentId, venueId, scope: 'venue', avail },
    });
  }

  /**
   * Set venue-level availability for a specific day.
   */
  setVenueDayAvailability(tournamentId: TournamentId, venueId: VenueId, day: DayId, avail: CourtDayAvailability): void {
    const vk = venueKey(tournamentId, venueId);
    this.venueDayAvailability.set(`${vk}|${day}`, avail);
    this.emit({
      type: 'AVAILABILITY_CHANGED',
      payload: { tournamentId, venueId, day, scope: 'venue-day', avail },
    });
  }

  /**
   * Get the visible time range across courts for a day.
   * Returns the earliest start and latest end among the given courts (or all courts).
   */
  getVisibleTimeRange(day: DayId, courtRefs?: CourtRef[]): { startTime: string; endTime: string } {
    const courts = courtRefs && courtRefs.length > 0 ? courtRefs : this.getAllCourtsFromTournamentRecord();

    let earliestStart = '23:59';
    let latestEnd = '00:00';

    for (const court of courts) {
      const avail = this.getCourtAvailability(court, day);
      if (avail.startTime < earliestStart) earliestStart = avail.startTime;
      if (avail.endTime > latestEnd) latestEnd = avail.endTime;
    }

    // Fallback if no courts
    if (courts.length === 0) {
      return { startTime: this.config.dayStartTime, endTime: this.config.dayEndTime };
    }

    return { startTime: earliestStart, endTime: latestEnd };
  }

  /**
   * Get array of tournament days from startDate to endDate.
   *
   * Handles DST / time-change boundaries correctly. Date-only strings
   * (e.g. "2026-03-08") are parsed as local midnight, and each day is
   * formatted using local date components — avoiding the UTC-vs-local
   * mismatch that can produce duplicate or missing days when clocks
   * spring forward or fall back. See DST_DATE_HANDLING.md for details.
   */
  getTournamentDays(): DayId[] {
    if (!this.tournamentRecord?.startDate) return [];
    const startDate = this.tournamentRecord.startDate;
    const endDate = this.tournamentRecord.endDate || startDate;

    const days: DayId[] = [];
    // 'T00:00:00' suffix forces local-time parsing (ISO 8601 §5.4.2.1).
    // Without it, date-only strings are parsed as UTC midnight per spec,
    // which drifts when mixed with local-time setDate()/getDate().
    const current = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      days.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Get only the active tournament days. If activeDates is set on the
   * tournament record, returns only those dates (sorted). Otherwise
   * falls back to the full startDate–endDate range.
   */
  getActiveDays(): DayId[] {
    const activeDates = this.tournamentRecord?.activeDates;
    if (Array.isArray(activeDates) && activeDates.length > 0) {
      return activeDates.map((d: Date | string) => (typeof d === 'string' ? d : extractDate(d.toISOString()))).sort();
    }
    return this.getTournamentDays();
  }

  // ============================================================================
  // Queries - Generate Timelines
  // ============================================================================

  /**
   * Get complete timeline for a day (all venues, all courts)
   */
  getDayTimeline(day: DayId): VenueDayTimeline[] {
    const courts = this.getAllCourtsFromTournamentRecord();

    // Group by venue
    const venuesMap = new Map<VenueId, CourtRef[]>();
    for (const court of courts) {
      const existing = venuesMap.get(court.venueId) || [];
      existing.push(court);
      venuesMap.set(court.venueId, existing);
    }

    // Build timeline for each venue
    const timelines: VenueDayTimeline[] = [];
    for (const [vid, courtRefs] of venuesMap.entries()) {
      const rails: CourtRail[] = [];

      for (const court of courtRefs) {
        const rail = this.getCourtRail(day, court);
        if (rail) {
          rails.push(rail);
        }
      }

      timelines.push({
        day,
        venueId: vid,
        rails,
      });
    }

    return timelines;
  }

  /**
   * Get timeline for a specific venue
   */
  getVenueTimeline(day: DayId, venueId: VenueId): VenueDayTimeline | null {
    const dayTimeline = this.getDayTimeline(day);
    return dayTimeline.find((t) => t.venueId === venueId) || null;
  }

  /**
   * Get rail for a specific court on a specific day.
   * Uses court-specific availability range instead of global config.
   */
  getCourtRail(day: DayId, court: CourtRef): CourtRail | null {
    const avail = this.getCourtAvailability(court, day);
    const dayRange = {
      start: `${day}T${avail.startTime}:00`,
      end: `${day}T${avail.endTime}:00`,
    };
    const key = courtDayKey(court, day);
    const blockIds = this.blocksByCourtDay.get(key) || [];
    const blocks = blockIds.map((id) => this.blocksById.get(id)).filter((b): b is Block => !!b);

    const segments = deriveRailSegments(blocks, dayRange, this.config);

    return {
      court,
      segments,
    };
  }

  /**
   * Get scheduling summary for a court across all tournament days.
   * Classifies every minute of the availability window as scheduled, available, or blocked.
   */
  getCourtSchedulingSummary(court: CourtRef): CourtSchedulingSummary {
    let scheduledMinutes = 0;
    let availableMinutes = 0;
    let blockedMinutes = 0;

    for (const day of this.getTournamentDays()) {
      const rail = this.getCourtRail(day, court);
      if (!rail) continue;

      for (const segment of rail.segments) {
        const startMs = new Date(segment.start).getTime();
        const endMs = new Date(segment.end).getTime();
        const duration = (endMs - startMs) / 60000;

        if (segment.status === BLOCK_TYPES.SCHEDULED || segment.status === BLOCK_TYPES.LOCKED) {
          scheduledMinutes += duration;
        } else if (segment.status === BLOCK_TYPES.AVAILABLE) {
          availableMinutes += duration;
        } else {
          blockedMinutes += duration;
        }
      }
    }

    return { scheduledMinutes, availableMinutes, blockedMinutes };
  }

  /**
   * Get capacity curve for a day
   */
  getCapacityCurve(day: DayId): CapacityCurve {
    const timelines = this.getDayTimeline(day);
    return generateCapacityCurve(day, timelines);
  }

  /**
   * Get all blocks for a specific day across all courts
   */
  getDayBlocks(day: DayId): Block[] {
    const blocks: Block[] = [];

    // Iterate through all blocks and find ones that overlap with this day
    for (const block of this.blocksById.values()) {
      const blockDay = extractDay(block.start);
      if (blockDay === day) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  /**
   * Get all blocks (across all days)
   */
  getAllBlocks(): Block[] {
    return Array.from(this.blocksById.values());
  }

  // ============================================================================
  // Queries - Templates & Rules
  // ============================================================================

  getTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  getTemplate(templateId: TemplateId): Template | null {
    return this.templates.get(templateId) || null;
  }

  getRules(): Rule[] {
    return Array.from(this.rules.values());
  }

  getRule(ruleId: RuleId): Rule | null {
    return this.rules.get(ruleId) || null;
  }

  // ============================================================================
  // Plan State
  // ============================================================================

  /**
   * Add a plan item to a day's plan. Computes planItemId automatically.
   */
  addPlanItem(item: Omit<PlanItem, 'planItemId'>): PlanItem {
    const planItemId = computePlanItemId(item);
    const fullItem: PlanItem = { ...item, planItemId };

    const plan = this.plans.get(item.day) || { day: item.day, items: [] };
    // Replace if same planItemId already exists
    plan.items = plan.items.filter((i) => i.planItemId !== planItemId);
    plan.items.push(fullItem);
    this.plans.set(item.day, plan);

    this.emit({ type: 'PLAN_CHANGED', payload: { action: 'ADD', planItem: fullItem } });
    this.emit({ type: 'STATE_CHANGED', payload: { reason: 'PLAN_CHANGED' } });

    return fullItem;
  }

  /**
   * Remove a plan item by its ID.
   */
  removePlanItem(planItemId: string): boolean {
    for (const [day, plan] of this.plans.entries()) {
      const index = plan.items.findIndex((i) => i.planItemId === planItemId);
      if (index !== -1) {
        const removed = plan.items.splice(index, 1)[0];
        if (plan.items.length === 0) {
          this.plans.delete(day);
        }
        this.emit({ type: 'PLAN_CHANGED', payload: { action: 'REMOVE', planItem: removed } });
        this.emit({ type: 'STATE_CHANGED', payload: { reason: 'PLAN_CHANGED' } });
        return true;
      }
    }
    return false;
  }

  /**
   * Update fields on an existing plan item. Cannot change planItemId key fields.
   */
  updatePlanItem(
    planItemId: string,
    updates: Partial<Pick<PlanItem, 'notBeforeTime' | 'estimatedDurationMinutes' | 'matchUpType' | 'roundSegment'>>,
  ): PlanItem | null {
    for (const plan of this.plans.values()) {
      const item = plan.items.find((i) => i.planItemId === planItemId);
      if (item) {
        Object.assign(item, updates);
        this.emit({ type: 'PLAN_CHANGED', payload: { action: 'UPDATE', planItem: item } });
        this.emit({ type: 'STATE_CHANGED', payload: { reason: 'PLAN_CHANGED' } });
        return item;
      }
    }
    return null;
  }

  /**
   * Move a plan item to a different day.
   */
  movePlanItem(planItemId: string, newDay: DayId): PlanItem | null {
    // Find and remove from current day
    let found: PlanItem | null = null;
    for (const [day, plan] of this.plans.entries()) {
      const index = plan.items.findIndex((i) => i.planItemId === planItemId);
      if (index !== -1) {
        found = plan.items.splice(index, 1)[0];
        if (plan.items.length === 0) {
          this.plans.delete(day);
        }
        break;
      }
    }

    if (!found) return null;

    // Recompute ID with new day
    const updated = { ...found, day: newDay };
    updated.planItemId = computePlanItemId(updated);

    const targetPlan = this.plans.get(newDay) || { day: newDay, items: [] };
    targetPlan.items = targetPlan.items.filter((i) => i.planItemId !== updated.planItemId);
    targetPlan.items.push(updated);
    this.plans.set(newDay, targetPlan);

    this.emit({ type: 'PLAN_CHANGED', payload: { action: 'MOVE', planItem: updated, fromDay: found.day } });
    this.emit({ type: 'STATE_CHANGED', payload: { reason: 'PLAN_CHANGED' } });

    return updated;
  }

  /**
   * Get the plan for a specific day.
   */
  getDayPlan(day: DayId): DayPlan | null {
    return this.plans.get(day) || null;
  }

  /**
   * Get all plans across all days.
   */
  getAllPlans(): DayPlan[] {
    return Array.from(this.plans.values());
  }

  // ============================================================================
  // Commands - Block Mutations
  // ============================================================================

  /**
   * Apply a block (or multiple blocks) to courts.
   * Clamps to court availability window.
   */
  applyBlock(opts: ApplyBlockOptions): MutationResult {
    const mutations: BlockMutation[] = [];

    for (const court of opts.courts) {
      const day = extractDay(opts.timeRange.start);
      const clamped = this.clampToAvailability(court, day, opts.timeRange.start, opts.timeRange.end);
      if (!clamped) continue; // No valid range after clamping

      const blockId = this.generateBlockId();
      const block: Block = {
        id: blockId,
        court,
        start: clamped.start,
        end: clamped.end,
        type: opts.type,
        reason: opts.reason,
        hardSoft: opts.hardSoft,
        source: opts.source || 'USER',
      };

      mutations.push({
        kind: 'ADD_BLOCK',
        block,
      });
    }

    return this.applyMutations(mutations);
  }

  /**
   * Move a block to a new time or court.
   * Clamps to target court's availability window.
   */
  moveBlock(opts: MoveBlockOptions): MutationResult {
    const block = this.blocksById.get(opts.blockId);
    if (!block) {
      return {
        applied: [],
        rejected: [],
        warnings: [
          {
            code: 'BLOCK_NOT_FOUND',
            message: `Block ${opts.blockId} not found`,
          },
        ],
        conflicts: [],
      };
    }

    const targetCourt = opts.newCourt || block.court;
    const day = extractDay(opts.newTimeRange.start);
    const clamped = this.clampToAvailability(targetCourt, day, opts.newTimeRange.start, opts.newTimeRange.end);
    if (!clamped) {
      return {
        applied: [],
        rejected: [],
        warnings: [{ code: 'OUTSIDE_AVAILABILITY', message: 'Block falls outside court availability' }],
        conflicts: [],
      };
    }

    const updated: Block = {
      ...block,
      start: clamped.start,
      end: clamped.end,
      court: targetCourt,
    };

    return this.applyMutations([
      {
        kind: 'UPDATE_BLOCK',
        block: updated,
        previousBlock: block,
      },
    ]);
  }

  /**
   * Resize a block's time range.
   * Clamps to court availability window.
   */
  resizeBlock(opts: ResizeBlockOptions): MutationResult {
    const block = this.blocksById.get(opts.blockId);
    if (!block) {
      return {
        applied: [],
        rejected: [],
        warnings: [
          {
            code: 'BLOCK_NOT_FOUND',
            message: `Block ${opts.blockId} not found`,
          },
        ],
        conflicts: [],
      };
    }

    const day = extractDay(opts.newTimeRange.start);
    const clamped = this.clampToAvailability(block.court, day, opts.newTimeRange.start, opts.newTimeRange.end);
    if (!clamped) {
      return {
        applied: [],
        rejected: [],
        warnings: [{ code: 'OUTSIDE_AVAILABILITY', message: 'Block falls outside court availability' }],
        conflicts: [],
      };
    }

    const updated: Block = {
      ...block,
      start: clamped.start,
      end: clamped.end,
    };

    return this.applyMutations([
      {
        kind: 'UPDATE_BLOCK',
        block: updated,
        previousBlock: block,
      },
    ]);
  }

  /**
   * Remove a block
   */
  removeBlock(blockId: BlockId): MutationResult {
    const block = this.blocksById.get(blockId);
    if (!block) {
      return {
        applied: [],
        rejected: [],
        warnings: [
          {
            code: 'BLOCK_NOT_FOUND',
            message: `Block ${blockId} not found`,
          },
        ],
        conflicts: [],
      };
    }

    return this.applyMutations([
      {
        kind: 'REMOVE_BLOCK',
        block,
      },
    ]);
  }

  /**
   * Apply a template
   */
  applyTemplate(opts: ApplyTemplateOptions): MutationResult {
    const template = this.templates.get(opts.templateId);
    if (!template) {
      return {
        applied: [],
        rejected: [],
        warnings: [
          {
            code: 'TEMPLATE_NOT_FOUND',
            message: `Template ${opts.templateId} not found`,
          },
        ],
        conflicts: [],
      };
    }

    // TODO: Expand template operations into block mutations
    /*
                                                                                                                                                                                                                                      
    A TemplateOperation specifies:                                                                                                                                                                                                  
    - target scope: TOURNAMENT / VENUE / COURT_GROUP / COURT (with optional venueIds/courtIds filters)                                                                                                                              
    - days: which days to apply to                                                                                                                                                                                                  
    - time: either absoluteTime (ISO range) or relativeTime (offset in minutes — presumably from availability start)
    - block details: blockType, reason, hardSoft

    ApplyTemplateOptions adds an optional scope override (narrow to specific venues/courts/days at call time).

    The implementation is essentially: for each TemplateOperation, resolve the target courts, resolve the days, resolve the time range, and call the existing applyBlock() for each. The plumbing (applyBlock → applyMutations →
    conflict evaluation → index updates → events) is all built.

    However — nobody calls it. There are zero callers in factory, courthive-components, or TMX. There's no UI to create/register templates, no tests, and no code that populates the templates Map. So it would be building an
    engine feature with no consumer.

    */
    return {
      applied: [],
      rejected: [],
      warnings: [],
      conflicts: [],
    };
  }

  // ============================================================================
  // Shadow Scheduling
  // ============================================================================

  /**
   * Import scheduled matchUps as SCHEDULED blocks.
   * Clears existing SCHEDULED blocks with source='SYSTEM', then creates new
   * blocks from the provided matchUp schedule data.
   *
   * @param matchUps - Array of scheduled matchUp descriptors
   * @returns MutationResult with any conflicts detected
   */
  importScheduledMatchUps(
    matchUps: Array<{
      matchUpId: string;
      courtId: string;
      venueId: string;
      date: string; // 'YYYY-MM-DD'
      startTime: string; // 'HH:MM' or 'HH:MM:SS'
      durationMinutes: number;
    }>,
  ): MutationResult {
    // 1. Collect REMOVE mutations for existing SCHEDULED + SYSTEM blocks
    const removeMutations: BlockMutation[] = [];
    for (const block of this.blocksById.values()) {
      if (block.type === BLOCK_TYPES.SCHEDULED && block.source === 'SYSTEM') {
        removeMutations.push({ kind: 'REMOVE_BLOCK', block });
      }
    }

    // Apply removals directly (bypass conflict check for cleanup)
    for (const mutation of removeMutations) {
      this.applyMutation(mutation);
    }

    // 2. Build ADD mutations for new scheduled matchUps
    const addMutations: BlockMutation[] = [];
    for (const mu of matchUps) {
      const st = mu.startTime.length === 5 ? `${mu.startTime}:00` : mu.startTime;
      const endMinutes = this.timeToMinutes(st) + mu.durationMinutes;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const et = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

      const blockId = this.generateBlockId();
      const block: Block = {
        id: blockId,
        court: {
          tournamentId: this.config.tournamentId,
          venueId: mu.venueId,
          courtId: mu.courtId,
        },
        start: `${mu.date}T${st}`,
        end: `${mu.date}T${et}`,
        type: BLOCK_TYPES.SCHEDULED,
        source: 'SYSTEM',
        matchUpId: mu.matchUpId,
        reason: 'Scheduled Match',
      };
      addMutations.push({ kind: 'ADD_BLOCK', block });
    }

    // 3. Apply adds through normal pipeline (with conflict evaluation)
    const result = this.applyMutations(addMutations);

    // Include removal count in result
    return {
      ...result,
      applied: [...removeMutations, ...result.applied],
    };
  }

  /**
   * Convert 'HH:MM:SS' or 'HH:MM' to minutes since midnight.
   */
  private timeToMinutes(time: string): number {
    const parts = time.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  // ============================================================================
  // Simulation (What-If)
  // ============================================================================

  /**
   * Simulate mutations without applying them
   *
   * @param mutations - Mutations to simulate
   * @param day - Optional day to generate preview for (defaults to first available day)
   */
  simulateBlocks(mutations: BlockMutation[], day?: DayId): SimulationResult {
    // Create a temporary engine state snapshot
    const snapshot = this.createSnapshot();

    // Apply mutations to snapshot
    const result = snapshot.applyMutations(mutations);

    // Generate preview timelines
    const targetDay = day || this.getFirstAvailableDay();
    const previewRails = targetDay ? snapshot.getDayTimeline(targetDay) : [];
    const capacityImpact = targetDay ? snapshot.getCapacityCurve(targetDay) : undefined;

    return {
      previewRails,
      capacityImpact,
      conflicts: result.conflicts,
    };
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Subscribe to engine events
   */
  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.subscribers.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(listener);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: EngineEvent): void {
    for (const listener of this.subscribers) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    }
  }

  // ============================================================================
  // Internal: Mutation Application
  // ============================================================================

  /**
   * Apply mutations with conflict evaluation
   */
  private applyMutations(mutations: BlockMutation[]): MutationResult {
    // Evaluate conflicts using registered evaluators
    const conflicts = this.evaluateConflicts(mutations);

    // Check for hard conflicts (ERROR severity)
    const hardConflicts = conflicts.filter((c) => c.severity === 'ERROR');
    if (hardConflicts.length > 0) {
      return {
        applied: [],
        rejected: mutations,
        warnings: [],
        conflicts,
      };
    }

    // Apply mutations to state
    const applied: BlockMutation[] = [];
    for (const mutation of mutations) {
      this.applyMutation(mutation);
      applied.push(mutation);
    }

    // Emit events
    this.emit({
      type: 'BLOCKS_CHANGED',
      payload: { mutations: applied },
    });

    this.emit({
      type: 'STATE_CHANGED',
      payload: { reason: 'BLOCKS_MUTATED' },
    });

    if (conflicts.length > 0) {
      this.emit({
        type: 'CONFLICTS_CHANGED',
        payload: { conflicts },
      });
    }

    return {
      applied,
      rejected: [],
      warnings: conflicts
        .filter((c) => c.severity === 'WARN')
        .map((c) => ({
          code: c.code,
          message: c.message,
        })),
      conflicts,
    };
  }

  /**
   * Apply a single mutation to internal state
   */
  private applyMutation(mutation: BlockMutation): void {
    const { kind, block, previousBlock } = mutation;

    switch (kind) {
      case 'ADD_BLOCK':
        this.blocksById.set(block.id, block);
        this.indexBlock(block);
        break;

      case 'UPDATE_BLOCK':
        if (previousBlock) {
          this.unindexBlock(previousBlock);
        }
        this.blocksById.set(block.id, block);
        this.indexBlock(block);
        break;

      case 'REMOVE_BLOCK':
        this.unindexBlock(block);
        this.blocksById.delete(block.id);
        break;
    }
  }

  /**
   * Index a block by court+day
   */
  private indexBlock(block: Block): void {
    const day = extractDay(block.start);
    const key = courtDayKey(block.court, day);
    const existing = this.blocksByCourtDay.get(key) || [];
    if (!existing.includes(block.id)) {
      existing.push(block.id);
      this.blocksByCourtDay.set(key, existing);
    }
  }

  /**
   * Remove block from index
   */
  private unindexBlock(block: Block): void {
    const day = extractDay(block.start);
    const key = courtDayKey(block.court, day);
    const existing = this.blocksByCourtDay.get(key) || [];
    const filtered = existing.filter((id) => id !== block.id);
    if (filtered.length > 0) {
      this.blocksByCourtDay.set(key, filtered);
    } else {
      this.blocksByCourtDay.delete(key);
    }
  }

  // ============================================================================
  // Internal: Conflict Evaluation
  // ============================================================================

  /**
   * Evaluate conflicts using registered evaluators
   */
  private evaluateConflicts(mutations: BlockMutation[]) {
    const ctx = this.createContext();
    const allConflicts: import('@Assemblies/governors/temporalGovernor/types').EngineConflict[] = [];

    for (const evaluator of this.config.conflictEvaluators || []) {
      try {
        const conflicts = evaluator.evaluate(ctx, mutations);
        allConflicts.push(...conflicts);
      } catch (error) {
        console.error(`Error in evaluator ${evaluator.id}:`, error);
      }
    }

    return allConflicts;
  }

  /**
   * Create a context snapshot for evaluators
   */
  private createContext(): EngineContext {
    return {
      config: this.config,
      tournamentRecord: this.tournamentRecord,
      blocksById: new Map(this.blocksById),
      blocksByCourtDay: new Map(this.blocksByCourtDay),
      templates: new Map(this.templates),
      rules: new Map(this.rules),
    };
  }

  /**
   * Create a snapshot for simulation
   */
  private createSnapshot(): TemporalEngine {
    const snapshot = new TemporalEngine();
    snapshot.config = { ...this.config };
    snapshot.tournamentRecord = this.tournamentRecord;
    snapshot.blocksById = new Map(this.blocksById);
    snapshot.blocksByCourtDay = new Map(this.blocksByCourtDay);
    snapshot.courtDayAvailability = new Map(this.courtDayAvailability);
    snapshot.venueDayAvailability = new Map(this.venueDayAvailability);
    snapshot.templates = new Map(this.templates);
    snapshot.rules = new Map(this.rules);
    snapshot.plans = new Map([...this.plans.entries()].map(([k, v]) => [k, { ...v, items: [...v.items] }]));
    snapshot.nextBlockId = this.nextBlockId;
    snapshot.resolvedGranularity = this.resolvedGranularity;
    return snapshot;
  }

  // ============================================================================
  // Internal: Tournament Record Integration
  // ============================================================================

  /**
   * Booking type -> engine BlockType mapping
   */
  private static readonly BOOKING_TYPE_MAP: Record<string, BlockType> = {
    MAINTENANCE: BLOCK_TYPES.MAINTENANCE,
    PRACTICE: BLOCK_TYPES.PRACTICE,
    RESERVED: BLOCK_TYPES.RESERVED,
    MATCH: BLOCK_TYPES.SCHEDULED,
    SCHEDULED: BLOCK_TYPES.SCHEDULED,
  };

  /**
   * Load blocks from court dateAvailability bookings in the tournament record.
   * Iterates venues[].courts[].dateAvailability[].bookings[] and calls applyBlock().
   */
  private loadBlocksFromTournamentRecord(): void {
    this.blocksById.clear();
    this.blocksByCourtDay.clear();
    this.courtDayAvailability.clear();
    this.venueDayAvailability.clear();

    if (!this.tournamentRecord?.venues) return;

    for (const venue of this.tournamentRecord.venues) {
      const vid = resolveVenueId(venue);
      const vk = venueKey(this.config.tournamentId, vid);

      // --- Venue-level availability ---
      // 1. defaultStartTime / defaultEndTime -> venueKey|DEFAULT
      if (venue.defaultStartTime && venue.defaultEndTime) {
        this.venueDayAvailability.set(`${vk}|DEFAULT`, {
          startTime: venue.defaultStartTime,
          endTime: venue.defaultEndTime,
        });
      }

      // 2. venue.dateAvailability[]
      if (venue.dateAvailability?.length) {
        for (const va of venue.dateAvailability) {
          if (va.date) {
            // Date-specific venue availability
            if (va.startTime && va.endTime) {
              this.venueDayAvailability.set(`${vk}|${va.date}`, {
                startTime: va.startTime,
                endTime: va.endTime,
              });
            }
          } else if (va.startTime && va.endTime) {
            // Dateless entry -> venue DEFAULT (overrides defaultStartTime/defaultEndTime)
            this.venueDayAvailability.set(`${vk}|DEFAULT`, {
              startTime: va.startTime,
              endTime: va.endTime,
            });
          }

          // Venue-level bookings -> create blocks for ALL courts in the venue
          if (va.bookings?.length && venue.courts?.length) {
            const bookingDay = va.date || this.tournamentRecord.startDate;
            for (const booking of va.bookings) {
              if (!booking.startTime || !booking.endTime) continue;
              const st = booking.startTime.length === 5 ? `${booking.startTime}:00` : booking.startTime;
              const et = booking.endTime.length === 5 ? `${booking.endTime}:00` : booking.endTime;
              const blockType: BlockType =
                TemporalEngine.BOOKING_TYPE_MAP[(booking.bookingType || '').toUpperCase()] || BLOCK_TYPES.RESERVED;

              for (const court of venue.courts) {
                const courtRef: CourtRef = {
                  tournamentId: this.config.tournamentId,
                  venueId: vid,
                  courtId: resolveCourtId(court),
                };
                const blockId = this.generateBlockId();
                const block: Block = {
                  id: blockId,
                  court: courtRef,
                  start: `${bookingDay}T${st}`,
                  end: `${bookingDay}T${et}`,
                  type: blockType,
                  reason: booking.bookingType || 'Booking',
                  source: 'SYSTEM',
                };
                this.blocksById.set(blockId, block);
                this.indexBlock(block);
              }
            }
          }
        }
      }

      // --- Court-level availability and bookings ---
      for (const court of venue.courts || []) {
        if (!court.dateAvailability?.length) continue;

        const courtRef: CourtRef = {
          tournamentId: this.config.tournamentId,
          venueId: vid,
          courtId: resolveCourtId(court),
        };

        for (const avail of court.dateAvailability) {
          const day = avail.date || this.tournamentRecord.startDate;

          // Read startTime/endTime from dateAvailability for court availability
          if (avail.startTime && avail.endTime) {
            const ck = courtKey(courtRef);
            this.courtDayAvailability.set(`${ck}|${day}`, {
              startTime: avail.startTime,
              endTime: avail.endTime,
            });
          }

          if (!avail.bookings?.length) continue;

          for (const booking of avail.bookings) {
            if (!booking.startTime || !booking.endTime) continue;
            const st = booking.startTime.length === 5 ? `${booking.startTime}:00` : booking.startTime;
            const et = booking.endTime.length === 5 ? `${booking.endTime}:00` : booking.endTime;

            const blockType: BlockType =
              TemporalEngine.BOOKING_TYPE_MAP[(booking.bookingType || '').toUpperCase()] || BLOCK_TYPES.RESERVED;

            // Directly create and index blocks (bypass applyMutations to avoid emitting during init)
            const blockId = this.generateBlockId();
            const block: Block = {
              id: blockId,
              court: courtRef,
              start: `${day}T${st}`,
              end: `${day}T${et}`,
              type: blockType,
              reason: booking.bookingType || 'Booking',
              source: 'SYSTEM',
            };
            this.blocksById.set(blockId, block);
            this.indexBlock(block);
          }
        }
      }
    }
  }

  /**
   * Get all courts from tournament record
   */
  private getAllCourtsFromTournamentRecord(): CourtRef[] {
    if (!this.tournamentRecord?.venues) {
      return [];
    }

    const courts: CourtRef[] = [];
    for (const venue of this.tournamentRecord.venues) {
      const vid = resolveVenueId(venue);
      if (venue.courts) {
        for (const court of venue.courts) {
          courts.push({
            tournamentId: this.config.tournamentId,
            venueId: vid,
            courtId: resolveCourtId(court),
          });
        }
      }
    }

    return courts;
  }

  /**
   * Get first available day from tournament record
   */
  private getFirstAvailableDay(): DayId | null {
    if (!this.tournamentRecord?.startDate) {
      return null;
    }
    return extractDate(this.tournamentRecord.startDate);
  }

  /**
   * Generate a unique block ID
   */
  private generateBlockId(): BlockId {
    return `block-${this.nextBlockId++}`;
  }

  // ============================================================================
  // Public: Court Metadata
  // ============================================================================

  /**
   * Clamp a time range to a court's availability window.
   * Returns null if no valid range remains after clamping.
   */
  private clampToAvailability(
    court: CourtRef,
    day: DayId,
    start: string,
    end: string,
  ): { start: string; end: string } | null {
    const avail = this.getCourtAvailability(court, day);
    const availStart = `${day}T${avail.startTime}:00`;
    const availEnd = `${day}T${avail.endTime}:00`;

    const clampedStart = start < availStart ? availStart : start;
    const clampedEnd = end > availEnd ? availEnd : end;

    if (clampedStart >= clampedEnd) return null;
    return { start: clampedStart, end: clampedEnd };
  }

  /**
   * Get metadata for all courts
   */
  listCourtMeta(): CourtMeta[] {
    const courts = this.getAllCourtsFromTournamentRecord();
    return courts.map((ref) => this.getCourtMeta(ref));
  }

  /**
   * Get metadata for a specific court
   */
  private getCourtMeta(ref: CourtRef): CourtMeta {
    // Extract from tournament record
    if (this.tournamentRecord?.venues) {
      for (const venue of this.tournamentRecord.venues) {
        const venueId = resolveVenueId(venue);
        if (venueId !== ref.venueId) continue;
        for (const court of venue.courts || []) {
          const cId = resolveCourtId(court);
          if (cId !== ref.courtId) continue;

          // Get availability times
          const day = this.getFirstAvailableDay();
          const avail = day ? this.getCourtAvailability(ref, day) : undefined;

          return {
            ref,
            name: court.courtName || court.courtId,
            surface: court.surfaceCategory || court.surfaceType || 'hard',
            indoor: court.indoorOutdoor === 'INDOOR' || court.indoor || false,
            hasLights: court.hasLights || false,
            tags: [],
            openTime: avail?.startTime,
            closeTime: avail?.endTime,
          };
        }
      }
    }

    return {
      ref,
      name: ref.courtId,
      surface: 'hard',
      indoor: false,
      hasLights: false,
      tags: [],
    };
  }
}
