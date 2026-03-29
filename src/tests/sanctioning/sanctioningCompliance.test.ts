import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Fixtures
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// Types
import type { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Club',
  contactName: 'Jane',
  contactEmail: 'jane@test.com',
};

const testProposal: TournamentProposal = {
  tournamentName: 'Compliance Test Open',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32 }],
};

const testPolicy: SanctioningPolicy = {
  ...POLICY_SANCTIONING_GENERIC,
  requireEndorsement: false,
};

function createActivatedRecord() {
  sanctioningEngine.executionQueue([
    {
      method: 'createSanctioningRecord',
      params: {
        governingBodyId: 'gov-001',
        applicant: testApplicant,
        proposal: testProposal,
        sanctioningLevel: 'Level 2',
      },
    },
    { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
    { method: 'activateFromSanctioning', params: { sanctioningPolicy: testPolicy } },
  ]);
}

describe('Post-Event Compliance — Lifecycle', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('transitions to POST_EVENT after activation', () => {
    createActivatedRecord();

    let result: any = sanctioningEngine.transitionToPostEvent({});
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('POST_EVENT');
  });

  it('submits a compliance item', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const resultsItem = record.compliance.items.find((i: any) => i.itemType === 'RESULTS_SUBMISSION');

    let result: any = sanctioningEngine.submitComplianceItem({
      itemId: resultsItem.itemId,
      value: { fileUrl: 'https://results.example.com/test-open-2027' },
    });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    const updated = record.compliance.items.find((i: any) => i.itemId === resultsItem.itemId);
    expect(updated.status).toEqual('SUBMITTED');
    expect(updated.submittedAt).toBeDefined();
    expect(updated.value.fileUrl).toBeDefined();
    expect(record.compliance.status).toEqual('IN_PROGRESS');
  });

  it('verifies a compliance item', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const resultsItem = record.compliance.items.find((i: any) => i.itemType === 'RESULTS_SUBMISSION');

    sanctioningEngine.submitComplianceItem({ itemId: resultsItem.itemId });
    let result: any = sanctioningEngine.verifyComplianceItem({ itemId: resultsItem.itemId });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    const updated = record.compliance.items.find((i: any) => i.itemId === resultsItem.itemId);
    expect(updated.status).toEqual('VERIFIED');
    expect(updated.verifiedAt).toBeDefined();
  });

  it('waives a compliance item with reason', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const financialItem = record.compliance.items.find((i: any) => i.itemType === 'FINANCIAL_RECONCILIATION');

    let result: any = sanctioningEngine.waiveComplianceItem({
      itemId: financialItem.itemId,
      reason: 'No prize money tournament',
    });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    const updated = record.compliance.items.find((i: any) => i.itemId === financialItem.itemId);
    expect(updated.status).toEqual('WAIVED');
    const waiveExt = updated.extensions?.find((e: any) => e.name === 'waiveReason');
    expect(waiveExt?.value).toEqual('No prize money tournament');
  });

  it('becomes COMPLIANT when all required items are verified or waived', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    const requiredItems = record.compliance.items.filter((i: any) => i.required);

    // Verify all required items
    for (const item of requiredItems) {
      sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
      sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });
    }

    result = sanctioningEngine.getSanctioningRecord();
    record = result.sanctioningRecord;
    expect(record.compliance.status).toEqual('COMPLIANT');
  });

  it('closes application after compliance', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const requiredItems = record.compliance.items.filter((i: any) => i.required);
    for (const item of requiredItems) {
      sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
      sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });
    }

    let result: any = sanctioningEngine.closeApplication({ closedBy: 'Admin' });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('CLOSED');
    expect(record.compliance.completedAt).toBeDefined();

    // Terminal — no more transitions
    let transitions: any = sanctioningEngine.getAvailableTransitions();
    expect(transitions.availableTransitions).toHaveLength(0);
  });

  it('flags compliance issues', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let result: any = sanctioningEngine.flagComplianceIssues({
      reason: 'Results not submitted within deadline',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('ISSUES_FLAGGED');

    // Can still close from ISSUES_FLAGGED
    result = sanctioningEngine.closeApplication({ reason: 'Issues resolved' });
    expect(result.success).toBe(true);
    recordResult = sanctioningEngine.getSanctioningRecord();
    expect(recordResult.sanctioningRecord.status).toEqual('CLOSED');
  });

  it('returns error when submitting to non-existent item', () => {
    createActivatedRecord();
    sanctioningEngine.transitionToPostEvent({});

    let result: any = sanctioningEngine.submitComplianceItem({ itemId: 'bogus' });
    expect(result.error).toBeDefined();
  });

  it('returns error when no compliance record exists', () => {
    // Create a record without policy (no compliance generated)
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: testProposal,
    });
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    // Activate without policy — no compliance items
    const recordResult: any = sanctioningEngine.getSanctioningRecord();
    const record = recordResult.sanctioningRecord;
    record.status = 'ACTIVE'; // manual for test
    record.compliance = undefined;
    sanctioningEngine.setSanctioningRecord(record);

    let result: any = sanctioningEngine.submitComplianceItem({ itemId: 'x' });
    expect(result.error?.code).toEqual('ERR_COMPLIANCE_NOT_APPLICABLE');
  });
});

describe('Full Lifecycle — DRAFT to CLOSED', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('runs the complete sanctioning lifecycle via executionQueue', () => {
    let result: any = sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: testProposal,
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: testPolicy } },
      { method: 'transitionToPostEvent', params: {} },
    ]);
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('POST_EVENT');

    // Submit and verify all compliance items
    const requiredItems = record.compliance.items.filter((i: any) => i.required);
    for (const item of requiredItems) {
      sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
      sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });
    }

    sanctioningEngine.closeApplication({});
    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('CLOSED');

    let history: any = sanctioningEngine.getStatusHistory();
    const statuses = history.statusHistory.map((h: any) => h.toStatus);
    expect(statuses).toContain('DRAFT');
    expect(statuses).toContain('SUBMITTED');
    expect(statuses).toContain('UNDER_REVIEW');
    expect(statuses).toContain('APPROVED');
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('POST_EVENT');
    expect(statuses).toContain('CLOSED');
  });
});
