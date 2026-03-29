import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// Types
import type { Applicant, TournamentProposal, SanctioningPolicy, ProposalChange } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Club',
  contactName: 'Jane',
  contactEmail: 'jane@test.com',
};

const testProposal: TournamentProposal = {
  tournamentName: 'Test Open',
  proposedStartDate: '2028-06-01',
  proposedEndDate: '2028-06-07',
  events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32, drawType: 'SINGLE_ELIMINATION' }],
};

const testPolicy: SanctioningPolicy = {
  ...POLICY_SANCTIONING_GENERIC,
  requireEndorsement: false,
};

function createApprovedRecord() {
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
  ]);
}

describe('Amendment Workflow — Propose', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('auto-approves minor amendments on APPROVED records', () => {
    createApprovedRecord();

    const changes: ProposalChange[] = [
      {
        field: 'tournamentName',
        previousValue: 'Test Open',
        proposedValue: 'Test Open 2028',
        changeType: 'MODIFIED',
      },
    ];

    let result: any = sanctioningEngine.proposeAmendment({
      changes,
      sanctioningPolicy: testPolicy,
    });
    expect(result.success).toBe(true);
    expect(result.severity).toEqual('MINOR');
    expect(result.autoApproved).toBe(true);

    // Proposal should be updated
    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.proposal.tournamentName).toEqual('Test Open 2028');
    expect(record.amendments).toHaveLength(1);
    expect(record.amendments[0].status).toEqual('APPROVED');
  });

  it('classifies substantial amendments and does NOT auto-approve', () => {
    createApprovedRecord();

    const changes: ProposalChange[] = [
      {
        field: 'proposedStartDate',
        previousValue: '2028-06-01',
        proposedValue: '2028-07-01',
        changeType: 'MODIFIED',
      },
    ];

    let result: any = sanctioningEngine.proposeAmendment({
      changes,
      sanctioningPolicy: testPolicy,
    });
    expect(result.success).toBe(true);
    expect(result.severity).toEqual('SUBSTANTIAL');
    expect(result.autoApproved).toBe(false);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    // Date should NOT be changed yet
    expect(record.proposal.proposedStartDate).toEqual('2028-06-01');
    expect(record.amendments[0].status).toEqual('PROPOSED');
  });

  it('classifies event-level substantial changes via wildcard pattern', () => {
    createApprovedRecord();

    const changes: ProposalChange[] = [
      {
        field: 'events[0].drawSize',
        previousValue: 32,
        proposedValue: 64,
        changeType: 'MODIFIED',
      },
    ];

    let result: any = sanctioningEngine.proposeAmendment({
      changes,
      sanctioningPolicy: testPolicy,
    });
    expect(result.severity).toEqual('SUBSTANTIAL');
    expect(result.autoApproved).toBe(false);
  });

  it('rejects amendments on non-amendable status', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: testProposal,
    });

    let result: any = sanctioningEngine.proposeAmendment({
      changes: [{ field: 'tournamentName', previousValue: 'x', proposedValue: 'y', changeType: 'MODIFIED' }],
    });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_AMENDMENT_NOT_ALLOWED');
  });

  it('rejects amendments with empty changes', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.proposeAmendment({ changes: [] });
    expect(result.error).toBeDefined();
  });
});

describe('Amendment Workflow — Review', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('approves a substantial amendment and applies changes', () => {
    createApprovedRecord();

    sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'proposedStartDate',
          previousValue: '2028-06-01',
          proposedValue: '2028-07-01',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: testPolicy,
    });

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const amendmentId = record.amendments[0].amendmentId;

    let result: any = sanctioningEngine.reviewAmendment({
      amendmentId,
      approved: true,
      reviewerNotes: 'Date change approved',
    });
    expect(result.success).toBe(true);
    expect(result.approved).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.proposal.proposedStartDate).toEqual('2028-07-01');
    expect(record.amendments[0].status).toEqual('APPROVED');
    expect(record.amendments[0].reviewerNotes).toEqual('Date change approved');
  });

  it('rejects a substantial amendment without applying changes', () => {
    createApprovedRecord();

    sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'proposedEndDate',
          previousValue: '2028-06-07',
          proposedValue: '2028-06-14',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: testPolicy,
    });

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const amendmentId = record.amendments[0].amendmentId;

    let result: any = sanctioningEngine.reviewAmendment({
      amendmentId,
      approved: false,
      reviewerNotes: 'Venue not available for extended dates',
    });
    expect(result.success).toBe(true);
    expect(result.approved).toBe(false);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.proposal.proposedEndDate).toEqual('2028-06-07'); // unchanged
    expect(record.amendments[0].status).toEqual('REJECTED');
  });

  it('returns error for unknown amendmentId', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.reviewAmendment({
      amendmentId: 'bogus',
      approved: true,
    });
    expect(result.error?.code).toEqual('ERR_NOT_FOUND_AMENDMENT');
  });

  it('returns error when reviewing already-resolved amendment', () => {
    createApprovedRecord();

    // Minor amendment auto-approves
    sanctioningEngine.proposeAmendment({
      changes: [{ field: 'tournamentName', previousValue: 'x', proposedValue: 'y', changeType: 'MODIFIED' }],
      sanctioningPolicy: testPolicy,
    });

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const amendmentId = record.amendments[0].amendmentId;

    let result: any = sanctioningEngine.reviewAmendment({ amendmentId, approved: true });
    expect(result.error).toBeDefined();
  });
});

describe('Amendment Workflow — Multiple Amendments', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('tracks multiple amendments on a single record', () => {
    createApprovedRecord();

    // Minor — auto-approved
    sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'tournamentName',
          previousValue: 'Test Open',
          proposedValue: 'Test Open Revised',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: testPolicy,
    });

    // Substantial — needs review
    sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'events[0].drawType',
          previousValue: 'SINGLE_ELIMINATION',
          proposedValue: 'ROUND_ROBIN',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: testPolicy,
    });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    expect(record.amendments).toHaveLength(2);
    expect(record.amendments[0].status).toEqual('APPROVED');
    expect(record.amendments[1].status).toEqual('PROPOSED');
    expect(record.proposal.tournamentName).toEqual('Test Open Revised');
  });
});
