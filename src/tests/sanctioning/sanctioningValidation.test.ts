import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// Types
import type { Applicant, TournamentProposal } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const baseProposal: TournamentProposal = {
  tournamentName: 'Test Open 2026',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  hostCountryCode: 'USA',
  surfaceCategory: 'HARD',
  indoorOutdoor: 'OUTDOOR',
  events: [
    {
      eventName: "Men's Singles",
      eventType: 'SINGLES',
      gender: 'MALE',
      drawSize: 32,
      drawType: 'SINGLE_ELIMINATION',
      matchUpFormat: 'SET3-S:6/TB7',
    },
  ],
  tournamentDirector: { personName: 'Alice Director', role: 'Tournament Director' },
  referee: { personName: 'Bob Referee', role: 'Referee' },
  venues: [{ venueName: 'Main Courts', numberOfCourts: 8 }],
  totalPrizeMoney: [{ amount: 20000, currencyCode: 'USD' }],
};

function createTestRecord(proposalOverrides?: Partial<TournamentProposal>) {
  const proposal = { ...baseProposal, ...proposalOverrides };
  sanctioningEngine.createSanctioningRecord({
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    proposal,
  });
}

describe('Policy Validation — validateProposal', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('validates a fully compliant Level 3 proposal', () => {
    createTestRecord({
      insuranceCertificate: { documentType: 'insurance', verified: true },
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 3',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags missing insurance when required', () => {
    createTestRecord();
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    expect(result.success).toBe(true);
    const insuranceIssue = result.issues.find((i: any) => i.field === 'insuranceCertificate');
    expect(insuranceIssue).toBeDefined();
    expect(insuranceIssue.severity).toEqual('error');
  });

  it('flags insufficient prize money for tier', () => {
    createTestRecord({ totalPrizeMoney: [{ amount: 1000, currencyCode: 'USD' }] });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 3',
    });
    expect(result.valid).toBe(false);
    const pmIssue = result.errors.find((i: any) => i.field === 'totalPrizeMoney');
    expect(pmIssue).toBeDefined();
  });

  it('flags disallowed draw size', () => {
    createTestRecord({
      events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 12, drawType: 'SINGLE_ELIMINATION' }],
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 2',
    });
    expect(result.valid).toBe(false);
    const sizeIssue = result.errors.find((i: any) => i.field.includes('drawSize'));
    expect(sizeIssue).toBeDefined();
  });

  it('flags disallowed draw type', () => {
    createTestRecord({
      events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32, drawType: 'COMPASS' }],
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 2',
    });
    expect(result.valid).toBe(false);
    const typeIssue = result.errors.find((i: any) => i.field.includes('drawType'));
    expect(typeIssue).toBeDefined();
  });

  it('flags disallowed match format', () => {
    createTestRecord({
      events: [
        {
          eventName: 'Singles',
          eventType: 'SINGLES',
          drawSize: 32,
          matchUpFormat: 'SET1-S:4/TB7',
        },
      ],
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 2',
    });
    const fmtIssue = result.errors.find((i: any) => i.field.includes('matchUpFormat'));
    expect(fmtIssue).toBeDefined();
  });

  it('flags qualifying when not allowed', () => {
    createTestRecord({
      events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32, qualifyingDrawSize: 16 }],
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 1',
    });
    const qIssue = result.errors.find((i: any) => i.field.includes('qualifyingDrawSize'));
    expect(qIssue).toBeDefined();
  });

  it('flags insufficient courts', () => {
    createTestRecord({ venues: [{ venueName: 'Small', numberOfCourts: 1 }] });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
      sanctioningTier: 'Level 2',
    });
    const courtIssue = result.errors.find((i: any) => i.field === 'venues');
    expect(courtIssue).toBeDefined();
  });

  it('flags missing required personnel', () => {
    createTestRecord({ tournamentDirector: undefined, referee: undefined });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    const directorIssue = result.errors.find((i: any) => i.field.includes('Tournament Director'));
    const refereeIssue = result.errors.find((i: any) => i.field.includes('Referee'));
    expect(directorIssue).toBeDefined();
    expect(refereeIssue).toBeDefined();
  });

  it('flags insufficient certification level', () => {
    createTestRecord({
      referee: { personName: 'Low Cert Ref', role: 'Referee', certificationLevel: 'White Badge' },
    });
    // ITF W50 requires Bronze Badge for referee
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: {
        ...POLICY_SANCTIONING_GENERIC,
        personnelRules: {
          roles: [
            { roleName: 'Referee', required: true, minimumCount: 1, certificationRequired: 'Bronze Badge' },
            { roleName: 'Tournament Director', required: true, minimumCount: 1 },
          ],
        },
      },
    });
    const certIssue = result.errors.find((i: any) => i.field.includes('certification'));
    expect(certIssue).toBeDefined();
    expect(certIssue.message).toContain('White Badge');
    expect(certIssue.message).toContain('Bronze Badge');
  });

  it('accepts sufficient certification level', () => {
    createTestRecord({
      referee: { personName: 'Good Ref', role: 'Referee', certificationLevel: 'Gold Badge' },
      insuranceCertificate: { documentType: 'insurance', verified: true },
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: {
        ...POLICY_SANCTIONING_GENERIC,
        personnelRules: {
          roles: [
            { roleName: 'Referee', required: true, minimumCount: 1, certificationRequired: 'Bronze Badge' },
            { roleName: 'Tournament Director', required: true, minimumCount: 1 },
          ],
        },
      },
    });
    const certIssues = result.errors.filter((i: any) => i.field.includes('certification'));
    expect(certIssues).toHaveLength(0);
  });

  it('flags missing certification when required', () => {
    createTestRecord({
      referee: { personName: 'No Cert Ref', role: 'Referee' },
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: {
        ...POLICY_SANCTIONING_GENERIC,
        personnelRules: {
          roles: [
            { roleName: 'Referee', required: true, minimumCount: 1, certificationRequired: 'White Badge' },
            { roleName: 'Tournament Director', required: true, minimumCount: 1 },
          ],
        },
      },
    });
    const certIssue = result.errors.find((i: any) => i.field.includes('certification'));
    expect(certIssue).toBeDefined();
    expect(certIssue.message).toContain('none specified');
  });

  it('validates without tier (global rules only)', () => {
    createTestRecord({
      insuranceCertificate: { documentType: 'insurance', verified: true },
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    expect(result.success).toBe(true);
    // Only personnel issues expected (director + referee are set in baseProposal)
    const nonInsuranceErrors = result.errors.filter((i: any) => i.field !== 'insuranceCertificate');
    expect(nonInsuranceErrors).toHaveLength(0);
  });
});

