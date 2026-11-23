import { buildParticipantLookup } from '@Query/participants/participantLookup';
import { getVenueData } from '@Query/venues/getVenueData';

// constants and types
import { Participant, Tournament } from '@Types/tournamentTypes';
import type { HydrationCache, ParticipantLookup, VenueData } from '@Types/hydrationCacheTypes';

export type { HydrationCache, VenueData } from '@Types/hydrationCacheTypes';

export function createHydrationCache(): HydrationCache {
  return { venueData: new WeakMap(), participantLookups: new WeakMap() };
}

/**
 * The lookup over this participant list, built on first use in the read and shared by every matchUp after it.
 * Hydration without a `participantMap` found each side's participant, each individual of a pair, each line's team
 * and each doubles line's pair by scanning the whole list; the lookup answers the same from a Map.
 *
 * Undefined without a cache, or for a list a lookup cannot answer for (`buildParticipantLookup`): the caller scans.
 * Nothing in a read adds or re-keys a participant, which is what makes the snapshot safe. A cache held past its
 * read, against this file's rule, is rebuilt when the list's length has changed; an in-place edit it cannot see.
 */
export function getCachedParticipantLookup(params: {
  tournamentParticipants?: Participant[];
  hydrationCache?: HydrationCache;
}): ParticipantLookup | undefined {
  const { hydrationCache, tournamentParticipants } = params;
  if (!hydrationCache || !Array.isArray(tournamentParticipants)) return undefined;

  hydrationCache.participantLookups ??= new WeakMap();
  let cached = hydrationCache.participantLookups.get(tournamentParticipants);
  if (cached?.size !== tournamentParticipants.length) {
    cached = { size: tournamentParticipants.length, lookup: buildParticipantLookup(tournamentParticipants) };
    hydrationCache.participantLookups.set(tournamentParticipants, cached);
  }
  return cached.lookup;
}

/**
 * `getVenueData(...).venueData`, built once per venue per read. getVenueData projects every court, and
 * each court is found by scanning every venue, so building it for each scheduled matchUp dominated
 * hydration (511 builds and 8,176 court lookups for one 512-draw read). The cached value is shared by
 * every matchUp that asks; callers read names from it and must not modify it.
 */
export function getCachedVenueData(params: {
  hydrationCache?: HydrationCache;
  tournamentRecord: Tournament;
  venueId: string;
}): VenueData | undefined {
  const { hydrationCache, tournamentRecord, venueId } = params;
  if (!hydrationCache) return getVenueData({ tournamentRecord, venueId })?.venueData;

  let venues = hydrationCache.venueData.get(tournamentRecord);
  if (!venues) {
    venues = new Map();
    hydrationCache.venueData.set(tournamentRecord, venues);
  }
  if (!venues.has(venueId)) venues.set(venueId, getVenueData({ tournamentRecord, venueId })?.venueData);
  return venues.get(venueId);
}
