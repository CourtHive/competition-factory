import { validateProposal } from '@Validators/sanctioning/validateProposal';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { getEligibleTiers } from '@Query/sanctioning/getEligibleTiers';
import { getCompleteness } from '@Query/sanctioning/getCompleteness';
import { proposeAmendment, reviewAmendment } from '@Mutate/sanctioning/amendments';
import { submitComplianceItem, verifyComplianceItem, checkComplianceDeadlines } from '@Mutate/sanctioning/compliance';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// Types
import type {
  TournamentProposal,
  SanctioningRecord,
  SanctioningPolicy,
  ProposalChange,
  Applicant,
} from '@Types/sanctioningTypes';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const futureDate = (weeksFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
};

const basePolicy: SanctioningPolicy = {
  ...POLICY_SANCTIONING_GENERIC,
  requireEndorsement: false,
};

const testApplicant: Applicant = {
  organisationId: 'org-cov',
  organisationName: 'Coverage Club',
  contactName: 'Jane Coverage',
  contactEmail: 'jane@coverage.com',
};

function minimalProposal(overrides?: Partial<TournamentProposal>): TournamentProposal {
  return {
    tournamentName: 'Coverage Open',
    proposedStartDate: futureDate(20),
    proposedEndDate: futureDate(21),
    events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32, drawType: 'SINGLE_ELIMINATION' }],
    ...overrides,
  };
}

function makeRecord(overrides?: Partial<SanctioningRecord>): SanctioningRecord {
  return {
    sanctioningId: 'cov-001',
    status: 'DRAFT',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    proposal: minimalProposal(),
    ...overrides,
  } as SanctioningRecord;
}

function createApprovedViaEngine() {
  sanctioningEngine.executionQueue([
    {
      method: 'createSanctioningRecord',
      params: {
        governingBodyId: 'gov-001',
        applicant: testApplicant,
        proposal: minimalProposal(),
        sanctioningLevel: 'Level 2',
      },
    },
    { method: 'submitApplication', params: { sanctioningPolicy: basePolicy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
  ]);
}

// ===========================================================================
// validateProposal — remaining branch gaps
// ===========================================================================

describe('validateProposal — safety / medical / anti-corruption plans', () => {
  it('flags missing safetyPlan when required', () => {
    const policy: SanctioningPolicy = { ...basePolicy, requireSafetyPlan: true };
    let result: any = validateProposal({ proposal: minimalProposal(), sanctioningPolicy: policy });
    expect(result.valid).toBe(false);
    const issue = result.issues.find((i: any) => i.field === 'safetyPlan');
    expect(issue).toBeDefined();
    expect(issue.severity).toEqual('error');
  });

  it('flags missing medicalPlan when required', () => {
    const policy: SanctioningPolicy = { ...basePolicy, requireMedicalPlan: true };
    let result: any = validateProposal({ proposal: minimalProposal(), sanctioningPolicy: policy });
    const issue = result.issues.find((i: any) => i.field === 'medicalPlan');
    expect(issue).toBeDefined();
  });

  it('flags missing antiCorruptionCompliance when required', () => {
    const policy: SanctioningPolicy = { ...basePolicy, requireAntiCorruption: true };
    let result: any = validateProposal({ proposal: minimalProposal(), sanctioningPolicy: policy });
    const issue = result.issues.find((i: any) => i.field === 'antiCorruptionCompliance');
    expect(issue).toBeDefined();
  });

  it('flags missing safeguardingCompliance when required', () => {
    const policy: SanctioningPolicy = { ...basePolicy, requireSafeguarding: true };
    let result: any = validateProposal({ proposal: minimalProposal(), sanctioningPolicy: policy });
    const issue = result.issues.find((i: any) => i.field === 'safeguardingCompliance');
    expect(issue).toBeDefined();
  });

  it('passes when all compliance plans are provided', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireSafetyPlan: true,
      requireMedicalPlan: true,
      requireAntiCorruption: true,
      requireSafeguarding: true,
      requireInsurance: false,
      personnelRules: undefined,
    };
    const proposal = minimalProposal({
      safetyPlan: { documentType: 'safety' },
      medicalPlan: { documentType: 'medical' },
      antiCorruptionCompliance: true,
      safeguardingCompliance: true,
    });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateProposal — maximumPrizeMoney', () => {
  it('flags prize money exceeding tier maximum', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireInsurance: false,
      tiers: [{ tierName: 'Capped', tierLevel: 1, maximumPrizeMoney: 5000 }],
    };
    const proposal = minimalProposal({ totalPrizeMoney: [{ amount: 6000, currencyCode: 'USD' }] });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy, sanctioningTier: 'Capped' });
    expect(result.valid).toBe(false);
    const pmIssue = result.errors.find((i: any) => i.field === 'totalPrizeMoney');
    expect(pmIssue).toBeDefined();
    expect(pmIssue.message).toContain('Maximum');
  });
});

