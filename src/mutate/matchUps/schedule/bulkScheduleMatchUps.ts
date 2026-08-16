import { bulkScheduleTournamentMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleTournamentMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getMatchUpId } from '@Functions/global/extractors';

// constants and types
import { ARRAY, INVALID, OF_TYPE, ONE_OF, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type BulkScheduleMatchUpsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  scheduleCompletedMatchUps?: boolean;
  overrideScheduleLock?: boolean;
  tournamentRecord?: Tournament;
  scheduleByeMatchUps?: boolean;
  errorOnAnachronism?: boolean;
  removePriorValues?: boolean;
  checkChronology?: boolean;
  matchUpContextIds?: any;
  matchUpIds?: string[];
  matchUpDetails: any;
  schedule?: any;
};
export function bulkScheduleMatchUps(params: BulkScheduleMatchUpsArgs) {
  const {
    scheduleCompletedMatchUps = false,
    scheduleByeMatchUps = false,
    overrideScheduleLock,
    errorOnAnachronism,
    matchUpContextIds,
    removePriorValues,
    tournamentRecords,
    checkChronology,
    matchUpDetails,
    schedule,
  } = params;

  if (params.matchUpIds && !matchUpContextIds) return bulkScheduleTournamentMatchUps(params);

  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true },
    {
      [ONE_OF]: { matchUpContextIds: false, matchUpDetails: false },
      [INVALID]: INVALID_VALUES,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  if ((!matchUpDetails || matchUpContextIds) && !schedule)
    return { error: MISSING_VALUE, info: 'schedule is required' };

  const lockedMatchUpIds: string[] = [];
  const warnings: any[] = [];
  let scheduled = 0;

  const { matchUpDependencies } = getMatchUpDependencies({
    tournamentRecords,
  });

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const { tournamentId } = tournamentRecord;
    const matchUpIds = matchUpContextIds
      ?.filter((contextIds) => contextIds.tournamentId === tournamentId)
      .map(getMatchUpId);

    const tournamentMatchUpDetails = matchUpDetails?.filter((details) => details?.tournamentId === tournamentId);

    if (matchUpIds?.length || tournamentMatchUpDetails?.length) {
      const result = bulkScheduleTournamentMatchUps({
        matchUpDetails: tournamentMatchUpDetails,
        scheduleCompletedMatchUps,
        overrideScheduleLock,
        scheduleByeMatchUps,
        matchUpDependencies,
        errorOnAnachronism,
        removePriorValues,
        tournamentRecords,
        tournamentRecord,
        checkChronology,
        matchUpIds,
        schedule,
      });
      if (result.warnings?.length) warnings.push(...result.warnings);
      if (result.lockedMatchUpIds?.length) lockedMatchUpIds.push(...result.lockedMatchUpIds);
      if (result.scheduled) scheduled += result.scheduled;
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
