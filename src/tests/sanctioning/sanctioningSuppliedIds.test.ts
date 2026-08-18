import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// constants
import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';

// Types
import { Applicant, EventProposal, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

/**
 * Caller-supplied entity ids must be honoured, never overwritten by an
 * engine-minted UUID.
 *
 * This is not a cosmetic API nicety. A site server mirrors `{ method, params }`
 * upstream (see `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md`), so a
 * mutation that mints its id engine-side produces a DIFFERENT id on the cloud
 * than it did locally, and every later mirrored mutation that references that id
 * fails to resolve upstream. Identity has to be minted once, at the origin, and
 * travel in `params`.
 *
 * Each test asserts the supplied id is used AND that the mint path still works
 * when nothing is supplied — a one-directional test would pass against an
 * implementation that ignored the parameter entirely.
 */

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

function createRecord() {
  sanctioningEngine.createSanctioningRecord({
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    proposal: testProposal,
  });
}

function getRecord(): any {
  const result: any = sanctioningEngine.getSanctioningRecord();
  return result.sanctioningRecord;
}

function toUnderReview() {
  createRecord();
  sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
  sanctioningEngine.reviewApplication({});
}

describe('addReviewNote — supplied noteId', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('uses the supplied noteId', () => {
    createRecord();
    const result: any = sanctioningEngine.addReviewNote({ note: 'Needs a floor plan', noteId: 'note-supplied-1' });

    expect(result.success).toBe(true);
    expect(result.noteId).toEqual('note-supplied-1');
    expect(getRecord().reviewNotes.at(-1).noteId).toEqual('note-supplied-1');
  });

  it('still mints a noteId when none is supplied', () => {
    createRecord();
    const result: any = sanctioningEngine.addReviewNote({ note: 'No id given' });

    expect(result.success).toBe(true);
    expect(typeof result.noteId).toEqual('string');
    expect(result.noteId.length).toBeGreaterThan(0);
  });

  it('keeps supplied ids distinct across notes', () => {
    createRecord();
    sanctioningEngine.addReviewNote({ note: 'first', noteId: 'note-a' });
    sanctioningEngine.addReviewNote({ note: 'second', noteId: 'note-b' });

    expect(getRecord().reviewNotes.map((n: any) => n.noteId)).toEqual(['note-a', 'note-b']);
  });
});

describe('requestModification — supplied noteId', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('uses the supplied noteId for the attached review note', () => {
    toUnderReview();
    const result: any = sanctioningEngine.requestModification({
      note: 'Please resubmit with venue detail',
      noteId: 'note-mod-1',
    });

    expect(result.success).toBe(true);
    expect(getRecord().reviewNotes.at(-1).noteId).toEqual('note-mod-1');
  });

  it('still mints a noteId when none is supplied', () => {
    toUnderReview();
    sanctioningEngine.requestModification({ note: 'Please resubmit' });

    const note = getRecord().reviewNotes.at(-1);
    expect(typeof note.noteId).toEqual('string');
    expect(note.noteId.length).toBeGreaterThan(0);
  });
});

describe('conditionallyApprove — supplied conditionId', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('uses the supplied conditionId per condition', () => {
    toUnderReview();
    const result: any = sanctioningEngine.conditionallyApprove({
      conditions: [
        { description: 'Provide insurance certificate', conditionId: 'cond-a' },
        { description: 'Confirm court count', conditionId: 'cond-b' },
      ],
    });

    expect(result.success).toBe(true);
    expect(getRecord().conditions.map((c: any) => c.conditionId)).toEqual(['cond-a', 'cond-b']);
  });

  it('mints only for the conditions that omit an id, preserving order', () => {
    toUnderReview();
    sanctioningEngine.conditionallyApprove({
      conditions: [{ description: 'supplied', conditionId: 'cond-only' }, { description: 'minted' }],
    });

    const conditions = getRecord().conditions;
    expect(conditions[0].conditionId).toEqual('cond-only');
    expect(conditions[1].conditionId).not.toEqual('cond-only');
    expect(conditions[1].conditionId.length).toBeGreaterThan(0);
    // Ids must not be transposed onto the wrong description.
    expect(conditions[0].description).toEqual('supplied');
    expect(conditions[1].description).toEqual('minted');
  });
});

