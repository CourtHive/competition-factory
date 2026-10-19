import type { ProjectionAudit, ProjectionAuditCounts } from './projectionAudit';
import type { Observation, PropertyFailure } from './transitions';
import type { RelationalCoverage } from './properties';
import type { Step } from './sweep';

export type ReplayCounts = {
  plannedScheduleSteps: number;
  scheduleAttempted: number;
  attempted: number;
  accepted: number;
  refused: number;
  thrown: number;
  /** Every completed observation is checked for refusal/throw atomicity. */
  checked: number;
  skipped: number;
  skippedWithReason: Record<string, number>;
  unvisited: number;
  buildFailed: number;
};

export const emptyReplayCounts = (plannedScheduleSteps = 0): ReplayCounts => ({
  plannedScheduleSteps,
  scheduleAttempted: 0,
  attempted: 0,
  accepted: 0,
  refused: 0,
  thrown: 0,
  checked: 0,
  skipped: 0,
  skippedWithReason: {},
  unvisited: 0,
  buildFailed: 0,
});

export type ReplayStep = { index: number; step: Step; observation?: Observation; skipped?: string };
export type ReplayOptions = {
  preparationFailure?: PropertyFailure;
  projectionAudit?: ProjectionAudit;
  relational?: boolean;
  stopOnFailure?: boolean;
  allowChangePropagation?: boolean;
  onStep?: (step: ReplayStep) => void;
};

/** A frozen scenario with no operation history cannot be replayed as an empty successful draw. */
export function scenarioPreparationFailure(scenario: {
  steps?: unknown;
  generationThrow?: string;
}): PropertyFailure | undefined {
  if (scenario.generationThrow !== undefined)
    return { property: 'GENERATION_THROW', matchUpId: '-', detail: scenario.generationThrow };
  if (!Array.isArray(scenario.steps))
    return { property: 'SCHEDULE_MISSING', matchUpId: '-', detail: 'scenario has no frozen step array' };
  return undefined;
}

export type ReplayResult = {
  verdict: 'build-failed' | 'clean' | 'failed';
  /** A clean functional verdict with skips is incomplete and must not pass a verification runner. */
  complete: boolean;
  counts: ReplayCounts;
  findings: PropertyFailure[];
  coverage: RelationalCoverage;
  projectionAudit: ProjectionAuditCounts;
};

export function addReplayCounts(total: ReplayCounts, counts: ReplayCounts): void {
  const { skippedWithReason, ...numbers } = counts;
  for (const [key, value] of Object.entries(numbers)) total[key as keyof typeof numbers] += value;
  for (const [reason, count] of Object.entries(skippedWithReason))
    total.skippedWithReason[reason] = (total.skippedWithReason[reason] ?? 0) + count;
}
