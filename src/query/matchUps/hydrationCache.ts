import { buildParticipantLookup, ParticipantLookup } from '@Query/participants/participantLookup';
import { getVenueData } from '@Query/venues/getVenueData';

// constants and types
import { Participant, Tournament } from '@Types/tournamentTypes';

/**
 * Lookups shared by every matchUp hydrated in ONE read. A query creates it (or receives it from the query
 * that called it) and drops it when it returns, so nothing in it outlives the snapshot it was built from:
 * records are mutated in place, and the async engine gives each request its own state.
 *
 * Never hold one across calls, and never put it at module scope.
 *
 * Venue data is keyed by record and then by venueId, so a cache handed on to a query over a different
 * record, or a linked one, cannot answer for it. A miss (unknown venueId) is cached too.
 *
 * A participant lookup is keyed by the participant LIST it indexes (the array itself), for the same reason: a
 * read that hydrates from two lists gets two lookups.
 */
export type HydrationCache = {
  venueData: WeakMap<Tournament, Map<string, VenueData | undefined>>;
  participantLookups?: WeakMap<Participant[], { size: number; lookup?: ParticipantLookup }>;
};

/** What hydration reads from getVenueData: the names it attaches to a schedule. */
export type VenueData = {
  courtsInfo?: { courtId?: string; courtName?: string }[];
  venueAbbreviation?: string;
  venueName?: string;
  venueId?: string;
};

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