describe('validateProposal — allowedEventTypes and allowedGenders', () => {
  it('flags disallowed eventType for a tier', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireInsurance: false,
      tiers: [{ tierName: 'Restrict', tierLevel: 1, allowedEventTypes: ['DOUBLES'] }],
    };
    const proposal = minimalProposal();
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy, sanctioningTier: 'Restrict' });
    const issue = result.errors.find((i: any) => i.field.includes('eventType'));
    expect(issue).toBeDefined();
    expect(issue.message).toContain('SINGLES');
  });

  it('flags disallowed gender for a tier', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireInsurance: false,
      tiers: [{ tierName: 'GenderTier', tierLevel: 1, allowedGenders: ['FEMALE'] }],
    };
    const proposal = minimalProposal({
      events: [{ eventName: 'MS', eventType: 'SINGLES', gender: 'MALE' }],
    });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy, sanctioningTier: 'GenderTier' });
    const issue = result.errors.find((i: any) => i.field.includes('gender'));
    expect(issue).toBeDefined();
    expect(issue.message).toContain('MALE');
  });
});

describe('validateProposal — lead time', () => {
  it('flags insufficient lead time from policy minimumLeadWeeks', () => {
    const policy: SanctioningPolicy = { ...basePolicy, minimumLeadWeeks: 52, requireInsurance: false };
    const proposal = minimalProposal({ proposedStartDate: futureDate(4) });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy });
    const issue = result.errors.find((i: any) => i.field === 'proposedStartDate');
    expect(issue).toBeDefined();
    expect(issue.message).toContain('52');
  });

  it('uses tier-specific minimumLeadWeeks when available', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireInsurance: false,
      minimumLeadWeeks: 4,
      tiers: [{ tierName: 'Slow', tierLevel: 1, minimumLeadWeeks: 52 }],
    };
    const proposal = minimalProposal({ proposedStartDate: futureDate(10) });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy, sanctioningTier: 'Slow' });
    const issue = result.errors.find((i: any) => i.field === 'proposedStartDate');
    expect(issue).toBeDefined();
    expect(issue.message).toContain('52');
  });
});

describe('validateProposal — maxQualifyingDrawSize', () => {
  it('flags qualifying draw size exceeding tier maximum', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireInsurance: false,
      tiers: [{ tierName: 'Q', tierLevel: 1, qualifyingAllowed: true, maxQualifyingDrawSize: 16 }],
    };
    const proposal = minimalProposal({
      events: [{ eventName: 'S', eventType: 'SINGLES', qualifyingDrawSize: 32 }],
    });
    let result: any = validateProposal({ proposal, sanctioningPolicy: policy, sanctioningTier: 'Q' });
    const issue = result.errors.find((i: any) => i.field.includes('qualifyingDrawSize'));
    expect(issue).toBeDefined();
    expect(issue.message).toContain('exceeds maximum 16');
  });
});

describe('validateProposal — error boundaries', () => {
  it('returns error when proposal is missing', () => {
    let result: any = validateProposal({ proposal: undefined as any, sanctioningPolicy: basePolicy });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_MISSING_PROPOSAL');
  });

  it('returns error when policy is missing', () => {
    let result: any = validateProposal({ proposal: minimalProposal(), sanctioningPolicy: undefined as any });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_MISSING_SANCTIONING_POLICY');
  });
});

