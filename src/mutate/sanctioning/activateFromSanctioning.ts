import { transitionStatus } from './transitionStatus';
import { UUID } from '@Tools/UUID';

// constants
import { MISSING_SANCTIONING_RECORD, ACTIVE } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type {
  SanctioningRecord,
  SanctioningPolicy,
  ComplianceRecord,
  ComplianceItem,
  VenueProposal,
} from '@Types/sanctioningTypes';
import type { Tournament, Event, Venue } from '@Types/tournamentTypes';

type ActivateFromSanctioningArgs = {
  sanctioningRecord: SanctioningRecord;
  sanctioningPolicy?: SanctioningPolicy;
  /**
   * Canonical venues, already resolved by the caller — typically pulled from the facility registry
   * for the facility the sanctioning record was attached to. Supplied rather than fetched because
   * the factory has no runtime dependencies and no service awareness; resolution is the caller's
   * job, materialization is ours.
   *
   * These carry `facilityId` and typed `courts`, so the activated tournament inherits one
   * cross-tournament identity for the place it is played at instead of a re-entered venue.
   */
  venues?: Venue[];
};

/**
 * A proposal's own venue description, used only when no canonical venue was supplied.
 *
 * This is strictly a fallback: a VenueProposal is what an applicant typed at proposal time, so it
 * has no canonical identity and no real courts. It is still better than dropping the venue
 * entirely, which is what happened before — `venues: []` was hardcoded while
 * `proposal.venues` was declared and read nowhere.
 *
 * `numberOfCourts` is deliberately NOT expanded into placeholder courts: inventing "Court 1..n"
 * would fabricate identities that later have to be reconciled against the registry's real ones.
 */
function venueFromProposal(vp: VenueProposal): Venue {
  const venueId = vp.venueId ?? UUID();
  const address =
    vp.address || vp.city || vp.state || vp.countryCode || vp.coordinates
      ? [
          {
            ...(vp.address ? { addressLine1: vp.address } : {}),
            ...(vp.city ? { city: vp.city } : {}),
            ...(vp.state ? { state: vp.state } : {}),
            ...(vp.countryCode ? { countryCode: vp.countryCode } : {}),
            // TODS Address stores coordinates as strings while VenueProposal.coordinates are
            // numbers — coerce rather than widen Address, which many other call sites depend on.
            ...(vp.coordinates
              ? { latitude: String(vp.coordinates.latitude), longitude: String(vp.coordinates.longitude) }
              : {}),
          },
        ]
      : undefined;

  return {
    venueId,
    // A venue is its own facility until something dedupes it onto a canonical one.
    facilityId: venueId,
    venueName: vp.venueName,
    ...(address ? { addresses: address } : {}),
    ...(vp.extensions ? { extensions: vp.extensions } : {}),
    courts: [],
  };
}

/** Caller-resolved canonical venues win; the proposal's description is the fallback. */
function resolveVenues(venues: Venue[] | undefined, proposalVenues: VenueProposal[] | undefined): Venue[] {
  if (venues?.length) return venues;
  return (proposalVenues ?? []).map(venueFromProposal);
}

