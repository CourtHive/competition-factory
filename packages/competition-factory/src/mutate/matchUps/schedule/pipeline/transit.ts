/**
 * Transit between venues (scheduling-pipeline.md § 3.4, CA 2026-10-25): a participant whose consecutive matchUps are at
 * different venues needs time to get from one to the other. Recovery counts toward it, so the later matchUp may not start
 * before the earlier ends plus the GREATER of the recovery and the transit; transit holds participants, never courts.
 */
export type VenueTransit = {
  /** the policy's minutes for a pair of venues with no entry; absent (no transit) when no policy states one */
  defaultMinutes?: number;
  /** minutes from one venue to another, by venueId, each direction its own entry: a pair the record states once is
   * written both ways here, a one-way value one way only */
  pairs?: { [fromVenueId: string]: { [toVenueId: string]: number } };
  /** venues that share a facilityId are one physical place: no transit between them */
  facilityIds?: { [venueId: string]: string };
};

/** the minutes needed to get from one venue to another; 0 for the same venue, or when either venue is unknown */
export function transitMinutes(transit: VenueTransit | undefined, fromVenueId?: string, toVenueId?: string): number {
  if (!transit || !fromVenueId || !toVenueId || fromVenueId === toVenueId) return 0;
  const stated = transit.pairs?.[fromVenueId]?.[toVenueId];
  if (stated !== undefined) return stated;
  const fromFacility = transit.facilityIds?.[fromVenueId];
  if (fromFacility && fromFacility === transit.facilityIds?.[toVenueId]) return 0;
  return transit.defaultMinutes ?? 0;
}
