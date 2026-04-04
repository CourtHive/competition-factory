import { scheduledSortedMatchUps } from '@Functions/sorters/scheduledSortedMatchUps';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { requireParams } from '@Helpers/parameters/requireParams';

// constants and types
import { MISSING_COURT_ID, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { MatchUpFilters, ScheduleVisibilityFilters, ResultType } from '@Types/factoryTypes';
import { TOURNAMENT_RECORD, VENUE_ID } from '@Constants/attributeConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetScheduledCourtMatchUpsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  venueMatchUps?: HydratedMatchUp[];
  matchUpFilters?: MatchUpFilters;
  tournamentRecord: Tournament;
  courtId: string;
};

export function getScheduledCourtMatchUps(
  params: GetScheduledCourtMatchUpsArgs,
): ResultType & { matchUps?: HydratedMatchUp[] } {
  if (!params?.tournamentRecord && !Array.isArray(params?.venueMatchUps)) return { error: MISSING_TOURNAMENT_RECORD };
  if (!params?.courtId) return { error: MISSING_COURT_ID };

  const { scheduleVisibilityFilters, tournamentRecord, matchUpFilters, venueMatchUps, courtId } = params;

  const { schedulingProfile } = getSchedulingProfile({ tournamentRecord });

  if (Array.isArray(venueMatchUps)) return { matchUps: getCourtMatchUps({ matchUps: venueMatchUps, courtId }) };

  const { matchUps: tournamentMatchUps } = allTournamentMatchUps({
    scheduleVisibilityFilters,
    tournamentRecord,
    matchUpFilters,
  });
  const matchUps = getCourtMatchUps({ matchUps: tournamentMatchUps, courtId });

  return { matchUps };

  function getCourtMatchUps({ matchUps, courtId }) {
    const courtMatchUps = matchUps.filter((matchUp) => {
      // allocatedCourtIds only applies to TEAM matchUps
      const allocatedCourtIds = matchUp.schedule?.allocatedCourts?.map(({ courtId }) => courtId);
      return matchUp.schedule?.courtId === courtId || allocatedCourtIds?.includes(courtId);
    });
    return scheduledSortedMatchUps({
      matchUps: courtMatchUps,
      schedulingProfile,
    });
  }
}

type GetScheduledVenueMatchUpsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  matchUpFilters?: MatchUpFilters;
  tournamentRecord: Tournament;
  venueId: string;
};
export function getScheduledVenueMatchUps({
  scheduleVisibilityFilters,
  tournamentRecord,
  matchUpFilters,
  venueId,
}: GetScheduledVenueMatchUpsArgs) {
  const paramsCheck = requireParams({ tournamentRecord, venueId }, [TOURNAMENT_RECORD, VENUE_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { schedulingProfile } = getSchedulingProfile({ tournamentRecord });

  const { matchUps: tournamentMatchUps } = allTournamentMatchUps({
    scheduleVisibilityFilters,
    tournamentRecord,
    matchUpFilters,
  });
  const matchUps = getVenueMatchUps({ matchUps: tournamentMatchUps, venueId });

  return { matchUps };

  function getVenueMatchUps({ matchUps, venueId }) {
    const venueMatchUps = matchUps.filter((matchUp) => {
      // allocatedCourtIds only applies to TEAM matchUps
      const allocatedVenueIds = matchUp.schedule?.allocatedCourts?.map(({ venueId }) => venueId);
      return matchUp.schedule?.venueId === venueId || allocatedVenueIds?.includes(venueId);
    });
    return scheduledSortedMatchUps({
      matchUps: venueMatchUps,
      schedulingProfile,
    });
  }
}
