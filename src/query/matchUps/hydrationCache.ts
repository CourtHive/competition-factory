import { getVenueData } from '@Query/venues/getVenueData';

// constants and types
import { Tournament } from '@Types/tournamentTypes';

/**
 * Lookups shared by every matchUp hydrated in ONE read. A query creates it (or receives it from the query
 * that called it) and drops it when it returns, so nothing in it outlives the snapshot it was built from:
 * records are mutated in place, and the async engine gives each request its own state.
 *
 * Never hold one across calls, and never put it at module scope.
 *
 * Venue data is keyed by record and then by venueId, so a cache handed on to a query over a different
 * record, or a linked one, cannot answer for it. A miss (unknown venueId) is cached too.
 */
export type HydrationCache = {
  venueData: WeakMap<Tournament, Map<string, VenueData | undefined>>;
};

/** What hydration reads from getVenueData: the names it attaches to a schedule. */
export type VenueData = {
  courtsInfo?: { courtId?: string; courtName?: string }[];
  venueAbbreviation?: string;
  venueName?: string;
  venueId?: string;
};

export function createHydrationCache(): HydrationCache {
  return { venueData: new WeakMap() };
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
