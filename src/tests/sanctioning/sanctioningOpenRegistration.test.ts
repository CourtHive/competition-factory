import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

import type { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const testProposal: TournamentProposal = {
  tournamentName: 'Test Open 2027',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  events: [{ eventName: "Men's Singles", eventType: 'SINGLES', gender: 'MALE' }],
};

const testPolicy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };

function approve() {
  sanctioningEngine.executionQueue([
    {
      method: 'createSanctioningRecord',
      params: {
        governingBodyId: 'gov-001',
        applicant: testApplicant,
        proposal: testProposal,
        sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
      },
    },
    { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
  ]);
}

describe('openProposalRegistration', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('assigns a tournamentId and opens registration on an approved proposal', () => {
    approve();
    let result: any = sanctioningEngine.openProposalRegistration({});
    expect(result.success).toBe(true);
    expect(result.tournamentId).toBeDefined();
    expect(result.registrationProfile.entriesOpen).toBeDefined();

    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    expect(record.proposal.tournamentId).toEqual(result.tournamentId);
    expect(record.proposal.registrationProfile.entriesOpen).toBeDefined();
  });

  it('reuses a supplied tournamentId', () => {
    approve();
    let result: any = sanctioningEngine.openProposalRegistration({ tournamentId: 'given-tid-1' });
    expect(result.tournamentId).toEqual('given-tid-1');
  });

  it('merges a supplied registrationProfile and keeps entriesOpen', () => {
    approve();
    let result: any = sanctioningEngine.openProposalRegistration({
      registrationProfile: { entriesClose: '2027-05-01', entryMethod: 'online' },
    });
    expect(result.registrationProfile.entriesClose).toEqual('2027-05-01');
    expect(result.registrationProfile.entryMethod).toEqual('online');
    expect(result.registrationProfile.entriesOpen).toBeDefined();
  });

  it('rejects opening registration from a terminal status', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: { governingBodyId: 'gov-001', applicant: testApplicant, proposal: testProposal },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'rejectApplication', params: { reason: 'incomplete' } },
    ]);
    let result: any = sanctioningEngine.openProposalRegistration({});
    expect(result.error).toBeDefined();
  });

  it('the tournamentId opened before activation is the id activation materializes', () => {
    approve();
    let opened: any = sanctioningEngine.openProposalRegistration({});
    const openedTid = opened.tournamentId;

    let activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(activation.success).toBe(true);
    expect(activation.tournamentRecord.tournamentId).toEqual(openedTid);
  });

  it('assigns a stable eventId to each proposed event (idempotent across re-open)', () => {
    approve();
    sanctioningEngine.openProposalRegistration({});
    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    const events = record.proposal.events;
    expect(events.every((e: any) => typeof e.eventId === 'string' && e.eventId.length > 0)).toBe(true);
    const firstIds = events.map((e: any) => e.eventId);

    // Re-opening/adjusting registration must not mint fresh eventIds.
    sanctioningEngine.openProposalRegistration({ registrationProfile: { entryMethod: 'online' } });
    let reopened: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    expect(reopened.proposal.events.map((e: any) => e.eventId)).toEqual(firstIds);
  });

  it('activation reuses the eventIds assigned at open-registration (id-join, not name-join)', () => {
    approve();
    sanctioningEngine.openProposalRegistration({});
    let record: any = sanctioningEngine.getSanctioningRecord().sanctioningRecord;
    const openedEventIds = record.proposal.events.map((e: any) => e.eventId);

    let activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(activation.success).toBe(true);
    expect(activation.tournamentRecord.events.map((e: any) => e.eventId)).toEqual(openedEventIds);
  });
});
