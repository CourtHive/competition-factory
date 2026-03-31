import type { SanctioningPolicy } from '@Types/sanctioningTypes';

/**
 * USTA Tournament Sanctioning Policy.
 * Based on USTA Junior and Adult Tournament Regulations.
 *
 * Levels: 1 (national) through 7 (local)
 * Level 1-2 may carry ITF ranking points via MOU.
 * Primary application deadline: September 30 for following year.
 * Section-level endorsement required for levels 1-4.
 * SafeSport certification required for Tournament Directors.
 */
export const POLICY_SANCTIONING_USTA: SanctioningPolicy = {
  policyName: 'USTA Tournament Sanctioning Policy',
  policyVersion: '2026.1',
  effectiveDate: '2026-01-01',
  governingBodyId: 'usta',

  requireEndorsement: true,
  requireInsurance: true,
  requireSafetyPlan: false,
  requireMedicalPlan: false,
  requireAntiCorruption: false,
  requireSafeguarding: true,

  minimumLeadWeeks: 12,
  resultsDeadlineDays: 14,
  requirePostEventReport: true,

  tiers: [
    {
      tierName: 'Level 7',
      tierLevel: 1,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'FEED_IN_CHAMPIONSHIP', 'COMPASS'],
      allowedDrawSizes: [4, 8, 16, 32],
      qualifyingAllowed: false,
      minimumCourts: 2,
      minimumOfficials: 1,
      tdRefereeSameAllowed: true,
    },
    {
      tierName: 'Level 6',
      tierLevel: 2,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'FEED_IN_CHAMPIONSHIP', 'COMPASS'],
      allowedDrawSizes: [8, 16, 32],
      qualifyingAllowed: false,
      minimumCourts: 3,
      minimumOfficials: 1,
      tdRefereeSameAllowed: false,
    },
    {
      tierName: 'Level 5',
      tierLevel: 3,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [16, 32, 64],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumCourts: 4,
      minimumOfficials: 2,
      officialCertificationLevel: 'Sectional',
      tdRefereeSameAllowed: false,
    },
    {
      tierName: 'Level 4',
      tierLevel: 4,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [32, 64],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumCourts: 6,
      minimumOfficials: 3,
      officialCertificationLevel: 'Sectional',
      tdRefereeSameAllowed: false,
      minimumParticipants: 48,
    },
    {
      tierName: 'Level 3',
      tierLevel: 5,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [32, 64, 128],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 64,
      minimumCourts: 8,
      minimumOfficials: 4,
      officialCertificationLevel: 'National',
      tdRefereeSameAllowed: false,
      minimumParticipants: 100,
      prerequisiteTiers: ['Level 4'],
      prerequisiteEventCount: 2,
    },
    {
      tierName: 'Level 2',
      tierLevel: 6,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [32, 64, 128],
      allowedMatchUpFormats: ['SET3-S:6/TB7'],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 64,
      minimumCourts: 12,
      minimumOfficials: 6,
      officialCertificationLevel: 'National',
      tdRefereeSameAllowed: false,
      minimumParticipants: 125,
      prerequisiteTiers: ['Level 3'],
      prerequisiteEventCount: 3,
    },
    {
      tierName: 'Level 1',
      tierLevel: 7,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      allowedDrawSizes: [64, 128],
      allowedMatchUpFormats: ['SET3-S:6/TB7'],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 64,
      minimumCourts: 16,
      minimumOfficials: 8,
      officialCertificationLevel: 'National',
      tdRefereeSameAllowed: false,
      minimumParticipants: 225,
      prerequisiteTiers: ['Level 2'],
      prerequisiteEventCount: 3,
    },
  ],

  personnelRules: {
    roles: [
      { roleName: 'Tournament Director', required: true, minimumCount: 1, safeguardingRequired: true },
      { roleName: 'Referee', required: true, minimumCount: 1, certificationRequired: 'Sectional' },
    ],
  },

  calendarRules: {
    proximityWeeks: 2,
    maxEventsPerWeek: 4,
  },

  amendmentRules: {
    substantialChangeFields: [
      'proposedStartDate',
      'proposedEndDate',
      'sanctioningTier',
      'events.*.drawSize',
      'events.*.drawType',
      'events.*.matchUpFormat',
    ],
    noChangeWindowWeeks: 4,
    substantialChangeWindowWeeks: 8,
    prizeMoneyIncrease: 'ALLOWED',
    prizeMoneyDecrease: 'REQUIRES_REVIEW',
    lateChangePenalty: true,
  },

  postEventRequirements: [
    {
      itemType: 'RESULTS_SUBMISSION',
      description: 'Submit tournament results to USTA via approved tournament software',
      required: true,
      deadlineDays: 14,
    },
    {
      itemType: 'FINANCIAL_RECONCILIATION',
      description: 'Confirm prize money disbursement and financial reporting',
      required: true,
      deadlineDays: 30,
      tiers: ['Level 1', 'Level 2', 'Level 3'],
    },
    {
      itemType: 'SAFEGUARDING_REPORT',
      description: 'Confirm SafeSport compliance and report any incidents',
      required: true,
      deadlineDays: 7,
    },
  ],
};
