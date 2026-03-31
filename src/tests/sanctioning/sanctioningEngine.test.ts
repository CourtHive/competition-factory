import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { DRAFT, SUBMITTED, WITHDRAWN } from '@Constants/sanctioningConstants';

// Types
import type { EventProposal, TournamentProposal, Applicant } from '@Types/sanctioningTypes';

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
  drawType: 'SINGLE_ELIMINATION',
};

const testProposal: TournamentProposal = {
  tournamentName: 'Test Open 2026',
  proposedStartDate: '2026-06-01',
  proposedEndDate: '2026-06-07',
  hostCountryCode: 'USA',
  surfaceCategory: 'HARD',
  indoorOutdoor: 'OUTDOOR',
  events: [testEventProposal],
};

function createTestRecord(overrides?: any) {
  return sanctioningEngine.createSanctioningRecord({
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    proposal: testProposal,
    sanctioningLevel: 'W50',
    ...overrides,
  });
}

describe('Sanctioning Engine — State Management', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('starts with empty state', () => {
    let result: any = sanctioningEngine.getState();
    expect(result.success).toBe(true);
    expect(Object.keys(result.sanctioningRecords)).toHaveLength(0);
  });

  it('reset clears all records', () => {
    createTestRecord();
    sanctioningEngine.reset();
    let result: any = sanctioningEngine.getState();
    expect(Object.keys(result.sanctioningRecords)).toHaveLength(0);
  });

  it('setState loads records and auto-selects single record', () => {
    let result: any = createTestRecord();
    const { sanctioningRecord } = result;
    sanctioningEngine.reset();

    sanctioningEngine.setState({ [sanctioningRecord.sanctioningId]: sanctioningRecord });
    expect(sanctioningEngine.getActiveSanctioningId()).toEqual(sanctioningRecord.sanctioningId);
  });

  it('removeSanctioningRecord removes by id', () => {
    let result: any = createTestRecord();
    const { sanctioningRecord } = result;
    result = sanctioningEngine.removeSanctioningRecord(sanctioningRecord.sanctioningId);
    expect(result.success).toBe(true);
    let stateResult: any = sanctioningEngine.getState();
    expect(Object.keys(stateResult.sanctioningRecords)).toHaveLength(0);
  });

  it('removeSanctioningRecord returns error for unknown id', () => {
    let result: any = sanctioningEngine.removeSanctioningRecord('nonexistent');
    expect(result.error).toBeDefined();
  });
});

describe('Sanctioning Engine — createSanctioningRecord', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('creates a valid sanctioning record in DRAFT status', () => {
    let result: any = createTestRecord();
    expect(result.success).toBe(true);
    expect(result.sanctioningRecord).toBeDefined();
    expect(result.sanctioningRecord.status).toEqual(DRAFT);
    expect(result.sanctioningRecord.version).toEqual(1);
    expect(result.sanctioningRecord.governingBodyId).toEqual('gov-001');
    expect(result.sanctioningRecord.sanctioningLevel).toEqual('W50');
    expect(result.sanctioningRecord.proposal.tournamentName).toEqual('Test Open 2026');
    expect(result.sanctioningRecord.proposal.events).toHaveLength(1);
    expect(result.sanctioningRecord.proposal.events[0].eventProposalId).toBeDefined();
    expect(result.sanctioningRecord.statusHistory).toHaveLength(1);
  });

  it('assigns a UUID if sanctioningId not provided', () => {
    let result: any = createTestRecord();
    expect(result.sanctioningRecord.sanctioningId).toBeDefined();
    expect(result.sanctioningRecord.sanctioningId.length).toBeGreaterThan(0);
  });

  it('uses provided sanctioningId', () => {
    let result: any = createTestRecord({ sanctioningId: 'custom-id-123' });
    expect(result.sanctioningRecord.sanctioningId).toEqual('custom-id-123');
  });

  it('rejects duplicate sanctioningId', () => {
    createTestRecord({ sanctioningId: 'dup-id' });
    let result: any = createTestRecord({ sanctioningId: 'dup-id' });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_EXISTING_SANCTIONING_RECORD');
  });

  it('requires governingBodyId', () => {
    let result: any = sanctioningEngine.createSanctioningRecord({
      applicant: testApplicant,
      proposal: testProposal,
    } as any);
    expect(result.error).toBeDefined();
  });

  it('requires applicant', () => {
    let result: any = sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      proposal: testProposal,
    } as any);
    expect(result.error).toBeDefined();
  });

  it('requires proposal', () => {
    let result: any = sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
    } as any);
    expect(result.error).toBeDefined();
  });

  it('requires proposal.tournamentName', () => {
    let result: any = sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: { ...testProposal, tournamentName: '' },
    });
    expect(result.error).toBeDefined();
  });

  it('requires at least one event in proposal', () => {
    let result: any = sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: { ...testProposal, events: [] },
    });
    expect(result.error).toBeDefined();
  });

  it('sets the created record as active', () => {
    let result: any = createTestRecord();
    expect(sanctioningEngine.getActiveSanctioningId()).toEqual(result.sanctioningRecord.sanctioningId);
  });
});

