import type { SanctioningPolicy } from '@Types/sanctioningTypes';

const WHITE_BADGE = 'White Badge';

/**
 * ITF World Tennis Tour sanctioning policy.
 * Based on ITF WTT Regulations and Organisational Requirements.
 *
 * Tiers: W15/M15, W25/M25, W35, W50, W75, W100
 * Application deadlines: 16 weeks (W15-W50), 21 weeks (W75-W100)
 * National Association endorsement required.
 * Insurance naming ITF Ltd required.
 * Anti-corruption (TACP) compliance required.
 */
export const POLICY_SANCTIONING_ITF: SanctioningPolicy = {
  policyName: 'ITF World Tennis Tour Sanctioning Policy',
  policyVersion: '2026.1',
  effectiveDate: '2026-01-01',
  governingBodyId: 'itf',

  requireEndorsement: true,
  requireInsurance: true,
  requireSafetyPlan: true,
  requireMedicalPlan: true,
  requireAntiCorruption: true,
  requireSafeguarding: true,

  minimumLeadWeeks: 16,
  resultsDeadlineDays: 7,
  requirePostEventReport: true,

  tiers: [
    {
      tierName: 'M15/W15',
      tierLevel: 1,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['MALE', 'FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [16, 32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 15000,
      maximumPrizeMoney: 24999,
      currencyCode: 'USD',
      minimumCourts: 4,
      minimumOfficials: 2,
      officialCertificationLevel: WHITE_BADGE,
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 16,
    },
    {
      tierName: 'M25/W25',
      tierLevel: 2,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['MALE', 'FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 25000,
      maximumPrizeMoney: 34999,
      currencyCode: 'USD',
      minimumCourts: 5,
      minimumOfficials: 3,
      officialCertificationLevel: WHITE_BADGE,
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 16,
    },
    {
      tierName: 'W35',
      tierLevel: 3,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 35000,
      maximumPrizeMoney: 49999,
      currencyCode: 'USD',
      minimumCourts: 5,
      minimumOfficials: 3,
      officialCertificationLevel: WHITE_BADGE,
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 16,
    },
    {
      tierName: 'W50',
      tierLevel: 4,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 50000,
      maximumPrizeMoney: 74999,
      currencyCode: 'USD',
      minimumCourts: 6,
      minimumOfficials: 4,
      officialCertificationLevel: 'Bronze Badge',
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 16,
      requireBackdrops: true,
      requireScoreboards: true,
    },
    {
      tierName: 'W75',
      tierLevel: 5,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 75000,
      maximumPrizeMoney: 99999,
      currencyCode: 'USD',
      minimumCourts: 8,
      minimumOfficials: 5,
      officialCertificationLevel: 'Bronze Badge',
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 21,
      requireBackdrops: true,
      requireScoreboards: true,
    },
    {
      tierName: 'W100',
      tierLevel: 6,
      allowedEventTypes: ['SINGLES', 'DOUBLES'],
      allowedGenders: ['FEMALE'],
      allowedDrawTypes: ['SINGLE_ELIMINATION'],
      allowedDrawSizes: [32],
      qualifyingAllowed: true,
      maxQualifyingDrawSize: 32,
      minimumPrizeMoney: 100000,
      currencyCode: 'USD',
      minimumCourts: 10,
      minimumOfficials: 6,
      officialCertificationLevel: 'Silver Badge',
      tdRefereeSameAllowed: false,
      minimumLeadWeeks: 21,
      requireBackdrops: true,
      requireScoreboards: true,
    },
  ],

  personnelRules: {
    roles: [
      { roleName: 'Tournament Director', required: true, minimumCount: 1, safeguardingRequired: true },
      { roleName: 'Referee', required: true, minimumCount: 1, certificationRequired: WHITE_BADGE },
      { roleName: 'Chair Umpire', required: true, minimumCount: 2 },
    ],
  },

  calendarRules: {
    proximityWeeks: 1,
    maxEventsPerWeek: 5,
  },

  amendmentRules: {
    substantialChangeFields: [
      'proposedStartDate',
      'proposedEndDate',
      'sanctioningTier',
      'events.*.drawSize',
      'events.*.drawType',
      'totalPrizeMoney',
    ],
    noChangeWindowWeeks: 9,
    substantialChangeWindowWeeks: 16,
    prizeMoneyIncrease: 'ALLOWED',
    prizeMoneyDecrease: 'PROHIBITED',
    lateChangePenalty: true,
  },

  postEventRequirements: [
    {
      itemType: 'RESULTS_SUBMISSION',
      description: 'Submit tournament results via official ITF tournament software',
      required: true,
      deadlineDays: 7,
    },
    {
      itemType: 'PRIZE_MONEY_CONFIRMATION',
      description: 'Confirm all prize money has been disbursed to participants',
      required: true,
      deadlineDays: 14,
    },
    {
      itemType: 'SUPERVISOR_REPORT',
      description: 'Tournament Supervisor report on conduct and compliance',
      required: true,
      deadlineDays: 14,
    },
    {
      itemType: 'INCIDENT_REPORT',
      description: 'Report any serious medical incidents or code violations',
      required: false,
      deadlineDays: 3,
    },
    {
      itemType: 'SANCTION_FEE_PAYMENT',
      description: 'Sanction fee payment confirmation',
      required: true,
      deadlineDays: 21,
    },
  ],
};
