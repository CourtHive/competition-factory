import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Types
import type { Applicant, EventProposal, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const testEventProposal: EventProposal = {
  eventName: "Men's Singles",
  eventType: 'SINGLES',
  gender: 'MALE',
  drawSize: 32,
};

const testProposal: TournamentProposal = {
  tournamentName: 'Test Open 2026',
  proposedStartDate: '2026-06-01',
  proposedEndDate: '2026-06-07',
  events: [testEventProposal],
};

const testPolicy: SanctioningPolicy = {
  policyName: 'Test Policy',
  policyVersion: '2026.1',
  effectiveDate: '2026-01-01',
  governingBodyId: 'gov-001',
  tiers: [],
  requireEndorsement: false,
};

const endorsementRequiredPolicy: SanctioningPolicy = {
  ...testPolicy,
  requireEndorsement: true,
};

function createAndGetRecord() {
  sanctioningEngine.createSanctioningRecord({
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    proposal: testProposal,
  });
  let result: any = sanctioningEngine.getSanctioningRecord();
  return result.sanctioningRecord;
}

describe('Sanctioning Workflow — Submit → Review → Approve', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('follows the happy path: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED', () => {
    createAndGetRecord();

    let result: any = sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('SUBMITTED');
    expect(record.submittedAt).toBeDefined();
    expect(record.policyVersion).toEqual('2026.1');
    expect(record.policySnapshot).toBeDefined();
    expect(record.policySnapshot.policyName).toEqual('Test Policy');

    result = sanctioningEngine.reviewApplication({
      reviewer: { reviewerId: 'rev-001', reviewerName: 'John Reviewer' },
    });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('UNDER_REVIEW');
    expect(record.reviewer?.reviewerName).toEqual('John Reviewer');

    result = sanctioningEngine.approveApplication({ approvedBy: 'John Reviewer' });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('APPROVED');
    expect(record.approvedAt).toBeDefined();
  });

  it('tracks status history through transitions', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    let result: any = sanctioningEngine.getStatusHistory();
    expect(result.success).toBe(true);
    // creation + submit + review + approve = 4 transitions
    expect(result.statusHistory.length).toBeGreaterThanOrEqual(4);
    expect(result.statusHistory.at(-1).toStatus).toEqual('APPROVED');
  });
});

describe('Sanctioning Workflow — Rejection', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('follows DRAFT → SUBMITTED → UNDER_REVIEW → REJECTED', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});

    let result: any = sanctioningEngine.rejectApplication({ reason: 'Insufficient facilities' });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('REJECTED');

    // No further transitions from REJECTED
    let transitions: any = sanctioningEngine.getAvailableTransitions();
    expect(transitions.availableTransitions).toHaveLength(0);
  });
});

describe('Sanctioning Workflow — Withdrawal', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('allows withdrawal from DRAFT', () => {
    createAndGetRecord();
    let result: any = sanctioningEngine.withdrawApplication({ reason: 'Changed plans' });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('WITHDRAWN');
  });

  it('allows withdrawal from SUBMITTED', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });

    let result: any = sanctioningEngine.withdrawApplication({});
    expect(result.success).toBe(true);
  });

  it('allows withdrawal from APPROVED', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    let result: any = sanctioningEngine.withdrawApplication({});
    expect(result.success).toBe(true);
  });
});

describe('Sanctioning Workflow — Modification Request', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('supports modification cycle: UNDER_REVIEW → MOD_REQUESTED → SUBMITTED → UNDER_REVIEW → APPROVED', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});

    let result: any = sanctioningEngine.requestModification({
      requestedBy: 'Reviewer',
      note: 'Please increase draw size to 64',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('MODIFICATION_REQUESTED');
    expect(record.reviewNotes).toHaveLength(1);
    expect(record.reviewNotes[0].note).toEqual('Please increase draw size to 64');

    // Applicant modifies and resubmits
    sanctioningEngine.updateProposal({ updates: { tournamentName: 'Updated Open' } });
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('SUBMITTED');

    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('APPROVED');
  });
});

