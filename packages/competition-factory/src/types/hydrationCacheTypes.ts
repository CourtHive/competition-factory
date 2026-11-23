import type { Participant, Tournament } from './tournamentTypes';

/**
 * A participant list indexed ONCE, for the reads that otherwise scan it for every matchUp side and every line of
 * every dual (a TEAM draw of 2,550 matchUps scanned 2,560 participants several thousand times per hydration).
 *
 * It answers exactly what the scans it replaces answer, duplicates included:
 * - `firstById`: the FIRST participant in list order holding each `participantId` (`Array.find`), the entry for
 *   `undefined` being the first participant with no id;
 * - `pairsByMembers`: every PAIR participant with exactly these `individualParticipantIds`, in list order, so the
 *   first is the pair `getPairedParticipant` returns and the rest are its `duplicatedPairParticipants`.
 *
 * It is a snapshot of the list it was built from: an added, removed or re-keyed participant is not in it. Build it
 * inside one read and drop it with the read (see hydrationCache.ts); mutations keep scanning the live list.
 */
export type ParticipantLookup = {
  firstById: Map<string | undefined, Participant>;
  pairsByMembers: Map<string, Participant[]>;
};

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
