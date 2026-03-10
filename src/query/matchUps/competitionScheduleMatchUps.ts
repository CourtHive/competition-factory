import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { getCompetitionPublishedDrawDetails } from './getCompetitionPublishedDrawDetails';
import { scheduledSortedMatchUps } from '@Functions/sorters/scheduledSortedMatchUps';
import { isEmbargoed, isVisiblyPublished } from '@Query/publishing/isEmbargoed';
import { courtGridRows } from '@Assemblies/generators/scheduling/courtGridRows';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getVenuesAndCourts } from '../venues/venuesAndCourtsGetter';
import { getCompetitionMatchUps } from './getCompetitionMatchUps';
import { getTournamentId } from '@Global/state/globalState';
import { isConvertableInteger } from '@Tools/math';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { MatchUpFilters, PolicyDefinitions, TournamentRecords } from '@Types/factoryTypes';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Venue } from '@Types/tournamentTypes';

type CompetitionScheduleMatchUpsArgs = {
  tournamentRecords: TournamentRecords;
  policyDefinitions?: PolicyDefinitions;
  courtCompletedMatchUps?: boolean;
  alwaysReturnCompleted?: boolean;
  contextFilters?: MatchUpFilters;
  matchUpFilters?: MatchUpFilters;
  hydrateParticipants?: boolean;
  withCourtGridRows?: boolean;
  activeTournamentId?: string;
  sortDateMatchUps?: boolean;
  minCourtGridRows?: number;
  usePublishState?: boolean;
  sortCourtsData?: boolean;
  nextMatchUps?: boolean;
  status?: string;
};

