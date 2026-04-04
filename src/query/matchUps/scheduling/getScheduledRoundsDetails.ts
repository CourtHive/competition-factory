import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { isConvertableInteger, isPowerOf2 } from '@Tools/math';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { getMatchUpId } from '@Functions/global/extractors';
import { filterMatchUps } from '@Query/filterMatchUps';
import { findEvent } from '@Acquire/findEvent';

// constant and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ANY_OF, ARRAY, OF_TYPE } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetScheduledRoundsDetailsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  scheduleCompletedMatchUps?: boolean;
  containedStructureIds?: string[]; // optional to support calling method outside of scheduleProfileRounds
  matchUps?: HydratedMatchUp[]; // optional to support calling method outside of scheduleProfileRounds
  tournamentRecord?: Tournament;
  periodLength?: number;
  rounds: any[];
};
type RoundsDetailsResult = {
  greatestAverageMinutes?: number;
  scheduledRoundsDetails?: any[];
  orderedMatchUpIds?: string[];
  matchUpFormatCohorts?: any; // currently unused
  recoveryMinutesMap?: any;
  averageMinutesMap?: any;
  error?: ErrorType;
  success?: boolean;
  minutesMap?: any;
  info?: string;
};
export function getScheduledRoundsDetails(params: GetScheduledRoundsDetailsArgs): RoundsDetailsResult {
  const paramsCheck = checkRequiredParameters(params, [
    { [ANY_OF]: { tournamentRecords: false, tournamentRecord: false } },
    { rounds: true, [OF_TYPE]: ARRAY },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { scheduleCompletedMatchUps, periodLength = 30 } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (params.tournamentRecord && {
      [params.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ||
    {};
  if (typeof tournamentRecords !== 'object') return { error: MISSING_TOURNAMENT_RECORDS };

  const matchUpFormatCohorts = {};
  const hashes: string[] = [];
  const orderedMatchUpIds: string[] = [];
  const rounds = params.rounds.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // ---------------------------------------------------------
  // populate required variables if not provided by parameters
  const containedStructureIds =
    params.containedStructureIds ??
    Object.assign(
      {},
      ...Object.values(tournamentRecords).map(
        (tournamentRecord) => getContainedStructures({ tournamentRecord }).containedStructures,
      ),
    );

  const matchUps = params.matchUps ?? allCompetitionMatchUps({ nextMatchUps: true, tournamentRecords }).matchUps;
  // ---------------------------------------------------------

  let greatestAverageMinutes = 0;
  const recoveryMinutesMap = {};
  const averageMinutesMap = {};
  const minutesMap = {};

  const scheduledRoundsDetails = rounds.flatMap((round) => {
    const roundPeriodLength = round.periodLength || periodLength;
    const structureIds: string[] = [];
    if (containedStructureIds?.[round.structureId]) {
      structureIds.push(...containedStructureIds[round.structureId]);
    } else {
      structureIds.push(round.structureId);
    }
    let roundMatchUps = matchUps
      ? filterMatchUps({
          tournamentIds: [round.tournamentId],
          roundNumbers: [round.roundNumber],
          matchUpIds: round.matchUpIds,
          eventIds: [round.eventId],
          drawIds: [round.drawId],
          processContext: true,
          structureIds,
          matchUps,
        }).sort(matchUpSort)
      : [];

    // filter by roundSegment
    const { segmentNumber, segmentsCount } = round.roundSegment ?? {};

    if (
      isConvertableInteger(segmentNumber) &&
      isPowerOf2(roundMatchUps?.length) &&
      isPowerOf2(segmentsCount) &&
      segmentNumber > 0 &&
      segmentNumber <= segmentsCount &&
      segmentsCount < roundMatchUps?.length &&
      !round.matchUpIds?.length
    ) {
      const segmentSize = roundMatchUps.length / segmentsCount;
      const firstSegmentIndex = segmentSize * (segmentNumber - 1);
      roundMatchUps = roundMatchUps.slice(firstSegmentIndex, firstSegmentIndex + segmentSize);
    }

    const tournamentRecord = tournamentRecords[round.tournamentId];
    const event = findEvent({
      drawId: round.drawId,
      tournamentRecord,
    }).event;

    const matchUpFormatOrder: string[] = [];
    for (const matchUp of roundMatchUps) {
      const matchUpFormat = matchUp.matchUpFormat;
      if (matchUpFormat) {
        if (!matchUpFormatCohorts[matchUpFormat]) {
          matchUpFormatCohorts[matchUpFormat] = [];
          matchUpFormatCohorts[matchUpFormat].push(matchUp);
        }
        matchUpFormatOrder.push(matchUpFormat);
      }
    }

    for (const matchUpFormat of matchUpFormatOrder) {
      const { eventType, category } = event ?? {};
      const { categoryName, ageCategoryCode } = category ?? {};
      const { typeChangeRecoveryMinutes, recoveryMinutes, averageMinutes, error } = findMatchUpFormatTiming({
        categoryName: categoryName ?? ageCategoryCode,
        categoryType: category?.categoryType,
        tournamentId: round.tournamentId,
        eventId: round.eventId,
        tournamentRecords,
        matchUpFormat,
        eventType,
      });
      if (error) return { error, round };

      const matchUpIds = roundMatchUps
        .filter(
          (rm: any) =>
            // don't attempt to scheduled completed matchUpstatuses unless explicit override
            (scheduleCompletedMatchUps || !completedMatchUpStatuses.includes(rm.matchUpStatus)) &&
            rm.matchUpStatus !== BYE,
        )
        .map(getMatchUpId);

      matchUpIds.forEach((matchUpId) => {
        minutesMap[matchUpId] = {
          typeChangeRecoveryMinutes,
          recoveryMinutes,
          averageMinutes,
        };
        recoveryMinutesMap[matchUpId] = recoveryMinutes;
        averageMinutesMap[matchUpId] = averageMinutes;
      });
      orderedMatchUpIds.push(...matchUpIds);

      greatestAverageMinutes = Math.max(averageMinutes || 0, greatestAverageMinutes);
      const hash = `${averageMinutes}|${roundPeriodLength}`;
      if (!hashes.includes(hash)) hashes.push(hash);

      return {
        roundPeriodLength,
        recoveryMinutes,
        averageMinutes,
        matchUpIds,
        hash,
      };
    }
    return undefined;
  });

  return {
    scheduledRoundsDetails,
    greatestAverageMinutes,
    matchUpFormatCohorts,
    recoveryMinutesMap,
    averageMinutesMap,
    orderedMatchUpIds,
    minutesMap,
    ...SUCCESS,
  };
}