describe('Eligible Tiers', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('returns eligible tiers for a standard proposal', () => {
    createTestRecord();
    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    expect(result.success).toBe(true);
    expect(result.tierEligibilities).toHaveLength(3);
    expect(result.eligibleTiers.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes tiers where draw size is not allowed', () => {
    createTestRecord({
      events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 8 }],
      totalPrizeMoney: [{ amount: 100, currencyCode: 'USD' }],
    });
    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    // Level 1 allows 8, Level 2 does not, Level 3 does not
    const level1 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 1');
    const level2 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 2');
    expect(level1.eligible).toBe(true);
    expect(level2.eligible).toBe(false);
  });

  it('excludes tiers where prize money is insufficient', () => {
    createTestRecord({ totalPrizeMoney: [{ amount: 1000, currencyCode: 'USD' }] });
    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    const level2 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 2');
    const level3 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 3');
    expect(level2.eligible).toBe(false);
    expect(level3.eligible).toBe(false);
    expect(level2.reasons.length).toBeGreaterThan(0);
  });
});

describe('Completeness Scoring', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('returns completeness score for a full proposal', () => {
    createTestRecord();
    let result: any = sanctioningEngine.getCompleteness({});
    expect(result.success).toBe(true);
    expect(result.completeness.score).toBeGreaterThan(80);
    expect(result.completeness.completedFields).toBeGreaterThan(0);
  });

  it('returns lower score for minimal proposal', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: { organisationName: 'Minimal' },
      proposal: {
        tournamentName: 'Minimal',
        proposedStartDate: '2027-01-01',
        proposedEndDate: '2027-01-02',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
    });
    let result: any = sanctioningEngine.getCompleteness({});
    expect(result.completeness.score).toBeLessThan(60);
    expect(result.completeness.missingFields.length).toBeGreaterThan(3);
  });

  it('includes policy-driven fields in completeness check', () => {
    createTestRecord();
    let result: any = sanctioningEngine.getCompleteness({
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    // Generic policy requires insurance
    expect(result.completeness.missingFields).toContain('proposal.insuranceCertificate');
  });
});
