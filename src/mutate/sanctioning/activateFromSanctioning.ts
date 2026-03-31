import { transitionStatus } from './transitionStatus';
import { UUID } from '@Tools/UUID';

// constants
import { MISSING_SANCTIONING_RECORD, ACTIVE } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { SanctioningRecord, SanctioningPolicy, ComplianceRecord, ComplianceItem } from '@Types/sanctioningTypes';
import type { Tournament, Event } from '@Types/tournamentTypes';

type ActivateFromSanctioningArgs = {
  sanctioningRecord: SanctioningRecord;
  sanctioningPolicy?: SanctioningPolicy;
};

export function activateFromSanctioning({ sanctioningRecord, sanctioningPolicy }: ActivateFromSanctioningArgs) {
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
    tournamentId: UUID(),
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
        eventId: UUID(),
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

    // Store sanctioning reference
    extensions: [
      {
        name: 'sanctioningId',
        value: sanctioningRecord.sanctioningId,
      },
      ...(sanctioningRecord.sanctioningLevel
        ? [{ name: 'sanctioningTier', value: sanctioningRecord.sanctioningLevel }]
        : []),
    ],

    venues: [],
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
      .filter((req) => !req.tiers?.length || req.tiers.includes(sanctioningRecord.sanctioningLevel ?? ''))
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
