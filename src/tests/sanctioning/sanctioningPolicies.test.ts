import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Fixtures
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { POLICY_SANCTIONING_USTA } from '@Fixtures/policies/POLICY_SANCTIONING_USTA';
import { POLICY_SANCTIONING_ITF } from '@Fixtures/policies/POLICY_SANCTIONING_ITF';

// Types
import type { Applicant, TournamentProposal } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Club',
  contactName: 'Jane',
  contactEmail: 'jane@test.com',
};

describe('Policy Fixtures — Structure Validation', () => {
  it('GENERIC policy has valid structure', () => {
    expect(POLICY_SANCTIONING_GENERIC.policyName).toBeDefined();
    expect(POLICY_SANCTIONING_GENERIC.policyVersion).toBeDefined();
    expect(POLICY_SANCTIONING_GENERIC.effectiveDate).toBeDefined();
    expect(POLICY_SANCTIONING_GENERIC.tiers.length).toBeGreaterThan(0);
    expect(POLICY_SANCTIONING_GENERIC.personnelRules).toBeDefined();
    expect(POLICY_SANCTIONING_GENERIC.amendmentRules).toBeDefined();
    expect(POLICY_SANCTIONING_GENERIC.postEventRequirements?.length).toBeGreaterThan(0);
  });

  it('ITF policy has valid structure with 6 tiers', () => {
    expect(POLICY_SANCTIONING_ITF.policyName).toContain('ITF');
    expect(POLICY_SANCTIONING_ITF.governingBodyId).toEqual('itf');
    expect(POLICY_SANCTIONING_ITF.tiers).toHaveLength(6);
    expect(POLICY_SANCTIONING_ITF.requireEndorsement).toBe(true);
    expect(POLICY_SANCTIONING_ITF.requireAntiCorruption).toBe(true);

    // Tiers should be ordered by level
    for (let i = 1; i < POLICY_SANCTIONING_ITF.tiers.length; i++) {
      expect(POLICY_SANCTIONING_ITF.tiers[i].tierLevel).toBeGreaterThan(POLICY_SANCTIONING_ITF.tiers[i - 1].tierLevel);
    }

    // W75 and W100 should have longer lead time
    const w75 = POLICY_SANCTIONING_ITF.tiers.find((t) => t.tierName === 'W75');
    const w15 = POLICY_SANCTIONING_ITF.tiers.find((t) => t.tierName === 'M15/W15');
    expect(w75?.minimumLeadWeeks).toEqual(21);
    expect(w15?.minimumLeadWeeks).toEqual(16);
  });

  it('USTA policy has valid structure with 7 levels', () => {
    expect(POLICY_SANCTIONING_USTA.policyName).toContain('USTA');
    expect(POLICY_SANCTIONING_USTA.governingBodyId).toEqual('usta');
    expect(POLICY_SANCTIONING_USTA.tiers).toHaveLength(7);
    expect(POLICY_SANCTIONING_USTA.requireEndorsement).toBe(true);
    expect(POLICY_SANCTIONING_USTA.requireSafeguarding).toBe(true);

    // Level 1 is highest tier (most restrictive)
    const level1 = POLICY_SANCTIONING_USTA.tiers.find((t) => t.tierName === 'Level 1');
    const level7 = POLICY_SANCTIONING_USTA.tiers.find((t) => t.tierName === 'Level 7');
    expect(level1!.tierLevel).toBeGreaterThan(level7!.tierLevel);
    expect(level1!.minimumParticipants).toEqual(225);
    expect(level7!.tdRefereeSameAllowed).toBe(true);
    expect(level1!.tdRefereeSameAllowed).toBe(false);
  });
});

describe('Policy Fixtures — Engine Integration', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('ITF policy validates a W50 proposal', () => {
    const w50Proposal: TournamentProposal = {
      tournamentName: 'W50 Raleigh',
      proposedStartDate: '2028-06-01',
      proposedEndDate: '2028-06-07',
      hostCountryCode: 'USA',
      surfaceCategory: 'HARD',
      indoorOutdoor: 'OUTDOOR',
      totalPrizeMoney: [{ amount: 50000, currencyCode: 'USD' }],
      venues: [{ venueName: 'Cary Tennis Park', numberOfCourts: 12 }],
      tournamentDirector: { personName: 'Alice', role: 'Tournament Director' },
      referee: { personName: 'Bob', role: 'Referee', certificationLevel: 'Bronze Badge' },
      officials: [
        { role: 'Chair Umpire', personName: 'Carol Umpire', certificationLevel: 'White Badge' },
        { role: 'Chair Umpire', personName: 'Dave Umpire', certificationLevel: 'White Badge' },
      ],
      insuranceCertificate: { documentType: 'insurance', verified: true },
      safetyPlan: { documentType: 'safety' },
      medicalPlan: { documentType: 'medical' },
      antiCorruptionCompliance: true,
      safeguardingCompliance: true,
      events: [
        {
          eventName: "Women's Singles",
          eventType: 'SINGLES',
          gender: 'FEMALE',
          drawSize: 32,
          drawType: 'SINGLE_ELIMINATION',
          matchUpFormat: 'SET3-S:6/TB7',
          qualifyingDrawSize: 16,
        },
        {
          eventName: "Women's Doubles",
          eventType: 'DOUBLES',
          gender: 'FEMALE',
          drawSize: 32,
        },
      ],
    };

    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: testApplicant,
      proposal: w50Proposal,
    });

    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_ITF,
      sanctioningTier: 'W50',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('ITF policy rejects wrong gender for W50', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: testApplicant,
      proposal: {
        tournamentName: 'Bad W50',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        events: [{ eventName: "Men's Singles", eventType: 'SINGLES', gender: 'MALE', drawSize: 32 }],
      },
    });

    let result: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_ITF,
      sanctioningTier: 'W50',
    });
    const genderIssue = result.errors.find((i: any) => i.field.includes('gender'));
    expect(genderIssue).toBeDefined();
  });

  it('USTA policy returns eligible tiers for a standard proposal', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'usta',
      applicant: testApplicant,
      proposal: {
        tournamentName: 'USTA Test',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        venues: [{ venueName: 'Local Courts', numberOfCourts: 6 }],
        events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32 }],
      },
    });

    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningPolicy: POLICY_SANCTIONING_USTA,
    });
    expect(result.success).toBe(true);
    expect(result.tierEligibilities).toHaveLength(7);

    // Level 7 and Level 6 should be eligible (no prize money requirement, draw size 32 allowed)
    const level7 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 7');
    expect(level7.eligible).toBe(true);

    // Level 1 should NOT be eligible (draw size 32 not in [64, 128])
    const level1 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 1');
    expect(level1.eligible).toBe(false);
  });

  it('ITF policy snapshots at submission time', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: testApplicant,
      proposal: {
        tournamentName: 'Snapshot Test',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
    });

    sanctioningEngine.requestEndorsement({ endorserId: 'nat-fed-001', endorserName: 'National Fed' });
    sanctioningEngine.endorseApplication({});
    sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_ITF });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    expect(record.policyVersion).toEqual('2026.1');
    expect(record.policySnapshot).toBeDefined();
    expect(record.policySnapshot.policyName).toContain('ITF');
    expect(record.policySnapshot.tiers).toHaveLength(6);
  });
});