export function competitionScheduleMatchUps(params: CompetitionScheduleMatchUpsArgs): {
  mappedParticipants?: { [key: string]: HydratedParticipant };
  completedMatchUps?: HydratedMatchUp[];
  dateMatchUps?: HydratedMatchUp[];
  courtPrefix?: string;
  error?: ErrorType;
  venues?: Venue[];
  courtsData?: any;
  rows?: any[];
} {
  if (typeof params?.tournamentRecords !== 'object' || !Object.keys(params?.tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };
  const { courts, venues } = getVenuesAndCourts(params);
  const getResult: any = getSchedulingProfile(params);
  const schedulingProfile = getResult.schedulingProfile;

  const {
    sortDateMatchUps = true,
    courtCompletedMatchUps,
    alwaysReturnCompleted,
    activeTournamentId,
    tournamentRecords,
    withCourtGridRows,
    minCourtGridRows,
    usePublishState,
    status = PUBLIC,
    sortCourtsData,
  } = params;

  // PUBLISH.STATUS is attached at the tournament level by `publishOrderOfPlay`
  const tournamentId = activeTournamentId ?? getTournamentId() ?? Object.keys(tournamentRecords)[0];
  const tournamentPublishStatus = usePublishState
    ? getTournamentPublishStatus({ tournamentRecord: tournamentRecords[tournamentId], status })
    : undefined;

  const allCompletedMatchUps = alwaysReturnCompleted
    ? getCompetitionMatchUps({
        ...params,
        matchUpFilters: {
          ...params.matchUpFilters,
          matchUpStatuses: [COMPLETED],
        },
        contextFilters: params.contextFilters,
      }).completedMatchUps
    : [];

  // if { usePublishState: true } return only completed matchUps unless orderOfPLay is published
  if (usePublishState && !isVisiblyPublished(tournamentPublishStatus?.orderOfPlay)) {
    return {
      completedMatchUps: allCompletedMatchUps,
      dateMatchUps: [],
      courtsData: [],
      venues,
    };
  }

  let publishedDrawIds, detailsMap;
  if (usePublishState) {
    ({ drawIds: publishedDrawIds, detailsMap } = getCompetitionPublishedDrawDetails({ tournamentRecords }));
  }

  if (publishedDrawIds?.length) {
    params.contextFilters ??= {};
    if (params.contextFilters.drawIds) {
      params.contextFilters.drawIds = params.contextFilters.drawIds.filter((drawId) =>
        publishedDrawIds.includes(drawId),
      );
    } else {
      params.contextFilters.drawIds = publishedDrawIds;
    }
  }

  const publishedOrderOfPlay = tournamentPublishStatus?.orderOfPlay;

  if (publishedOrderOfPlay?.eventIds?.length) {
    params.matchUpFilters ??= {};
    if (params.matchUpFilters?.eventIds) {
      if (params.matchUpFilters.eventIds.length) {
        params.matchUpFilters.eventIds = params.matchUpFilters.eventIds.filter((eventId) =>
          publishedOrderOfPlay.eventIds.includes(eventId),
        );
      } else {
        params.matchUpFilters.eventIds = publishedOrderOfPlay.eventIds;
      }
    } else {
      params.matchUpFilters.eventIds = publishedOrderOfPlay.eventIds;
    }
  }

  if (publishedOrderOfPlay?.scheduledDates?.length) {
    params.matchUpFilters ??= {};

    // Normalize singular scheduledDate into scheduledDates array so it participates in the intersection
    if (params.matchUpFilters.scheduledDate && !params.matchUpFilters.scheduledDates) {
      params.matchUpFilters.scheduledDates = [params.matchUpFilters.scheduledDate];
    }

    const hadCallerDates =
      params.matchUpFilters.scheduledDates && params.matchUpFilters.scheduledDates.length > 0;

    if (params.matchUpFilters.scheduledDates) {
      if (params.matchUpFilters.scheduledDates.length) {
        params.matchUpFilters.scheduledDates = params.matchUpFilters.scheduledDates.filter((scheduledDate) =>
          publishedOrderOfPlay.scheduledDates.includes(scheduledDate),
        );
      } else {
        params.matchUpFilters.scheduledDates = publishedOrderOfPlay.scheduledDates;
      }
    } else {
      params.matchUpFilters.scheduledDates = publishedOrderOfPlay.scheduledDates;
    }

    // If the caller specified dates but none survived the intersection with published dates,
    // no matchUps can match — return early with empty results
    if (hadCallerDates && !params.matchUpFilters.scheduledDates?.length) {
      return {
        completedMatchUps: alwaysReturnCompleted ? allCompletedMatchUps : [],
        dateMatchUps: [],
        courtsData: [],
        venues,
        ...SUCCESS,
      };
    }

    // Clear singular scheduledDate so filterMatchUps uses the intersected scheduledDates array
    // (prevents fallback to a date that was excluded by the intersection)
    delete params.matchUpFilters.scheduledDate;
  }

  // optimization: if all completed matchUps have already been retrieved, skip the hydration process
  if (alwaysReturnCompleted) {
    params.matchUpFilters ??= {};
    if (params.matchUpFilters?.excludeMatchUpStatuses?.length) {
      if (!params.matchUpFilters.excludeMatchUpStatuses.includes(COMPLETED)) {
        params.matchUpFilters.excludeMatchUpStatuses.push(COMPLETED);
      }
    } else {
      params.matchUpFilters.excludeMatchUpStatuses = [COMPLETED];
    }
  }

  const { completedMatchUps, upcomingMatchUps, pendingMatchUps, abandonedMatchUps, groupInfo, mappedParticipants } =
    getCompetitionMatchUps({
      ...params,
      matchUpFilters: params.matchUpFilters,
      contextFilters: params.contextFilters,
    });

  let relevantMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];

  // add any stage or structure filtering
  // publishedDrawIds provides support for legacy timeItems
  if (detailsMap && (!publishedDrawIds?.length || Object.keys(detailsMap).length)) {
    relevantMatchUps = relevantMatchUps.filter((matchUp) => {
      const { drawId, structureId, stage } = matchUp;
      if (!isVisiblyPublished(detailsMap?.[drawId]?.publishingDetail)) return false;

      const stageKeys = Object.keys(detailsMap[drawId].stageDetails ?? {});
      if (stageKeys.length) {
        const unpublishedStages = stageKeys.filter(
          (stage) => !isVisiblyPublished(detailsMap[drawId].stageDetails[stage]),
        );
        const publishedStages = stageKeys.filter((stage) => isVisiblyPublished(detailsMap[drawId].stageDetails[stage]));
        if (unpublishedStages.length && unpublishedStages.includes(stage)) return false;
        if (publishedStages.length && publishedStages.includes(stage)) return true;
        return unpublishedStages.length && !unpublishedStages.includes(stage) && !publishedStages.length;
      }

      const structureIdKeys = Object.keys(detailsMap[drawId].structureDetails ?? {});
      if (structureIdKeys.length) {
        const unpublishedStructureIds = structureIdKeys.filter(
          (structureId) => !isVisiblyPublished(detailsMap[drawId].structureDetails[structureId]),
        );
        const publishedStructureIds = structureIdKeys.filter((structureId) =>
          isVisiblyPublished(detailsMap[drawId].structureDetails[structureId]),
        );
        if (unpublishedStructureIds.length && unpublishedStructureIds.includes(structureId)) return false;
        if (publishedStructureIds.length && publishedStructureIds.includes(structureId)) return true;
        return (
          unpublishedStructureIds.length &&
          !unpublishedStructureIds.includes(structureId) &&
          !publishedStructureIds.length
        );
      }

      return true;
    });
  }

  if (detailsMap && usePublishState) {
    relevantMatchUps = relevantMatchUps.filter((matchUp) => {
      const { drawId, structureId, roundNumber } = matchUp;
      if (!isConvertableInteger(roundNumber)) return true;

      const structureDetail = detailsMap[drawId]?.structureDetails?.[structureId];
      if (!structureDetail) return true;

      const { scheduledRounds, roundLimit } = structureDetail;

      // roundLimit is always the ceiling
      if (isConvertableInteger(roundLimit) && roundNumber! > roundLimit) return false;

      // scheduledRounds provides per-round overrides within the ceiling
      if (scheduledRounds) {
        const roundDetail = scheduledRounds[roundNumber!];
        if (!roundDetail) return true; // unlisted → pass through normally

        if (!roundDetail.published) return false; // explicitly unpublished → hide

        if (isEmbargoed(roundDetail)) {
          matchUp.schedule = undefined; // strip schedule for embargoed rounds
          return true; // keep matchUp in results
        }
      }

      return true;
    });
  }

  const dateMatchUps = sortDateMatchUps
    ? scheduledSortedMatchUps({ matchUps: relevantMatchUps, schedulingProfile })
    : relevantMatchUps;

  const courtsData = courts?.map((court) => {
    const matchUps = getCourtMatchUps(court);
    return {
      surfaceCategory: court?.surfaceCategory ?? '',
      matchUps,
      ...court,
    };
  });

  const result: any = {
    completedMatchUps: alwaysReturnCompleted ? allCompletedMatchUps : completedMatchUps, // completed matchUps for the filter date
    mappedParticipants: params.hydrateParticipants ? undefined : mappedParticipants,
    dateMatchUps, // all incomplete matchUps for the filter date
    courtsData,
    groupInfo,
    venues,
  };

  if (withCourtGridRows) {
    const scheduledDate = params.matchUpFilters?.scheduledDate;
    const { rows, courtPrefix } = courtGridRows({
      minRowsCount: Math.max(minCourtGridRows || 0, dateMatchUps.length || 0),
      scheduledDate,
      courtsData,
    });
    result.courtPrefix = courtPrefix; /* pass through for access to internal defaults by consumer */
    result.rows = rows;
  }

  return { ...result, ...SUCCESS };

  function getCourtMatchUps({ courtId }) {
    const matchUpsToConsider = courtCompletedMatchUps
      ? dateMatchUps.concat(completedMatchUps ?? [], abandonedMatchUps ?? [])
      : dateMatchUps;
    const courtMatchUps = matchUpsToConsider.filter(
      (matchUp) =>
        matchUp.schedule?.courtId === courtId ||
        matchUp.schedule?.allocatedCourts?.map(({ courtId }) => courtId).includes(courtId),
    );

    return sortCourtsData
      ? scheduledSortedMatchUps({
          matchUps: courtMatchUps,
          schedulingProfile,
        })
      : courtMatchUps;
  }
}
