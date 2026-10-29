import { scheduledSortedMatchUps } from '@Functions/sorters/scheduledSortedMatchUps';
import { courtGridRows } from '@Assemblies/generators/scheduling/courtGridRows';
import { matchUpCompletion } from '@Query/matchUp/checkMatchUpIsComplete';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { filterMatchUps } from '@Query/filterMatchUps';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { ABANDONED } from '@Constants/matchUpStatusConstants';
import type { TournamentRecords } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

type DateGridRowsArgs = {
  tournamentRecords: TournamentRecords;
  /** the competition's matchUps, as `getSchedulingMatchUps` projects them */
  matchUps: HydratedMatchUp[];
  minCourtGridRows?: number;
  scheduledDate: string;
};

/**
 * A date's court grid from the scheduling projection: the rows `competitionScheduleMatchUps({ withCourtGridRows: true,
 * courtCompletedMatchUps: true })` returns, without hydrating the competition. Each court holds the date's matchUps on
 * it, those still to be played (in scheduled order) before those completed and those abandoned; a BYE holds no cell.
 * The grid has a row for each matchUp of the date not yet on a court, and at least `minCourtGridRows`. Pinned to
 * `competitionScheduleMatchUps` by `gridRows.test.ts`.
 */
export function dateGridRows({ minCourtGridRows, tournamentRecords, scheduledDate, matchUps }: DateGridRowsArgs): {
  rows?: Record<string, unknown>[];
  error?: ErrorType;
} {
  if (!Object.keys(tournamentRecords ?? {}).length) return { error: MISSING_TOURNAMENT_RECORDS };
  const { schedulingProfile } = getSchedulingProfile({ tournamentRecords });
  const { courts } = getVenuesAndCourts({ tournamentRecords });

  // a BYE is bucketed out of the schedule, a line of a dual never is
  const onDate = filterMatchUps({ matchUps, scheduledDate }).filter(
    (matchUp) => matchUp.collectionId || !matchUp.sides?.some((side) => side.bye),
  );
  const abandoned = onDate.filter(({ matchUpStatus }) => matchUpStatus === ABANDONED);
  const completed = onDate.filter((matchUp) => matchUp.matchUpStatus !== ABANDONED && matchUpCompletion(matchUp));
  const toPlay = scheduledSortedMatchUps({
    matchUps: onDate.filter((matchUp) => matchUp.matchUpStatus !== ABANDONED && !matchUpCompletion(matchUp)),
    schedulingProfile,
  });
  const onCourts = toPlay.concat(completed, abandoned);

  const courtsData = (courts ?? []).map((court) => ({
    surfaceCategory: court?.surfaceCategory ?? '',
    matchUps: onCourts.filter(
      ({ schedule }) =>
        schedule?.courtId === court.courtId ||
        schedule?.allocatedCourts?.some(({ courtId }) => courtId === court.courtId),
    ),
    ...court,
  }));
  const unplacedCount = toPlay.filter(
    ({ schedule }) => !schedule?.courtId && !schedule?.allocatedCourts?.length,
  ).length;
  const { rows } = courtGridRows({
    minRowsCount: Math.max(minCourtGridRows || 0, unplacedCount),
    scheduledDate,
    courtsData,
  });
  return { rows };
}
