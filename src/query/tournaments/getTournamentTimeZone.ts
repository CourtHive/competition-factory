import { isValidIANATimeZone } from '@Tools/timeZone';

// constants and types
import { CONFLICTING_TIME_ZONES, INVALID_TIME_ZONE } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetTournamentTimeZoneArgs = {
  tournamentRecord?: Tournament;
};

type TimeZoneResult = {
  timeZone?: string;
  inferred?: boolean;
  error?: typeof INVALID_TIME_ZONE | typeof CONFLICTING_TIME_ZONES;
};

/**
 * Resolves the authoritative IANA time zone for a tournament.
 *
 * Precedence:
 *  1. `tournamentRecord.localTimeZone` when set (validated as a real IANA zone).
 *  2. Otherwise inferred from venue addresses — a venue is the physical location,
 *     so a single distinct `address.timeZone` across all venues is a reasonable
 *     inference (returned with `inferred: true`).
 *
 * Returns `CONFLICTING_TIME_ZONES` when venues disagree on a zone and no
 * tournament-level `localTimeZone` is set (the rare border-city case). Returns
 * `{}` (no timeZone, no error) when no zone can be determined.
 */
export function getTournamentTimeZone({ tournamentRecord }: GetTournamentTimeZoneArgs): TimeZoneResult {
  const localTimeZone = tournamentRecord?.localTimeZone;
  if (localTimeZone) {
    if (!isValidIANATimeZone(localTimeZone)) return { error: INVALID_TIME_ZONE };
    return { timeZone: localTimeZone };
  }

  const venueZones = (tournamentRecord?.venues ?? [])
    .flatMap((venue) => venue.addresses ?? [])
    .map((address) => address?.timeZone)
    .filter((timeZone): timeZone is string => !!timeZone && isValidIANATimeZone(timeZone));
  const distinct = [...new Set(venueZones)];

  if (distinct.length === 1) return { timeZone: distinct[0], inferred: true };
  if (distinct.length > 1) return { error: CONFLICTING_TIME_ZONES };
  return {};
}