// ===========================================================================
// getCompleteness — policy requirement checks & isPresent edge cases
// ===========================================================================

describe('getCompleteness — policy requirement checks', () => {
  it('counts PENDING endorsement as present (boolean false is present)', () => {
    const record = makeRecord({
      endorsement: { status: 'PENDING' },
    });
    const policy: SanctioningPolicy = { ...basePolicy, requireEndorsement: true };
    let result: any = getCompleteness({ sanctioningRecord: record, sanctioningPolicy: policy });
    // isPresent(false) returns true because false is a valid boolean value,
    // so the endorsement check (status === ENDORSED) yields false but is still "present"
    expect(result.completeness.missingFields).not.toContain('endorsement');
  });

  it('counts endorsement as complete when ENDORSED', () => {
    const record = makeRecord({
      endorsement: { status: 'ENDORSED' },
    });
    const policy: SanctioningPolicy = { ...basePolicy, requireEndorsement: true, requireInsurance: false };
    let result: any = getCompleteness({ sanctioningRecord: record, sanctioningPolicy: policy });
    expect(result.completeness.missingFields).not.toContain('endorsement');
  });

  it('adds anti-corruption and safeguarding checks when policy requires them', () => {
    const record = makeRecord();
    const policy: SanctioningPolicy = {
      ...basePolicy,
      requireAntiCorruption: true,
      requireSafeguarding: true,
    };
    let result: any = getCompleteness({ sanctioningRecord: record, sanctioningPolicy: policy });
    expect(result.completeness.missingFields).toContain('proposal.antiCorruptionCompliance');
    expect(result.completeness.missingFields).toContain('proposal.safeguardingCompliance');
  });

  it('returns error when sanctioningRecord is missing', () => {
    let result: any = getCompleteness({ sanctioningRecord: undefined as any });
    expect(result.error).toBeDefined();
  });
});

describe('getCompleteness — isPresent edge cases', () => {
  it('treats 0 as present for numeric fields', () => {
    const record = makeRecord({
      proposal: minimalProposal({ totalPrizeMoney: [{ amount: 0, currencyCode: 'USD' }] }),
    });
    let result: any = getCompleteness({ sanctioningRecord: record });
    expect(result.completeness.missingFields).not.toContain('proposal.totalPrizeMoney');
  });

  it('treats empty string applicant name as missing', () => {
    const record = makeRecord({ applicant: { ...testApplicant, contactName: '   ' } });
    let result: any = getCompleteness({ sanctioningRecord: record });
    expect(result.completeness.missingFields).toContain('applicant.contactName');
  });

  it('treats empty events array length (0) as present due to isPresent(number)', () => {
    const record = makeRecord({ proposal: minimalProposal({ events: [] as any }) });
    let result: any = getCompleteness({ sanctioningRecord: record });
    // getCompleteness checks proposal?.events?.length which is 0;
    // isPresent(0) returns true because 0 is a valid number
    expect(result.completeness.missingFields).not.toContain('proposal.events');
  });
});

// ===========================================================================
// getEligibleTiers — maximumPrizeMoney & missing proposal
// ===========================================================================

describe('getEligibleTiers — maximumPrizeMoney', () => {
  it('excludes tiers where prize money exceeds maximum', () => {
    const policy: SanctioningPolicy = {
      ...basePolicy,
      tiers: [
        { tierName: 'Low', tierLevel: 1, maximumPrizeMoney: 3000 },
        { tierName: 'High', tierLevel: 2, maximumPrizeMoney: 50000 },
      ],
    };
    const proposal = minimalProposal({ totalPrizeMoney: [{ amount: 10000, currencyCode: 'USD' }] });
    let result: any = getEligibleTiers({ proposal, sanctioningPolicy: policy });
    expect(result.success).toBe(true);
    const low = result.tierEligibilities.find((t: any) => t.tierName === 'Low');
    const high = result.tierEligibilities.find((t: any) => t.tierName === 'High');
    expect(low.eligible).toBe(false);
    expect(low.reasons[0]).toContain('above maximum');
    expect(high.eligible).toBe(true);
  });

  it('returns error when proposal is missing', () => {
    let result: any = getEligibleTiers({ proposal: undefined as any, sanctioningPolicy: basePolicy });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_MISSING_PROPOSAL');
  });

  it('returns error when policy is missing', () => {
    let result: any = getEligibleTiers({ proposal: minimalProposal(), sanctioningPolicy: undefined as any });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_MISSING_SANCTIONING_POLICY');
  });
});