describe('Sanctioning Engine — updateProposal', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('updates proposal fields on DRAFT record', () => {
    createTestRecord();
    let result: any = sanctioningEngine.updateProposal({
      updates: { tournamentName: 'Updated Open 2026', surfaceCategory: 'CLAY' },
    });
    expect(result.success).toBe(true);

    let getResult: any = sanctioningEngine.getSanctioningRecord();
    expect(getResult.sanctioningRecord.proposal.tournamentName).toEqual('Updated Open 2026');
    expect(getResult.sanctioningRecord.proposal.surfaceCategory).toEqual('CLAY');
    expect(getResult.sanctioningRecord.version).toEqual(2);
  });

  it('does not overwrite events array via updateProposal', () => {
    createTestRecord();
    sanctioningEngine.updateProposal({
      updates: { events: [] as any },
    });
    let getResult: any = sanctioningEngine.getSanctioningRecord();
    expect(getResult.sanctioningRecord.proposal.events).toHaveLength(1);
  });

  it('rejects updates on non-editable status', () => {
    let result: any = createTestRecord();
    // Manually set status to SUBMITTED to test guard
    const record = result.sanctioningRecord;
    record.status = 'SUBMITTED';
    sanctioningEngine.setSanctioningRecord(record);

    result = sanctioningEngine.updateProposal({
      updates: { tournamentName: 'Should Fail' },
    });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_PROPOSAL_NOT_EDITABLE');
  });

  it('rejects missing updates', () => {
    createTestRecord();
    let result: any = sanctioningEngine.updateProposal({});
    expect(result.error).toBeDefined();
  });
});

describe('Sanctioning Engine — Event Proposal CRUD', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('adds an event proposal', () => {
    createTestRecord();
    let result: any = sanctioningEngine.addEventProposal({
      eventProposal: {
        eventName: "Women's Singles",
        eventType: 'SINGLES',
        gender: 'FEMALE',
        drawSize: 32,
      },
    });
    expect(result.success).toBe(true);
    expect(result.eventProposalId).toBeDefined();

    let getResult: any = sanctioningEngine.getSanctioningRecord();
    expect(getResult.sanctioningRecord.proposal.events).toHaveLength(2);
  });

  it('removes an event proposal by id', () => {
    createTestRecord();
    let getResult: any = sanctioningEngine.getSanctioningRecord();
    const eventId = getResult.sanctioningRecord.proposal.events[0].eventProposalId;

    let result: any = sanctioningEngine.removeEventProposal({ eventProposalId: eventId });
    expect(result.success).toBe(true);

    getResult = sanctioningEngine.getSanctioningRecord();
    expect(getResult.sanctioningRecord.proposal.events).toHaveLength(0);
  });

  it('returns error when removing nonexistent event proposal', () => {
    createTestRecord();
    let result: any = sanctioningEngine.removeEventProposal({ eventProposalId: 'bogus' });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_NOT_FOUND_EVENT_PROPOSAL');
  });

  it('updates an event proposal', () => {
    createTestRecord();
    let getResult: any = sanctioningEngine.getSanctioningRecord();
    const eventId = getResult.sanctioningRecord.proposal.events[0].eventProposalId;

    let result: any = sanctioningEngine.updateEventProposal({
      eventProposalId: eventId,
      updates: { drawSize: 64, matchUpFormat: 'SET3-S:6/TB7' },
    });
    expect(result.success).toBe(true);

    getResult = sanctioningEngine.getSanctioningRecord();
    const event = getResult.sanctioningRecord.proposal.events[0];
    expect(event.drawSize).toEqual(64);
    expect(event.matchUpFormat).toEqual('SET3-S:6/TB7');
    expect(event.eventProposalId).toEqual(eventId);
  });

  it('rejects event proposal mutations on non-editable record', () => {
    let result: any = createTestRecord();
    const record = result.sanctioningRecord;
    record.status = 'APPROVED';
    sanctioningEngine.setSanctioningRecord(record);

    result = sanctioningEngine.addEventProposal({
      eventProposal: { eventName: 'Fail', eventType: 'SINGLES' },
    });
    expect(result.error?.code).toEqual('ERR_PROPOSAL_NOT_EDITABLE');

    const eventId = record.proposal.events[0].eventProposalId;
    result = sanctioningEngine.removeEventProposal({ eventProposalId: eventId });
    expect(result.error?.code).toEqual('ERR_PROPOSAL_NOT_EDITABLE');

    result = sanctioningEngine.updateEventProposal({
      eventProposalId: eventId,
      updates: { drawSize: 16 },
    });
    expect(result.error?.code).toEqual('ERR_PROPOSAL_NOT_EDITABLE');
  });
});