describe('proposeAmendment — supplied amendmentId', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('uses the supplied amendmentId', () => {
    toUnderReview();
    sanctioningEngine.approveApplication({});

    const result: any = sanctioningEngine.proposeAmendment({
      changes: [{ field: 'tournamentName', from: 'Test Open 2026', to: 'Test Open 2026 (Revised)' }],
      amendmentId: 'amend-supplied-1',
    });

    expect(result.error).toBeUndefined();
    expect(getRecord().amendments.at(-1).amendmentId).toEqual('amend-supplied-1');
  });

  it('still mints an amendmentId when none is supplied', () => {
    toUnderReview();
    sanctioningEngine.approveApplication({});

    sanctioningEngine.proposeAmendment({
      changes: [{ field: 'tournamentName', from: 'Test Open 2026', to: 'Test Open 2026 (Revised)' }],
    });

    const amendment = getRecord().amendments.at(-1);
    expect(typeof amendment.amendmentId).toEqual('string');
    expect(amendment.amendmentId.length).toBeGreaterThan(0);
  });
});

describe('activateFromSanctioning — supplied compliance item ids', () => {
  const compliancePolicy: SanctioningPolicy = {
    ...testPolicy,
    postEventRequirements: [
      { itemType: 'RESULTS', description: 'Submit results', required: true, deadlineDays: 7 },
      { itemType: 'FINANCIAL', description: 'Submit levy', required: true, deadlineDays: 30 },
    ],
  } as SanctioningPolicy;

  beforeEach(() => sanctioningEngine.reset());

  function approveWithCompliancePolicy() {
    createRecord();
    sanctioningEngine.submitApplication({ sanctioningPolicy: compliancePolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});
  }

  it('consumes supplied ids from the uuids pool', () => {
    approveWithCompliancePolicy();
    const result: any = sanctioningEngine.activateFromSanctioning({ uuids: ['item-a', 'item-b'] });

    expect(result.error).toBeUndefined();
    const itemIds = getRecord().compliance.items.map((i: any) => i.itemId);
    expect(itemIds).toHaveLength(2);
    // `.pop()` consumes from the end, so both supplied ids are used and neither
    // is a minted UUID.
    expect(itemIds.toSorted((a: string, b: string) => a.localeCompare(b))).toEqual(['item-a', 'item-b']);
  });

  it('mints ids when no pool is supplied', () => {
    approveWithCompliancePolicy();
    const result: any = sanctioningEngine.activateFromSanctioning({});

    expect(result.error).toBeUndefined();
    const items = getRecord().compliance.items;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(typeof item.itemId).toEqual('string');
      expect(item.itemId.length).toBeGreaterThan(0);
    }
  });

  it('REJECTS a short pool rather than minting the shortfall', () => {
    // Strict when supplied. A pool that runs short means this replay needed a
    // different number of ids than the origin did — i.e. the two instances'
    // states have diverged. Minting the difference would convert a detectable
    // divergence into a silent, permanent id mismatch, so it is an error.
    // (An earlier revision of this test asserted the opposite, lenient
    // behaviour; that was wrong for replay and was changed deliberately.)
    approveWithCompliancePolicy();
    const result: any = sanctioningEngine.activateFromSanctioning({ uuids: ['only-one'] });

    expect(result.error).toEqual(INSUFFICIENT_UUIDS);
    expect(result.context).toEqual({ required: 2, supplied: 1 });
  });

  it('accepts a pool larger than needed', () => {
    // Over-supply is not a divergence signal — the origin may batch ids
    // generously. Only a SHORT pool indicates the counts disagreed.
    approveWithCompliancePolicy();
    const result: any = sanctioningEngine.activateFromSanctioning({ uuids: ['a', 'b', 'c', 'd'] });

    expect(result.error).toBeUndefined();
    expect(getRecord().compliance.items).toHaveLength(2);
  });
});
