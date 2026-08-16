import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';

// constants and types
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_SCHEDULE,
  SCHEDULE_LOCKED,
  MISSING_MATCHUP_IDS,
  MISSING_TOURNAMENT_RECORD,
  ErrorType,
} from '@Constants/errorConditionConstants';

type BulkScheduleMachUpsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  scheduleCompletedMatchUps?: boolean;
  overrideScheduleLock?: boolean;
  tournamentRecord?: Tournament;
  scheduleByeMatchUps?: boolean;
  errorOnAnachronism?: boolean;
  removePriorValues?: boolean;
  checkChronology?: boolean;
  matchUpDependencies?: any;
  matchUpIds?: string[];
  matchUpDetails?: any;
  schedule?: any;
};

export function bulkScheduleTournamentMatchUps({
  scheduleCompletedMatchUps = false,
  scheduleByeMatchUps = false,
  errorOnAnachronism = false,
  checkChronology = true,
  overrideScheduleLock,
  matchUpDependencies,
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  matchUpDetails,
  matchUpIds,
  schedule,
}: BulkScheduleMachUpsArgs): {
  lockedMatchUpIds?: string[];
  error?: ErrorType;
  scheduled?: number;
  warnings?: any[];
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpDetails && (!matchUpIds || !Array.isArray(matchUpIds))) return { error: MISSING_MATCHUP_IDS };

  if (!matchUpDetails && (!schedule || typeof schedule !== 'object')) return { error: MISSING_SCHEDULE };

  let inContextMatchUps;
  const lockedMatchUpIds: string[] = [];
  const warnings: any[] = [];
  let scheduled = 0;

  // Optimize getting matchUps for all tournamentRecords
  // if matchUpDependencies are provided, skip this step
  if (checkChronology && !matchUpDependencies) {
    const result = getMatchUpDependencies({
      tournamentRecords,
      tournamentRecord,
    });
    matchUpDependencies = result.matchUpDependencies;
    inContextMatchUps = result.matchUps;
  }

  // Optimize getting matchUps for all tournamentRecords
  // if inContextMatchUps retrieved in previous step, skip this step
  if (!inContextMatchUps) {
    inContextMatchUps =
      allTournamentMatchUps({
        tournamentRecord,
      })?.matchUps ?? [];
  }

  // first organize matchUpIds by drawId
  const drawIdMap = inContextMatchUps.reduce((drawIdMap, matchUp) => {
    const { matchUpId, drawId, matchUpStatus } = matchUp;
    if (
      (scheduleByeMatchUps || matchUpStatus !== BYE) &&
      (scheduleCompletedMatchUps || !completedMatchUpStatuses.includes(matchUpStatus))
    ) {
      if (drawIdMap[drawId]) {
        drawIdMap[drawId].push(matchUpId);
      } else {
        drawIdMap[drawId] = [matchUpId];
      }
    }
    return drawIdMap;
  }, {});

  const detailMatchUpIds = matchUpDetails?.map((detail) => detail.matchUpId);

  for (const drawId of Object.keys(drawIdMap)) {
    const { drawDefinition } = findDrawDefinition({
      tournamentRecord,
      drawId,
    });
    if (!drawDefinition) continue;

    const drawMatchUpIds = drawIdMap[drawId].filter(
      (matchUpId) => matchUpIds?.includes(matchUpId) ?? detailMatchUpIds?.includes(matchUpId),
    );

    // optimize matchUp retrieval
    const drawMatchUps = allDrawMatchUps({
      inContext: false,
      drawDefinition,
    }).matchUps;

    for (const matchUpId of drawMatchUpIds) {
      const matchUpSchedule = matchUpDetails?.find((details) => details.matchUpId === matchUpId)?.schedule || schedule;
      const result = addMatchUpScheduleItems({
        schedule: matchUpSchedule,
        overrideScheduleLock,
        matchUpDependencies,
        errorOnAnachronism,
        removePriorValues,
        inContextMatchUps,
        tournamentRecords,
        tournamentRecord,
        checkChronology,
        drawDefinition,
        drawMatchUps,
        matchUpId,
      });
      if (result?.warnings?.length) warnings.push(...result.warnings);
      if (result?.success) scheduled += 1;
      // A locked matchUp is SKIPPED, never fatal: one pinned marquee match must
      // not abort a Clear or a bulk re-schedule of the other 200. Reported back
      // so the caller can say what it preserved.
      if (result.error === SCHEDULE_LOCKED) {
        lockedMatchUpIds.push(matchUpId);
        continue;
      }
      if (result.error) return result;
    }
  }

  return {
    ...SUCCESS,
    ...(warnings.length ? { warnings } : {}),
    ...(lockedMatchUpIds.length ? { lockedMatchUpIds } : {}),
    scheduled,
  };
}