export function activateFromSanctioning({ sanctioningRecord, sanctioningPolicy, venues }: ActivateFromSanctioningArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (sanctioningRecord.status !== 'APPROVED') {
    return {
      error: INVALID_VALUES,
      context: { message: `Cannot activate from status: ${sanctioningRecord.status}; must be APPROVED` },
    };
  }

  const { proposal } = sanctioningRecord;

  // --- Generate tournamentRecord ---
  const tournamentRecord: Tournament = {
    // Reuse the id assigned at open-registration (so pre-activation registrations keyed by it
    // remain valid); mint a fresh one only when no id was pre-assigned. See
    // planning/PUBLIC_REGISTRATION_AND_ONBOARDING.md.
    tournamentId: proposal.tournamentId ?? UUID(),
    tournamentName: proposal.tournamentName,
    formalName: proposal.formalName,
    promotionalName: proposal.promotionalName,
    startDate: proposal.proposedStartDate,
    endDate: proposal.proposedEndDate,
    hostCountryCode: proposal.hostCountryCode,
    indoorOutdoor: proposal.indoorOutdoor,
    surfaceCategory: proposal.surfaceCategory,
    localTimeZone: proposal.localTimeZone,
    tournamentLevel: proposal.tournamentLevel,
    // The sanctioned tier reaches the tournament NATIVELY. It used to arrive only as a CODES
    // name/value extension, so `getEventRankingPoints` resolved no level for a tournament born from
    // sanctioning even when the applicant had explicitly chosen a tier. `tournamentTier` is the
    // canonical home and the record already carries the same TierClassification shape.
    ...(sanctioningRecord.sanctioningTier ? { tournamentTier: { ...sanctioningRecord.sanctioningTier } } : {}),
    totalPrizeMoney: proposal.totalPrizeMoney,
    registrationProfile: proposal.registrationProfile,
    tournamentStatus: 'ACTIVE',
    processCodes: ['SANCTIONED'],

    // Governance
    parentOrganisationId: sanctioningRecord.governingBodyId,
    parentOrganisation: sanctioningRecord.governingBody,

    // Categories from events
    tournamentCategories: proposal.events
      .filter((e) => e.category)
      .map((e) => e.category!)
      .filter((c, i, arr) => arr.findIndex((x) => x.categoryName === c.categoryName) === i),

    // Events
    events: proposal.events.map((ep) => {
      const event: Event = {
        // Reuse the stable eventId assigned at open-registration (so registrations keyed to it
        // resolve by id); mint only when no id was pre-assigned. Mirrors the tournamentId reuse.
        eventId: ep.eventId ?? UUID(),
        eventName: ep.eventName,
        eventType: ep.eventType,
        gender: ep.gender,
        category: ep.category,
        matchUpFormat: ep.matchUpFormat,
        indoorOutdoor: ep.indoorOutdoor,
        surfaceCategory: ep.surfaceCategory,
        wheelchairClass: ep.wheelchairClass,
        tieFormat: ep.tieFormat,
        drawDefinitions: [],
        entries: [],
      };

      // Carry sanctioning constraints
      if (ep.allowedDrawTypes?.length) event.allowedDrawTypes = [...ep.allowedDrawTypes];
      else if (ep.drawType) event.allowedDrawTypes = [ep.drawType];

      return event;
    }),

    // Store sanctioning reference.
    //
    // The `sanctioningTier` extension is now REDUNDANT with native `tournamentTier` above, and is
    // written for one release only so that anything already reading it does not break. It keeps its
    // original string shape (the tier's value) for exactly that reason. Scheduled for removal in
    // phase 4 of planning/SANCTIONING_TIER_VOCABULARY.md, one release after this one.
    extensions: [
      {
        name: 'sanctioningId',
        value: sanctioningRecord.sanctioningId,
      },
      ...(sanctioningRecord.sanctioningTier
        ? [{ name: 'sanctioningTier', value: sanctioningRecord.sanctioningTier.value }]
        : []),
    ],

    venues: resolveVenues(venues, proposal.venues),
    participants: [],
    timeItems: [],
  };

  // --- Transition to ACTIVE ---
  const transitionResult = transitionStatus({
    sanctioningRecord,
    toStatus: ACTIVE,
    reason: `Tournament ${tournamentRecord.tournamentId} created`,
  });
  if (transitionResult.error) return transitionResult;

  // --- Generate compliance checklist ---
  const policy = sanctioningPolicy ?? sanctioningRecord.policySnapshot;
  if (policy?.postEventRequirements?.length) {
    const endDate = new Date(proposal.proposedEndDate);
    const items: ComplianceItem[] = policy.postEventRequirements
      // `tiers` on a requirement are tier NAMES, so they match the tier's `value`.
      .filter((req) => !req.tiers?.length || req.tiers.includes(sanctioningRecord.sanctioningTier?.value ?? ''))
      .map((req) => {
        const deadline = new Date(endDate);
        deadline.setDate(deadline.getDate() + req.deadlineDays);
        return {
          itemId: UUID(),
          itemType: req.itemType,
          description: req.description,
          required: req.required,
          status: 'PENDING' as const,
          deadline: deadline.toISOString().split('T')[0],
        };
      });

    const compliance: ComplianceRecord = {
      status: 'PENDING',
      items,
    };
    sanctioningRecord.compliance = compliance;
  }

  return { ...SUCCESS, tournamentRecord };
}
