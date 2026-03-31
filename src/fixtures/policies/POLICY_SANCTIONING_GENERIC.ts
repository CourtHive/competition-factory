import type { SanctioningPolicy } from '@Types/sanctioningTypes';

const BEST_OF_3 = 'SET3-S:6/TB7';

export const POLICY_SANCTIONING_GENERIC: SanctioningPolicy = {
  policyName: 'Generic Sanctioning Policy',
  policyVersion: '2026.1',
  effectiveDate: '2026-01-01',
  governingBodyId: 'generic',

  requireEndorsement: false,
  requireInsurance: true,
  requireSafetyPlan: false,
  requireMedicalPlan: false,
  requireAntiCorruption: false,
  requireSafeguarding: false,

  minimumLeadWeeks: 8,
  resultsDeadlineDays: 14,
  requirePostEventReport: true,

  tiers: [
    {
      tierName: 'Level 1',
      tierLevel: 1,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN'],
      allowedDrawSizes: [8, 16, 32, 64],
      allowedMatchUpFormats: [BEST_OF_3, 'SET1-S:6/TB7'],
      qualifyingAllowed: false,
      minimumCourts: 2,
      minimumOfficials: 1,
      tdRefereeSameAllowed: true,
    },
    {
      tierName: 'Level 2',
      tierLevel: 2,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [16, 32, 64],
      allowedMatchUpFormats: [BEST_OF_3],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 5000,
      minimumCourts: 4,
      minimumOfficials: 2,
      officialCertificationLevel: 'Level 2',
      tdRefereeSameAllowed: false,
      minimumParticipants: 24,
    },
    {
      tierName: 'Level 3',
      tierLevel: 3,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [32, 64, 128],
      allowedMatchUpFormats: [BEST_OF_3],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 64,
      minimumPrizeMoney: 15000,
      minimumCourts: 8,
      minimumOfficials: 4,
      officialCertificationLevel: 'Level 3',
      tdRefereeSameAllowed: false,
      minimumParticipants: 48,
      prerequisiteTiers: ['Level 2'],
      prerequisiteEventCount: 3,
    },
  ],

  personnelRules: {
    roles: [
      { roleName: 'Tournament Director', required: true, minimumCount: 1, safeguardingRequired: true },
      { roleName: 'Referee', required: true, minimumCount: 1 },
    ],
  },

  calendarRules: {
    proximityWeeks: 2,
    maxEventsPerWeek: 3,
  },

  amendmentRules: {
    substantialChangeFields: [
      'proposedStartDate',
      'proposedEndDate',
      'sanctioningTier',
      'events.*.drawSize',
      'events.*.drawType',
    ],
    noChangeWindowWeeks: 4,
    substantialChangeWindowWeeks: 9,
    prizeMoneyIncrease: 'ALLOWED',
    prizeMoneyDecrease: 'REQUIRES_REVIEW',
    lateChangePenalty: true,
  },

  postEventRequirements: [
    {
      itemType: 'RESULTS_SUBMISSION',
      description: 'Submit tournament results',
      required: true,
      deadlineDays: 14,
    },
    {
      itemType: 'FINANCIAL_RECONCILIATION',
      description: 'Confirm all prize money disbursed',
      required: true,
      deadlineDays: 30,
    },
  ],
};
