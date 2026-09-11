import { transitionStatus } from './transitionStatus';
import { takeUUID, UUID } from '@Tools/UUID';

// constants
import { INSUFFICIENT_UUIDS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { MISSING_SANCTIONING_RECORD, ACTIVE } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type {
  SanctioningRecord,
  SanctioningPolicy,
  ComplianceRecord,
  ComplianceItem,
  VenueProposal,
  EventProposal,
} from '@Types/sanctioningTypes';
import type {
  SanctioningAuthority,
  TournamentSanction,
  UnifiedEventID,
  Tournament,
  Venue,
  Event,
} from '@Types/tournamentTypes';
import { SanctionDecisionEnum, RecognitionEnum } from '@Types/tournamentTypes';

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
  /**
   * Optional pool of ids for the generated compliance-checklist items, consumed
   * in order. Follows the existing `uuids` idiom (`generateVenues`,
   * `createTeamsFromAttributes`, `addEventEntryPairs`).
   *
   * Compliance items are derived from `policy.postEventRequirements`, which carry
   * no id of their own, so there is nothing stable to key them to. Without a pool
   * this mutation mints ids engine-side and is therefore not replayable: a site
   * server mirrors `{method, params}` upstream, and engine-minted ids differ
   * between instances. Supply the pool when identity must survive a replay.
   */
  uuids?: string[];
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

/**
 * The activated event's `eventOtherIds`: whatever the proposal carried, plus an `isOrigin`
 * entry naming the sanctioning source when the proposal named none.
 *
 * Both directions matter. A sanction originating OUTSIDE this ecosystem arrives with the
 * foreign body's own tournamentId/eventId already flagged `isOrigin`, and that entry must
 * survive activation untouched — it is the address an integration layer sends results back
 * to. A sanction originating HERE carries nothing, so we stamp our own governing body plus
 * `proposal.tournamentId`, which makes every sanctioned record queryable by origin on the
 * same terms rather than leaving the local case as a special case.
 *
 * The stamped `tournamentId` is `proposal.tournamentId` — the SANCTIONED id — which is not
 * necessarily the carrying record's. Today they are the same value, but multi-sanctioning
 * exists precisely to let one record carry events sanctioned elsewhere, so reading one for
 * the other is the mistake this field exists to prevent.
 */
/**
 * Project the approved application onto the competition as a `TournamentSanction`.
 *
 * This is the bridge between the two halves of the sanctioning domain: `SanctioningRecord` is the
 * application (AMS-held, discarded once decided), while `TournamentSanction` is the decision as an
 * attribute that travels with the record. Before this existed the projection was
 * `processCodes: ['SANCTIONED']` and everything else the application knew — who approved it, when,
 * under which rulebook edition, and whether it confers ranking status — was dropped on activation.
 *
 * `recognition` is SANCTIONED here because that is what activation means: this body ran the
 * competition under its own rules. Records INGESTED from a federation may legitimately carry
 * APPROVED / OBSERVED / UNSANCTIONED instead, which is why the field is not a constant.
 */
function buildSanction(sanctioningRecord: SanctioningRecord): TournamentSanction {
  const { governingBody, governingBodyId, sanctioningTier, policyVersion, sanctioningPolicy } = sanctioningRecord;

  const authority: SanctioningAuthority | undefined =
    governingBodyId || governingBody
      ? {
          ...(governingBodyId ? { organisationId: governingBodyId } : {}),
          ...(governingBody?.organisationName ? { organisationName: governingBody.organisationName } : {}),
          ...(governingBody?.organisationAbbreviation
            ? { organisationAbbreviation: governingBody.organisationAbbreviation }
            : {}),
        }
      : undefined;

  // The endorsement chain IS the approval chain, in the order the endorsements were required.
  // Only endorsed links are included — a pending or declined endorser did not approve anything.
  // `endorsementLevel` is the required ORDER (1 = first), so it — not array position — is what
  // orders the chain. Endorsements without a level sort last rather than being dropped.
  const approvalChain: SanctioningAuthority[] = (sanctioningRecord.endorsements ?? [])
    .filter((endorsement) => endorsement?.status === 'ENDORSED' && endorsement.endorserId)
    .slice()
    .sort((a, b) => (a.endorsementLevel ?? Number.MAX_SAFE_INTEGER) - (b.endorsementLevel ?? Number.MAX_SAFE_INTEGER))
    .map((endorsement) => ({
      organisationId: endorsement.endorserId,
      ...(endorsement.endorserName ? { organisationName: endorsement.endorserName } : {}),
    }));

  return {
    decision: SanctionDecisionEnum.APPROVED,
    recognition: RecognitionEnum.SANCTIONED,
    ...(sanctioningTier ? { classification: { ...sanctioningTier } } : {}),
    ...(authority ? { authority } : {}),
    ...(approvalChain.length ? { approvalChain } : {}),
    ...(sanctioningRecord.approvedAt || sanctioningRecord.reviewer
      ? {
          decisionRecord: {
            ...(sanctioningRecord.approvedAt ? { decidedAt: sanctioningRecord.approvedAt } : {}),
            ...(sanctioningRecord.reviewer?.reviewerName
              ? { decidedByName: sanctioningRecord.reviewer.reviewerName }
              : {}),
            ...(sanctioningRecord.reviewer?.reviewerId
              ? { decidedByPersonId: sanctioningRecord.reviewer.reviewerId }
              : {}),
          },
        }
      : {}),
    // Pin the rulebook edition the decision was made under. Governing-body policies are annual;
    // re-validating a granted sanction against a later edition is a real hazard.
    ...(sanctioningPolicy || policyVersion
      ? {
          ruleset: {
            ...(sanctioningPolicy ? { rulesetId: sanctioningPolicy } : {}),
            ...(policyVersion ? { edition: policyVersion } : {}),
          },
        }
      : {}),
    sanctioningId: sanctioningRecord.sanctioningId,
  };
}

function resolveEventOtherIds(
  ep: EventProposal,
  eventId: string,
  sanctioningRecord: SanctioningRecord,
): UnifiedEventID[] {
  const supplied = ep.eventOtherIds ?? [];
  if (supplied.some((otherId) => otherId?.isOrigin)) return [...supplied];

  // governingBodyId is required on the type, but a record arriving over the wire can still
  // lack it; without an organisation there is nothing to attribute the origin to, and a
  // half-formed origin entry is worse than none.
  const organisationId = sanctioningRecord.governingBodyId;
  if (!organisationId) return [...supplied];

  return [
    ...supplied,
    {
      organisationId,
      uniqueOrganisationName: sanctioningRecord.governingBody?.organisationName,
      tournamentId: sanctioningRecord.proposal?.tournamentId,
      eventId,
      isOrigin: true,
    },
  ];
}

export function activateFromSanctioning({
  sanctioningRecord,
  sanctioningPolicy,
  venues,
  uuids,
}: ActivateFromSanctioningArgs) {
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
    // Retained for consumers that still read it. It is a boolean marker and cannot carry the
    // decision, the authority chain, or what the sanction confers — `sanction` below is the
    // richer expression of the same fact, and new consumers should read that.
    processCodes: ['SANCTIONED'],
    sanction: buildSanction(sanctioningRecord),

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

      // Event-level prize money reaches the activated event. `EventProposal.prizeMoney` has always
      // existed, but `Event` had no counterpart, so a proposal naming prize money per event had it
      // dropped here — silently, since nothing errored.
      if (ep.prizeMoney?.length) event.prizeMoney = ep.prizeMoney.map((pm) => ({ ...pm }));

      // Carry sanctioning constraints
      if (ep.allowedDrawTypes?.length) event.allowedDrawTypes = [...ep.allowedDrawTypes];
      else if (ep.drawType) event.allowedDrawTypes = [ep.drawType];

      const eventOtherIds = resolveEventOtherIds(ep, event.eventId, sanctioningRecord);
      if (eventOtherIds.length) event.eventOtherIds = eventOtherIds;

      return event;
    }),

    // Store sanctioning reference.
    //
    // `sanctioningId` is the only extension written here. The tier's home is the native
    // `tournamentTier` field set above — a canonical value with a native home should not also
    // arrive as a CODES name/value extension, which is the escape hatch for values that have none.
    //
    // A redundant `sanctioningTier` extension was written alongside it for one release (6.24.0) so
    // that anything already reading it would not break. Nothing did: no reader existed anywhere in
    // the ecosystem, and no tournament in production ever carried it.
    extensions: [
      {
        name: 'sanctioningId',
        value: sanctioningRecord.sanctioningId,
      },
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
    // `tiers` on a requirement are tier NAMES, so they match the tier's `value`.
    const applicableRequirements = policy.postEventRequirements.filter(
      (req) => !req.tiers?.length || req.tiers.includes(sanctioningRecord.sanctioningTier?.value ?? ''),
    );

    // Validate the pool BEFORE minting. The count is knowable up front here, so a
    // short pool can be reported precisely rather than discovered halfway through
    // and leaving some items with ids and others without. Strict when supplied:
    // a short pool means this replay needed a different number of ids than the
    // origin did — a divergence signal, not a licence to mint.
    if (uuids !== undefined && uuids.length < applicableRequirements.length) {
      return {
        error: INSUFFICIENT_UUIDS,
        context: { required: applicableRequirements.length, supplied: uuids.length },
      };
    }

    const items: ComplianceItem[] = applicableRequirements.map((req) => {
      const deadline = new Date(endDate);
      deadline.setDate(deadline.getDate() + req.deadlineDays);
      return {
        // Pool sufficiency was validated above, so this cannot come back empty.
        itemId: takeUUID({ uuids }).uuid as string,
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
