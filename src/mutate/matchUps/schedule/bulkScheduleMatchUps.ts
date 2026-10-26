import { bulkScheduleTournamentMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleTournamentMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getLeanMatchUpDependencies } from '@Query/matchUps/getLeanMatchUpDependencies';
import { getMatchUpLocationIndex } from '@Acquire/locateMatchUp';
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

  const notFoundMatchUpIds: string[] = [];
  const skippedMatchUpIds: string[] = [];
  const lockedMatchUpIds: string[] = [];
  const warnings: any[] = [];
  let scheduled = 0;

  // B4: the documented detail is { matchUpId, schedule }. A detail without a tournamentId was filtered out of
  // every tournament and dropped in silence (success, scheduled: 0); its tournament is now found from its
  // matchUpId, and a detail no tournament holds is reported in notFoundMatchUpIds.
  const detailTournamentIds = resolveDetailTournamentIds({ tournamentRecords, matchUpDetails });
  matchUpDetails?.forEach((detail, index) => {
    if (detail?.matchUpId && !detailTournamentIds[index]) notFoundMatchUpIds.push(detail.matchUpId);
  });

  // one graph for the whole call, read from the stored draws (no hydration): both passes over every tournament reuse it
  const { matchUpDependencies, matchUps: inContextMatchUps } = getLeanMatchUpDependencies({ tournamentRecords });

  const tournamentBatches = Object.values(tournamentRecords)
    .map((tournamentRecord: Tournament) => {
      const { tournamentId } = tournamentRecord;
      const matchUpIds = matchUpContextIds
        ?.filter((contextIds) => contextIds.tournamentId === tournamentId)
        .map(getMatchUpId);
      const tournamentMatchUpDetails = matchUpDetails?.filter(
        (_, index) => detailTournamentIds[index] === tournamentId,
      );
      return { tournamentRecord, matchUpIds, tournamentMatchUpDetails };
    })
    .filter(({ matchUpIds, tournamentMatchUpDetails }) => matchUpIds?.length || tournamentMatchUpDetails?.length);

  const batchArgs = ({ tournamentRecord, matchUpIds, tournamentMatchUpDetails }) => ({
    matchUpDetails: tournamentMatchUpDetails,
    scheduleCompletedMatchUps,
    overrideScheduleLock,
    scheduleByeMatchUps,
    matchUpDependencies,
    errorOnAnachronism,
    inContextMatchUps,
    removePriorValues,
    tournamentRecords,
    tournamentRecord,
    checkChronology,
    matchUpIds,
    schedule,
  });

  // the played order is refused for the whole call, every tournament, before any tournament is written
  for (const batch of tournamentBatches) {
    const result = bulkScheduleTournamentMatchUps({ ...batchArgs(batch), playedOrderOnly: true });
    if (result.error) return result;
  }

  for (const batch of tournamentBatches) {
    const result = bulkScheduleTournamentMatchUps({ ...batchArgs(batch), playedOrderChecked: true });
    if (result.warnings?.length) warnings.push(...result.warnings);
    if (result.lockedMatchUpIds?.length) lockedMatchUpIds.push(...result.lockedMatchUpIds);
    if (result.skippedMatchUpIds?.length) skippedMatchUpIds.push(...result.skippedMatchUpIds);
    if (result.notFoundMatchUpIds?.length) notFoundMatchUpIds.push(...result.notFoundMatchUpIds);
    if (result.scheduled) scheduled += result.scheduled;
    if (result.error) return result;
  }

  return {
    ...SUCCESS,
    ...(warnings.length ? { warnings } : {}),
    ...(lockedMatchUpIds.length ? { lockedMatchUpIds } : {}),
    ...(skippedMatchUpIds.length ? { skippedMatchUpIds } : {}),
    ...(notFoundMatchUpIds.length ? { notFoundMatchUpIds } : {}),
    scheduled,
  };
}

// The tournament each detail belongs to: the one it names, else the one holding its matchUpId.
function resolveDetailTournamentIds({ tournamentRecords, matchUpDetails }): (string | undefined)[] {
  if (!Array.isArray(matchUpDetails)) return [];
  const records: Tournament[] = Object.values(tournamentRecords);
  let indexes: { tournamentId: string; locations: Map<string, unknown> }[] | undefined;
  const holderOf = (matchUpId) => {
    indexes ??= records.map((tournamentRecord) => ({
      locations: getMatchUpLocationIndex({ tournamentRecord }).locations,
      tournamentId: tournamentRecord.tournamentId,
    }));
    return indexes.find(({ locations }) => locations.has(matchUpId))?.tournamentId;
  };

  return matchUpDetails.map((detail) => {
    if (detail?.tournamentId) return tournamentRecords[detail.tournamentId] ? detail.tournamentId : undefined;
    return detail?.matchUpId ? holderOf(detail.matchUpId) : undefined;
  });
}
