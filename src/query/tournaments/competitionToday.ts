import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { zonedParts } from '@Tools/zonedDateTime';
import { competitionNow } from '@Tools/clock';

// constants and types
import { CONFLICTING_TIME_ZONES, INVALID_TIME_ZONE } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';

type CompetitionTodayResult =
  | { date: string; error?: undefined }
  | { date?: undefined; error: typeof INVALID_TIME_ZONE | typeof CONFLICTING_TIME_ZONES };

/**
 * Today's calendar date AT THE COMPETITION, `YYYY-MM-DD`: competition time (`competitionNow`), read in
 * the tournament's zone as the factory resolves it (`getTournamentTimeZone`). With no tournament, or
 * one that names no zone, the UTC date, which every host agrees on. A refused zone (venues that
 * disagree, or a zone that is not a zone) is returned as the refusal, never swapped for another day.
 *
 * Replaces two "today"s that disagreed with each other and with the tournament: the host's local date
 * (`toLocaleDateString('sv')`, so a TMX laptop and the server could differ on a player's age near
 * midnight) and the UTC date of a record stamp.
 */
export function competitionToday({ tournamentRecord }: { tournamentRecord?: Tournament } = {}): CompetitionTodayResult {
  const { timeZone, error } = tournamentRecord ? getTournamentTimeZone({ tournamentRecord }) : { timeZone: undefined };
  if (error) return { error };
  const parts = zonedParts({ ms: competitionNow().getTime(), timeZone });
  // the resolver only returns zones it validated, so a missing part can only be an unusable instant
  return parts ? { date: parts.date } : { error: INVALID_TIME_ZONE };
}

/** The competition's UTC date, for reads with no tournament in scope (officiating runs in its own engine). */
export function competitionUtcDate(): string {
  return competitionNow().toISOString().slice(0, 10);
}
