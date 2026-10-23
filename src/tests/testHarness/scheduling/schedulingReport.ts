/**
 * The deferral report a scheduling call's corpus step records as its `value` (corpus.schema.json, `SuccessResult`): per
 * date, what was scheduled and, for every reason the scheduler gives, which matchUps it left unscheduled for it. A
 * reason for NOT writing has no patch to carry it, so without this the corpus would pin what a scheduler placed and
 * nothing about why it placed no more.
 *
 * Only matchUpIds are kept, sorted, per date and reason. v1's maps also carry each attempt it made (a scheduleTime per
 * Garman slot tried, with the dependencies or participants that blocked it); those trace v1's loop, not a rule, and a
 * port that tries slots in another order would differ there and nowhere else.
 */
const REASONS = [
  'scheduledMatchUpIds',
  'notScheduledMatchUpIds',
  'noFormatMatchUpIds',
  'noTimeMatchUpIds',
  'overLimitMatchUpIds',
  'dependencyDeferredMatchUpIds',
  'recoveryTimeDeferredMatchUpIds',
  'playedOrderDeferredMatchUpIds',
  'dailyLimitWarningMatchUpIds',
] as const;

/** the methods that decide placements, and so report what they left unscheduled */
export const SCHEDULING_REPORT_METHODS = new Set([
  'scheduleProfileRounds',
  'scheduleProfileGrid',
  'scheduleMatchUps',
  'proAutoSchedule',
]);

const sortedIds = (ids: Iterable<string>) => [...new Set(ids)].sort((a, b) => a.localeCompare(b));

/** `{ date: ids[] }`, `{ date: { id: attempts } }` or a bare `ids[]` → `{ date: ids[] }` (a bare list keyed by '') */
function byDate(value: unknown): Record<string, string[]> | undefined {
  if (Array.isArray(value)) return value.length ? { '': sortedIds(value) } : undefined;
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [date, entry] of Object.entries(value)) {
    const ids = Array.isArray(entry) ? entry : Object.keys(entry ?? {});
    if (ids.length) out[date] = sortedIds(ids);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Request conflicts name the matchUps a person's request blocked. jinn reports `{ date: [{ matchUpId, … }] }`;
 * `scheduleMatchUps` reports `[{ request, matchUpIds, scheduleTimes }]` for its one date (keyed by '').
 */
function requestConflictIds(value: unknown): Record<string, string[]> | undefined {
  const entries: [string, any[]][] = Array.isArray(value)
    ? [['', value]]
    : Object.entries(value ?? {}).map(([date, conflicts]) => [date, Array.isArray(conflicts) ? conflicts : []]);
  const out: Record<string, string[]> = {};
  for (const [date, conflicts] of entries) {
    const ids = conflicts.flatMap((conflict) => conflict?.matchUpIds ?? [conflict?.matchUpId]).filter(Boolean);
    if (ids.length) out[date] = sortedIds(ids);
  }
  return Object.keys(out).length ? out : undefined;
}

export function schedulingReport(methodName: string, result: any): Record<string, any> | undefined {
  if (!SCHEDULING_REPORT_METHODS.has(methodName) || !result || result.error) return undefined;
  const report: Record<string, any> = {};
  for (const reason of REASONS) {
    const ids = byDate(result[reason]);
    if (ids) report[reason] = ids;
  }
  const conflicts = requestConflictIds(result.requestConflicts);
  if (conflicts) report.requestConflicts = conflicts;
  if (Array.isArray(result.schedulingProfileIssues) && result.schedulingProfileIssues.length)
    report.schedulingProfileIssues = result.schedulingProfileIssues;
  return report;
}