describe('Sanctioning Engine — Queries', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('getSanctioningRecord returns deep copy', () => {
    createTestRecord();
    let result: any = sanctioningEngine.getSanctioningRecord();
    expect(result.success).toBe(true);
    expect(result.sanctioningRecord).toBeDefined();

    // Mutating the returned copy should not affect state
    result.sanctioningRecord.proposal.tournamentName = 'MUTATED';
    let fresh: any = sanctioningEngine.getSanctioningRecord();
    expect(fresh.sanctioningRecord.proposal.tournamentName).toEqual('Test Open 2026');
  });

  it('getSanctioningRecord returns error when no record', () => {
    let result: any = sanctioningEngine.getSanctioningRecord();
    expect(result.error).toBeDefined();
  });

  it('getAvailableTransitions returns valid transitions for DRAFT', () => {
    createTestRecord();
    let result: any = sanctioningEngine.getAvailableTransitions();
    expect(result.success).toBe(true);
    expect(result.availableTransitions).toContain(SUBMITTED);
    expect(result.availableTransitions).toContain(WITHDRAWN);
    expect(result.availableTransitions).toHaveLength(2);
  });
});

describe('Sanctioning Engine — executionQueue', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('executes a batch of directives', () => {
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
        method: 'addEventProposal',
        params: {
          eventProposal: {
            eventName: "Women's Doubles",
            eventType: 'DOUBLES',
            gender: 'FEMALE',
          },
        },
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);

    let getResult: any = sanctioningEngine.getSanctioningRecord();
    expect(getResult.sanctioningRecord.proposal.events).toHaveLength(2);
  });

  it('pipes values between directives', () => {
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
        method: 'getSanctioningRecord',
        pipe: { sanctioningId: true },
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.results[1].sanctioningRecord).toBeDefined();
  });

  it('rolls back on error when rollbackOnError is true', () => {
    createTestRecord({ sanctioningId: 'rollback-test' });

    let result: any = sanctioningEngine.executionQueue(
      [
        {
          method: 'updateProposal',
          params: {
            sanctioningId: 'rollback-test',
            updates: { tournamentName: 'About to Fail' },
          },
        },
        {
          method: 'removeEventProposal',
          params: { sanctioningId: 'rollback-test', eventProposalId: 'nonexistent' },
        },
      ],
      true,
    );
    expect(result.error).toBeDefined();
    expect(result.rolledBack).toBe(true);

    // Name should NOT have changed because of rollback
    let getResult: any = sanctioningEngine.getSanctioningRecord({ sanctioningId: 'rollback-test' });
    expect(getResult.sanctioningRecord.proposal.tournamentName).toEqual('Test Open 2026');
  });

  it('does not roll back by default', () => {
    createTestRecord({ sanctioningId: 'no-rollback' });

    sanctioningEngine.executionQueue([
      {
        method: 'updateProposal',
        params: {
          sanctioningId: 'no-rollback',
          updates: { tournamentName: 'Changed Before Fail' },
        },
      },
      {
        method: 'removeEventProposal',
        params: { sanctioningId: 'no-rollback', eventProposalId: 'nonexistent' },
      },
    ]);

    // Name SHOULD have changed because no rollback
    let getResult: any = sanctioningEngine.getSanctioningRecord({ sanctioningId: 'no-rollback' });
    expect(getResult.sanctioningRecord.proposal.tournamentName).toEqual('Changed Before Fail');
  });

  it('returns error for unknown method', () => {
    let result: any = sanctioningEngine.executionQueue([{ method: 'nonExistentMethod', params: {} }]);
    expect(result.error).toBeDefined();
  });

  it('rejects non-array directives', () => {
    let result: any = sanctioningEngine.executionQueue('bad' as any);
    expect(result.error).toBeDefined();
  });
});