// ===========================================================================
// Engine resolution — sanctioningId & proposal in params
// ===========================================================================

describe('Engine resolution — explicit sanctioningId and proposal in params', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('resolves record by explicit sanctioningId for validateProposal', () => {
    sanctioningEngine.createSanctioningRecord({
      sanctioningId: 'resolve-test',
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: minimalProposal({ insuranceCertificate: { documentType: 'ins' } }),
    });
    let result: any = sanctioningEngine.validateProposal({
      sanctioningId: 'resolve-test',
      sanctioningPolicy: { ...basePolicy, requireInsurance: false, personnelRules: undefined },
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('uses proposal from params when provided to getEligibleTiers', () => {
    sanctioningEngine.createSanctioningRecord({
      sanctioningId: 'et-test',
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: minimalProposal(),
    });
    const overrideProposal = minimalProposal({
      totalPrizeMoney: [{ amount: 1, currencyCode: 'USD' }],
      events: [{ eventName: 'S', eventType: 'SINGLES', drawSize: 8 }],
    });
    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningId: 'et-test',
      proposal: overrideProposal,
      sanctioningPolicy: basePolicy,
    });
    expect(result.success).toBe(true);
    // With only $1 prize money, Level 2 and Level 3 should be ineligible
    const level2 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 2');
    expect(level2.eligible).toBe(false);
  });
});

// ===========================================================================
// Amendment edge cases
// ===========================================================================

describe('Amendment edge cases', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('applyChanges skips REMOVED changeType', () => {
    createApprovedViaEngine();

    const changes: ProposalChange[] = [
      { field: 'tournamentName', previousValue: 'Coverage Open', proposedValue: undefined, changeType: 'REMOVED' },
    ];
    let result: any = sanctioningEngine.proposeAmendment({ changes, sanctioningPolicy: basePolicy });
    expect(result.success).toBe(true);
    expect(result.autoApproved).toBe(true);

    // tournamentName should still be the original since REMOVED is skipped
    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    expect(record.proposal.tournamentName).toEqual('Coverage Open');
  });

  it('applyChanges skips non-amendable fields', () => {
    createApprovedViaEngine();

    const changes: ProposalChange[] = [
      { field: 'status', previousValue: 'APPROVED', proposedValue: 'DRAFT', changeType: 'MODIFIED' },
    ];
    let result: any = sanctioningEngine.proposeAmendment({ changes, sanctioningPolicy: basePolicy });
    expect(result.success).toBe(true);
    // The status field is not in AMENDABLE_FIELD_PREFIXES, so it shouldn't be applied
    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    expect(record.status).toEqual('APPROVED');
  });

  it('blocks amendments inside noChangeWindowWeeks', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: minimalProposal({ proposedStartDate: futureDate(2) }),
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: basePolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);

    const changes: ProposalChange[] = [
      { field: 'tournamentName', previousValue: 'x', proposedValue: 'y', changeType: 'MODIFIED' },
    ];
    // Policy has noChangeWindowWeeks: 4 and event is 2 weeks away
    let result: any = sanctioningEngine.proposeAmendment({ changes, sanctioningPolicy: basePolicy });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_CHANGE_WINDOW_CLOSED');
  });

  it('classifySeverity returns MINOR when no substantialChangeFields configured', () => {
    createApprovedViaEngine();

    const policyNoSubstantial: SanctioningPolicy = {
      ...basePolicy,
      amendmentRules: { substantialChangeFields: [] },
    };
    const changes: ProposalChange[] = [
      { field: 'proposedStartDate', previousValue: 'x', proposedValue: 'y', changeType: 'MODIFIED' },
    ];
    let result: any = sanctioningEngine.proposeAmendment({ changes, sanctioningPolicy: policyNoSubstantial });
    expect(result.severity).toEqual('MINOR');
    expect(result.autoApproved).toBe(true);
  });

  it('reviewAmendment returns error for missing amendmentId', () => {
    const record = makeRecord({ status: 'APPROVED', amendments: [] });
    let result: any = reviewAmendment({
      sanctioningRecord: record,
      amendmentId: '',
      approved: true,
    });
    expect(result.error).toBeDefined();
  });

  it('proposeAmendment returns error for missing sanctioningRecord', () => {
    let result: any = proposeAmendment({
      sanctioningRecord: undefined as any,
      changes: [{ field: 'tournamentName', previousValue: 'a', proposedValue: 'b', changeType: 'MODIFIED' }],
    });
    expect(result.error).toBeDefined();
  });
});

