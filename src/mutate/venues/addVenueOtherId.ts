import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice } from '@Global/state/globalState';
import { findVenue } from '@Query/venues/findVenue';

// constants and types
import { ErrorType, MISSING_VALUE, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Upsert a `UnifiedVenueID` entry into a venue's `venueOtherIds[]` array — the
 * CODES mechanism for recording that the same physical venue is known by a
 * different id at another organisation (a federation, a canonical facility
 * registry, an upstream league site).
 *
 * Mirrors {@link addPersonOtherId}. `organisationId` is the upsert key: if the
 * venue already has an entry with the given `organisationId`, that entry's
 * `venueId` (and optional `uniqueOrganisationName`) is replaced. Otherwise a
 * new entry is appended with a `createdAt` timestamp.
 *
 * Note the two distinct ids: `venueId` locates the venue WITHIN this
 * tournamentRecord, while `otherVenueId` is the value stored into the
 * `UnifiedVenueID.venueId` field — the id in the OTHER organisation's
 * namespace (e.g. an ALTA facility number, an ITA institution slug, a
 * courthive-facilities `facilityId`).
 *
 * Idempotent: re-applying the same `(organisationId, otherVenueId)` is a no-op.
 *
 * Factory is deliberately neutral on what `organisationId` represents — the
 * caller chooses (federation id, canonical-registry id from a downstream
 * service, anything). The factory neither validates nor interprets it.
 */
export function addVenueOtherId(params: {
  tournamentRecords?: { [key: string]: any };
  tournamentRecord?: any;
  uniqueOrganisationName?: string;
  organisationId: string;
  otherVenueId: string;
  venueId: string;
  /**
   * ISO string recording when the id was actually assigned, rather than when
   * this instance wrote it. Defaults to now.
   */
  occurredAt?: string;
}) {
  const { uniqueOrganisationName, organisationId, otherVenueId, venueId, occurredAt } = params;

  const tournamentRecords = resolveTournamentRecords(params);
  const paramsCheck = requireParams({ venueId }, ['venueId']);
  if (paramsCheck.error) return paramsCheck;

  if (!organisationId) return { error: MISSING_VALUE, info: 'Missing organisationId' };
  if (!otherVenueId) return { error: MISSING_VALUE, info: 'Missing otherVenueId' };

  let success;
  let error;

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = venueOtherIdAdd({
      uniqueOrganisationName,
      organisationId,
      otherVenueId,
      tournamentRecord,
      occurredAt,
      venueId,
    });
    if (result.success) success = true;
    if (result.error) error = result.error;
    // suppress VENUE_NOT_FOUND across records — a venue lives in one — but surface anything else
    if (result.error && result.error !== VENUE_NOT_FOUND) return result;
  }

  return success ? { ...SUCCESS } : { error: error ?? VENUE_NOT_FOUND };
}

function venueOtherIdAdd({
  uniqueOrganisationName,
  organisationId,
  otherVenueId,
  tournamentRecord,
  occurredAt,
  venueId,
}: {
  uniqueOrganisationName?: string;
  organisationId: string;
  otherVenueId: string;
  tournamentRecord: any;
  occurredAt?: string;
  venueId: string;
}): { success?: boolean; error?: ErrorType } {
  const { venue } = findVenue({ tournamentRecord, venueId });
  if (!venue) return { error: VENUE_NOT_FOUND };

  venue.venueOtherIds ??= [];
  const existing = venue.venueOtherIds.find((entry: any) => entry?.organisationId === organisationId);

  if (existing) {
    if (existing.venueId === otherVenueId && existing.uniqueOrganisationName === uniqueOrganisationName) {
      // Idempotent no-op: same (organisationId, otherVenueId, name) already stamped.
      return { ...SUCCESS };
    }
    existing.venueId = otherVenueId;
    if (uniqueOrganisationName !== undefined) existing.uniqueOrganisationName = uniqueOrganisationName;
    existing.updatedAt = occurredAt ?? new Date().toISOString();
  } else {
    venue.venueOtherIds.push({
      ...(uniqueOrganisationName !== undefined ? { uniqueOrganisationName } : {}),
      organisationId,
      venueId: otherVenueId,
      createdAt: occurredAt ?? new Date().toISOString(),
    });
  }

  addNotice({
    payload: { venue, tournamentId: tournamentRecord.tournamentId },
    topic: MODIFY_VENUE,
    key: venue.venueId,
  });

  return { ...SUCCESS };
}
