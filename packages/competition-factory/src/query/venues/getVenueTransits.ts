import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// constants and types
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import type { Tournament, VenueTransitEntry } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type TransitPairs = { [fromVenueId: string]: { [toVenueId: string]: number } };

/**
 * The stated transit between venues across the records, by direction: a symmetric pair both ways, a one-way pair one
 * way. Linked records may state the same pair differently: the greater is kept, so no participant is given less time
 * than any record allows (scheduling-pipeline.md § 3.4).
 */
export function venueTransitPairs(tournamentRecords: { [tournamentId: string]: Tournament }): TransitPairs {
  const pairs: TransitPairs = {};
  const set = (from: string, to: string, minutes: number) => {
    pairs[from] ??= {};
    pairs[from][to] = Math.max(pairs[from][to] ?? 0, minutes);
  };
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const { venueIds, minutes, oneWay } of tournamentRecord.scheduling?.venueTransits ?? []) {
      set(venueIds[0], venueIds[1], minutes);
      if (!oneWay) set(venueIds[1], venueIds[0], minutes);
    }
  }
  return pairs;
}

/** the attached scheduling policies' default transit: the greatest any record states, or none */
export function defaultTransitMinutes(tournamentRecords: { [tournamentId: string]: Tournament }): number | undefined {
  let defaultMinutes: number | undefined;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const stated = getAppliedPolicies({ tournamentRecord }).appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.defaultTimes
      ?.transitMinutes;
    if (typeof stated === 'number' && stated > (defaultMinutes ?? -1)) defaultMinutes = stated;
  }
  return defaultMinutes;
}

type GetVenueTransitsArgs = {
  tournamentRecords?: { [tournamentId: string]: Tournament };
  tournamentRecord?: Tournament;
};
/** the stored pairs (as stated, per record), the effective minutes by direction, and the policy's default */
export function getVenueTransits(params: GetVenueTransitsArgs): ResultType & {
  venueTransits?: VenueTransitEntry[];
  transitPairs?: TransitPairs;
  defaultMinutes?: number;
} {
  const tournamentRecords =
    params.tournamentRecords ??
    (params.tournamentRecord ? { [params.tournamentRecord.tournamentId]: params.tournamentRecord } : undefined);
  if (!tournamentRecords) return { error: MISSING_TOURNAMENT_RECORDS };
  const venueTransits = Object.values(tournamentRecords).flatMap((record) => record.scheduling?.venueTransits ?? []);
  return {
    ...SUCCESS,
    venueTransits,
    transitPairs: venueTransitPairs(tournamentRecords),
    defaultMinutes: defaultTransitMinutes(tournamentRecords),
  };
}
