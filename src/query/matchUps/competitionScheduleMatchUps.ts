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

  applyPublishedEventIdFilter(params, publishedOrderOfPlay);

  const earlyReturn = applyPublishedScheduledDatesFilter(params, publishedOrderOfPlay, {
    allCompletedMatchUps,
    alwaysReturnCompleted,
    venues,
  });
  if (earlyReturn) return earlyReturn;

  applyCompletedExclusion(params, alwaysReturnCompleted);

  const { completedMatchUps, upcomingMatchUps, pendingMatchUps, abandonedMatchUps, groupInfo, mappedParticipants } =
    getCompetitionMatchUps({
      ...params,
      matchUpFilters: params.matchUpFilters,
      contextFilters: params.contextFilters,
    });

  let relevantMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];

  if (detailsMap && (!publishedDrawIds?.length || Object.keys(detailsMap).length)) {
    relevantMatchUps = relevantMatchUps.filter((matchUp) => filterByPublishState(matchUp, detailsMap));
  }

  if (detailsMap && usePublishState) {
    relevantMatchUps = relevantMatchUps.filter((matchUp) => filterByRoundVisibility(matchUp, detailsMap));
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

function applyPublishedEventIdFilter(params, publishedOrderOfPlay) {
  if (!publishedOrderOfPlay?.eventIds?.length) return;

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

function applyPublishedScheduledDatesFilter(params, publishedOrderOfPlay, { allCompletedMatchUps, alwaysReturnCompleted, venues }) {
  if (!publishedOrderOfPlay?.scheduledDates?.length) return undefined;

  params.matchUpFilters ??= {};

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

  if (hadCallerDates && !params.matchUpFilters.scheduledDates?.length) {
    return {
      completedMatchUps: alwaysReturnCompleted ? allCompletedMatchUps : [],
      dateMatchUps: [],
      courtsData: [],
      venues,
      ...SUCCESS,
    };
  }

  delete params.matchUpFilters.scheduledDate;
  return undefined;
}

function applyCompletedExclusion(params, alwaysReturnCompleted) {
  if (!alwaysReturnCompleted) return;

  params.matchUpFilters ??= {};
  if (params.matchUpFilters?.excludeMatchUpStatuses?.length) {
    if (!params.matchUpFilters.excludeMatchUpStatuses.includes(COMPLETED)) {
      params.matchUpFilters.excludeMatchUpStatuses.push(COMPLETED);
    }
  } else {
    params.matchUpFilters.excludeMatchUpStatuses = [COMPLETED];
  }
}

function filterByPublishState(matchUp, detailsMap) {
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
}

function filterByRoundVisibility(matchUp, detailsMap) {
  const { drawId, structureId, roundNumber } = matchUp;
  if (!isConvertableInteger(roundNumber)) return true;

  const structureDetail = detailsMap[drawId]?.structureDetails?.[structureId];
  if (!structureDetail) return true;

  const { scheduledRounds, roundLimit } = structureDetail;

  if (isConvertableInteger(roundLimit) && roundNumber! > roundLimit) return false;

  if (scheduledRounds) {
    const roundDetail = scheduledRounds[roundNumber!];
    if (!roundDetail) return true;

    if (!roundDetail.published) return false;

    if (isEmbargoed(roundDetail)) {
      matchUp.schedule = undefined;
      return true;
    }
  }

  return true;
}
