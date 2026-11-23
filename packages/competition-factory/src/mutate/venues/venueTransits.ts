import { modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { findVenue } from '@Query/venues/findVenue';

// constants and types
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import type { Tournament, VenueTransitEntry } from '@Types/tournamentTypes';
import type { ResultType, TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/*
 * Transit between venues (scheduling-pipeline.md § 3.4; CA 2026-10-25): stored once per pair in
 * `tournamentRecord.scheduling.venueTransits`, pruned by the venue mutations as the scheduling profile is. A pair is
 * symmetric unless `oneWay`, when it runs from `venueIds[0]` to `venueIds[1]` only. A sanctioned value is a floor: a
 * director may never set less, or remove the pair.
 */

type TransitArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
};

/** the key a pair is stored under: a symmetric pair in either order is one pair; a one-way pair keeps its direction */
export function venueTransitKey({ venueIds, oneWay }: Pick<VenueTransitEntry, 'venueIds' | 'oneWay'>): string {
  const [first, second] = venueIds;
  return oneWay ? `${first}>${second}` : [first, second].sort((a, b) => a.localeCompare(b)).join('|');
}

function storedTransits(tournamentRecord: Tournament): VenueTransitEntry[] {
  return tournamentRecord.scheduling?.venueTransits ?? [];
}

function storeTransits(tournamentRecord: Tournament, venueTransits: VenueTransitEntry[]) {
  tournamentRecord.scheduling ??= {};
  if (venueTransits.length) tournamentRecord.scheduling.venueTransits = venueTransits;
  else delete tournamentRecord.scheduling.venueTransits;
  modifyTournamentDetailNotice({ tournamentRecord, detail: { venueTransits } });
}

/** a value is a pair of two different venues of the record (or a linked record), and whole non-negative minutes */
function invalidTransit(params: TransitArgs & { entry: VenueTransitEntry }): ResultType | undefined {
  const { entry, tournamentRecord, tournamentRecords } = params;
  const { venueIds, minutes } = entry ?? {};
  if (!Array.isArray(venueIds) || venueIds.length !== 2 || venueIds[0] === venueIds[1])
    return { error: INVALID_VALUES };
  if (!Number.isInteger(minutes) || minutes < 0) return { error: INVALID_VALUES };
  for (const venueId of venueIds) {
    if (typeof venueId !== 'string' || findVenue({ tournamentRecord, tournamentRecords, venueId }).error)
      return { error: VENUE_NOT_FOUND, context: { venueId } } as ResultType;
  }
  return undefined;
}

type SetVenueTransitArgs = TransitArgs & {
  venueIds: [string, string];
  minutes: number;
  oneWay?: boolean;
};
/** set the minutes of one pair, never below its sanctioned value */
export function setVenueTransit(params: SetVenueTransitArgs): ResultType {
  const { tournamentRecord, venueIds, minutes, oneWay } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const entry: VenueTransitEntry = { venueIds, minutes, ...(oneWay ? { oneWay } : {}) };
  const invalid = invalidTransit({ ...params, entry });
  if (invalid) return invalid;

  const key = venueTransitKey(entry);
  const transits = storedTransits(tournamentRecord);
  const existing = transits.find((transit) => venueTransitKey(transit) === key);
  if (existing?.sanctioned && minutes < existing.sanctioned.minutes)
    return { error: INVALID_VALUES, context: { sanctionedMinutes: existing.sanctioned.minutes } } as ResultType;

  const stored = existing ? { ...existing, minutes } : entry;
  storeTransits(tournamentRecord, [...transits.filter((transit) => venueTransitKey(transit) !== key), stored]);
  return { ...SUCCESS };
}

type RemoveVenueTransitArgs = TransitArgs & { venueIds: [string, string]; oneWay?: boolean };
/** remove one pair, which then takes the policy's default; a sanctioned pair cannot be removed */
export function removeVenueTransit(params: RemoveVenueTransitArgs): ResultType {
  const { tournamentRecord, venueIds, oneWay } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(venueIds) || venueIds.length !== 2) return { error: INVALID_VALUES };
  const key = venueTransitKey({ venueIds, oneWay });
  const transits = storedTransits(tournamentRecord);
  const existing = transits.find((transit) => venueTransitKey(transit) === key);
  if (!existing) return { ...SUCCESS };
  if (existing.sanctioned)
    return { error: INVALID_VALUES, context: { sanctionedMinutes: existing.sanctioned.minutes } } as ResultType;
  storeTransits(
    tournamentRecord,
    transits.filter((transit) => venueTransitKey(transit) !== key),
  );
  return { ...SUCCESS };
}

type SetVenueTransitsArgs = TransitArgs & { venueTransits: VenueTransitEntry[]; replace?: boolean };
/**
 * Set many pairs at once (a sanctioning import, or the venues page): each validated, a sanctioned value kept beside the
 * minutes in effect and never undercut. With `replace`, pairs not given are removed, except sanctioned ones.
 */
export function setVenueTransits(params: SetVenueTransitsArgs): ResultType {
  const { tournamentRecord, venueTransits, replace } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(venueTransits)) return { error: INVALID_VALUES };

  const byKey = new Map<string, VenueTransitEntry>();
  for (const transit of storedTransits(tournamentRecord)) {
    if (!replace || transit.sanctioned) byKey.set(venueTransitKey(transit), transit);
  }
  for (const entry of venueTransits) {
    const invalid = invalidTransit({ ...params, entry });
    if (invalid) return invalid;
    const key = venueTransitKey(entry);
    const sanctioned = entry.sanctioned ?? byKey.get(key)?.sanctioned;
    if (sanctioned && (!Number.isInteger(sanctioned.minutes) || entry.minutes < sanctioned.minutes))
      return { error: INVALID_VALUES, context: { sanctionedMinutes: sanctioned.minutes } } as ResultType;
    byKey.set(key, { ...entry, ...(sanctioned ? { sanctioned } : {}) });
  }

  storeTransits(tournamentRecord, [...byKey.values()]);
  return { ...SUCCESS };
}

/** prune the pairs naming a venue being deleted: in the records where it is deleted, never a linked peer's */
export function pruneVenueTransits({ tournamentRecord, venueId }: { tournamentRecord: Tournament; venueId: string }) {
  const transits = storedTransits(tournamentRecord);
  const kept = transits.filter((transit) => !transit.venueIds.includes(venueId));
  if (kept.length !== transits.length) storeTransits(tournamentRecord, kept);
}