describe('Sanctioning Workflow — Conditional Approval', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('conditionally approves with conditions, then meets them to approve', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});

    let result: any = sanctioningEngine.conditionallyApprove({
      conditions: [{ description: 'Submit insurance certificate' }, { description: 'Confirm medical plan' }],
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('CONDITIONALLY_APPROVED');
    expect(record.conditions).toHaveLength(2);

    const cond1Id = record.conditions[0].conditionId;
    const cond2Id = record.conditions[1].conditionId;

    // Meet first condition
    result = sanctioningEngine.meetCondition({ conditionId: cond1Id, metNotes: 'Insurance uploaded' });
    expect(result.success).toBe(true);
    expect(result.allConditionsMet).toBe(false);

    // Meet second condition
    result = sanctioningEngine.meetCondition({ conditionId: cond2Id });
    expect(result.success).toBe(true);
    expect(result.allConditionsMet).toBe(true);

    // Now approve
    result = sanctioningEngine.approveApplication({});
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('APPROVED');
  });

  it('rejects conditional approval without conditions', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});

    let result: any = sanctioningEngine.conditionallyApprove({ conditions: [] });
    expect(result.error).toBeDefined();
  });

  it('returns error for unknown condition id', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.conditionallyApprove({ conditions: [{ description: 'Something' }] });

    let result: any = sanctioningEngine.meetCondition({ conditionId: 'bogus' });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_NOT_FOUND_CONDITION');
  });
});

describe('Sanctioning Workflow — Endorsement', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('endorsement flow: request → endorse → submit', () => {
    createAndGetRecord();

    let result: any = sanctioningEngine.requestEndorsement({
      endorserId: 'usta-001',
      endorserName: 'USTA Section 5',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('PENDING');

    result = sanctioningEngine.endorseApplication({
      endorserNotes: 'Facilities verified',
      conditions: ['Must use approved software'],
    });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('ENDORSED');
    expect(record.endorsement.endorsedAt).toBeDefined();
    expect(record.endorsement.conditions).toHaveLength(1);

    // Submit should now succeed even with endorsement-required policy
    result = sanctioningEngine.submitApplication({ sanctioningPolicy: endorsementRequiredPolicy });
    expect(result.success).toBe(true);
  });

  it('blocks submission when endorsement required but not endorsed', () => {
    createAndGetRecord();

    let result: any = sanctioningEngine.submitApplication({ sanctioningPolicy: endorsementRequiredPolicy });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_ENDORSEMENT_REQUIRED');
  });

  it('allows submission without endorsement when policy does not require it', () => {
    createAndGetRecord();

    let result: any = sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    expect(result.success).toBe(true);
  });

  it('declines endorsement', () => {
    createAndGetRecord();
    sanctioningEngine.requestEndorsement({ endorserId: 'usta-001' });

    let result: any = sanctioningEngine.declineEndorsement({ declineReason: 'Inadequate venue' });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('DECLINED');
    expect(record.endorsement.declineReason).toEqual('Inadequate venue');
  });

  it('returns error when endorsing without prior request', () => {
    createAndGetRecord();

    let result: any = sanctioningEngine.endorseApplication({});
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_MISSING_ENDORSEMENT');
  });
});

describe('Sanctioning Workflow — Review Notes', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('adds review notes', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});

    let result: any = sanctioningEngine.addReviewNote({
      note: 'Facilities look good',
      reviewerName: 'Jane',
    });
    expect(result.success).toBe(true);
    expect(result.noteId).toBeDefined();

    result = sanctioningEngine.addReviewNote({
      note: 'Prize money confirmed',
      reviewerId: 'rev-001',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.reviewNotes).toHaveLength(2);
  });

  it('rejects empty note', () => {
    createAndGetRecord();
    let result: any = sanctioningEngine.addReviewNote({ note: '' });
    expect(result.error).toBeDefined();
  });
});

describe('Sanctioning Workflow — Invalid Transitions', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('cannot approve from DRAFT', () => {
    createAndGetRecord();
    let result: any = sanctioningEngine.approveApplication({});
    expect(result.error).toBeDefined();
  });

  it('cannot review from DRAFT (must submit first)', () => {
    createAndGetRecord();
    let result: any = sanctioningEngine.reviewApplication({});
    expect(result.error).toBeDefined();
  });

  it('cannot submit from APPROVED', () => {
    createAndGetRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    let result: any = sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    expect(result.error).toBeDefined();
  });

  it('cannot reject from DRAFT', () => {
    createAndGetRecord();
    let result: any = sanctioningEngine.rejectApplication({});
    expect(result.error).toBeDefined();
  });
});

describe('Sanctioning Workflow — executionQueue full workflow', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('runs full workflow via executionQueue', () => {
    let result: any = sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: testProposal,
        },
      },
      {
        method: 'submitApplication',
        params: { sanctioningPolicy: testPolicy },
      },
      {
        method: 'reviewApplication',
        params: { reviewer: { reviewerId: 'rev-1' } },
      },
      {
        method: 'approveApplication',
        params: { approvedBy: 'rev-1' },
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(4);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('APPROVED');
  });
});
