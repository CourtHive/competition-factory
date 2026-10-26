import { buildConflictsView, checkConflicts, ConflictsResult } from '@Mutate/matchUps/schedule/pipeline/gridConflicts';
import { validMatchUps } from '@Validators/validMatchUp';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { ErrorType, MISSING_CONTEXT, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { SCHEDULE_ISSUE_IDS, SCHEDULE_STATE } from '@Constants/scheduleConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

// NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }
type ProConflictsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  useDeepDependencies?: boolean;
  matchUps: HydratedMatchUp[];
};

/**
 * The court grid's conflicts: the view they are judged from, then the check, which reads nothing else
 * (`pipeline/gridConflicts.ts`). Each grid matchUp's first issue is written onto its schedule (`scheduleState`, with
 * the matchUps it names), the state a previous check left there removed first.
 */
export function proConflicts({
  useDeepDependencies = false,
  tournamentRecords,
  matchUps,
}: ProConflictsArgs): { error: ErrorType; info?: string } | ConflictsResult {
  if (!validMatchUps(matchUps)) return { error: MISSING_MATCHUPS };
  if (matchUps.some(({ matchUpId, hasContext }) => matchUpId && !hasContext)) {
    return {
      info: 'matchUps must have { inContext: true, nextMatchUps: true }',
      error: MISSING_CONTEXT,
    };
  }

  // the grid's matchUps: those on a row (a court order from 1 to the greatest)
  const maxCourtOrder = Math.max(
    ...matchUps.map(({ schedule }) => schedule?.courtOrder || 1).map((order) => ensureInt(order)),
  );
  const onTheGrid = matchUps.filter((m) => {
    const order = ensureInt(m.schedule?.courtOrder);
    return order >= 1 && order <= maxCourtOrder;
  });
  for (const { schedule } of onTheGrid) if (schedule) delete schedule[SCHEDULE_STATE];

  const result = checkConflicts(buildConflictsView({ tournamentRecords, useDeepDependencies, matchUps }));

  const byId = new Map(onTheGrid.map((matchUp) => [matchUp.matchUpId, matchUp]));
  for (const { matchUpId, issue, issueIds } of result.rowIssues.flat()) {
    const schedule = byId.get(matchUpId)?.schedule;
    if (!schedule) continue;
    schedule[SCHEDULE_STATE] = issue;
    schedule[SCHEDULE_ISSUE_IDS] = issueIds;
  }
  return result;
}
