import { TOURNAMENT_IMAGE_RESOURCE_NAME } from '@Constants/tournamentConstants';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';

// types
import { Tournament } from '@Types/tournamentTypes';

export type TournamentCalendarEntry = {
  searchText: string;
  tournamentId: string;
  providerId?: string;
  tournament: any;
};

/**
 * Derive the lightweight calendar-list entry for a single tournament — the shape
 * a tournaments list renders from WITHOUT loading full tournament records.
 *
 * Shared source of truth for every calendar surface: the server persists this as
 * its provider-calendar side-effect and a local client (IndexedDB provider
 * calendar) can derive the identical entry, so the list looks the same whether it
 * is served remotely or offline. Keeping one deriver here is what prevents the two
 * sides drifting (stale icons / missing images when the shapes diverge).
 *
 * `tournament` spreads the full `getTournamentInfo` projection, which already
 * carries `onlineResources` (text-only links). Consumers extract both the URL
 * image (`tournamentImageURL`, also flattened here) and the court-SVG image from
 * those resources — no per-image field baking is required.
 *
 * Pure: reads only the record. Server-specific projections (e.g. an ownership
 * `createdByUserId` stamp) are the caller's concern, not the factory's.
 */
export function getTournamentCalendarEntry({
  tournamentRecord,
}: {
  tournamentRecord: Tournament;
}): TournamentCalendarEntry {
  const { tournamentName, tournamentId, startDate, endDate, parentOrganisation } = tournamentRecord;
  const tournamentInfo = getTournamentInfo({ tournamentRecord })?.tournamentInfo ?? {};
  const providerId = parentOrganisation?.organisationId;

  const tournamentImageURL = tournamentRecord.onlineResources?.find(
    (resource: any) =>
      resource.resourceType === 'URL' &&
      resource.resourceSubType === 'IMAGE' &&
      resource.name === TOURNAMENT_IMAGE_RESOURCE_NAME,
  )?.identifier;

  // Normalize calendar-day fields to date-only ISO (guard against records that
  // arrive without dates — `new Date(undefined)` would throw on toISOString).
  const dateOnly = (value?: string) => (value ? new Date(value).toISOString().split('T')[0] : value);

  return {
    searchText: (tournamentName ?? '').toLowerCase(),
    tournamentId,
    providerId,
    tournament: {
      ...tournamentInfo,
      startDate: dateOnly(startDate),
      endDate: dateOnly(endDate),
      tournamentImageURL,
      tournamentName,
    },
  };
}