// ===========================================================================
// Compliance edge cases
// ===========================================================================

describe('Compliance edge cases', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('rejects resubmission of already-VERIFIED item', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: minimalProposal(),
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: basePolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: basePolicy } },
      { method: 'transitionToPostEvent', params: {} },
    ]);

    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    const item = record.compliance.items[0];
    sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
    sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });

    let result: any = sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
    expect(result.error).toBeDefined();
    expect(result.context?.message).toContain('VERIFIED');
  });

  it('rejects resubmission of already-WAIVED item', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: minimalProposal(),
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: basePolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: basePolicy } },
      { method: 'transitionToPostEvent', params: {} },
    ]);

    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    const item = record.compliance.items[0];
    sanctioningEngine.waiveComplianceItem({ itemId: item.itemId, reason: 'Not applicable' });

    let result: any = sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
    expect(result.error).toBeDefined();
    expect(result.context?.message).toContain('WAIVED');
  });

  it('checkComplianceDeadlines marks PENDING items as OVERDUE past deadline', () => {
    const record = makeRecord({
      status: 'POST_EVENT',
      compliance: {
        status: 'PENDING',
        items: [
          {
            itemId: 'dl-1',
            itemType: 'RESULTS_SUBMISSION',
            description: 'Results',
            required: true,
            status: 'PENDING',
            deadline: '2025-01-01',
          },
          {
            itemId: 'dl-2',
            itemType: 'FINANCIAL_RECONCILIATION',
            description: 'Finance',
            required: false,
            status: 'SUBMITTED',
            deadline: '2025-01-01',
          },
        ],
      },
    });
    let result: any = checkComplianceDeadlines({ sanctioningRecord: record, asOfDate: '2025-06-01' });
    expect(result.success).toBe(true);
    expect(result.overdueCount).toEqual(1);
    expect(record.compliance!.items[0].status).toEqual('OVERDUE');
    // SUBMITTED items should not be overridden
    expect(record.compliance!.items[1].status).toEqual('SUBMITTED');
  });

  it('closeApplication sets compliance status to COMPLIANT', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: minimalProposal(),
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: basePolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: basePolicy } },
      { method: 'transitionToPostEvent', params: {} },
    ]);

    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    const requiredItems = record.compliance.items.filter((i: any) => i.required);
    for (const item of requiredItems) {
      sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
      sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });
    }

    sanctioningEngine.closeApplication({ closedBy: 'Admin', reason: 'All done' });
    record = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    expect(record.status).toEqual('CLOSED');
    expect(record.compliance.status).toEqual('COMPLIANT');
    expect(record.compliance.completedAt).toBeDefined();
  });

  it('submitComplianceItem returns error for missing itemId', () => {
    const record = makeRecord({
      status: 'POST_EVENT',
      compliance: { status: 'PENDING', items: [] },
    });
    let result: any = submitComplianceItem({ sanctioningRecord: record, itemId: '' });
    expect(result.error).toBeDefined();
  });

  it('verifyComplianceItem returns error when compliance is absent', () => {
    const record = makeRecord({ status: 'POST_EVENT' });
    let result: any = verifyComplianceItem({ sanctioningRecord: record, itemId: 'x' });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_COMPLIANCE_NOT_APPLICABLE');
  });
});
