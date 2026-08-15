import {
  POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF,
  POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
} from '@Fixtures/policies/POLICY_OFFICIATING_CONFLICT_OF_INTEREST';
import { removeConflictDeclaration } from '@Mutate/officiating/removeConflictDeclaration';
import { addConflictDeclaration } from '@Mutate/officiating/addConflictDeclaration';
import { getOfficialConflicts } from '@Query/officiating/getOfficialConflicts';
import { assignOfficial } from '@Mutate/officiating/assignOfficial';
import { describe, expect, it } from 'vitest';

// Constants
import {
  CONFLICT_DECLARATION_NOT_FOUND,
  OFFICIAL_CONFLICT_OF_INTEREST,
  MISSING_CONFLICT_PARTICIPANTS,
  CONFLICT_DECLARED_RELATIONSHIP,
  CONFLICT_SHARED_GROUPING,
  MISSING_CONFLICT_SOURCE,
  MISSING_OFFICIAL_RECORD,
  CONFLICT_ORGANISATION,
  CONFLICT_NATIONALITY,
  CONFLICT_SAME_PERSON,
  CONFLICT_BLOCK,
  CONFLICT_WARN,
} from '@Constants/officiatingConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

import type { OfficialRecord } from '@Types/officiatingTypes';
import type { Participant } from '@Types/tournamentTypes';

const OFFICIAL_PERSON_ID = 'person-official';

function makeRecord(overrides?: Partial<OfficialRecord>): OfficialRecord {
  return {
    officialRecordId: 'rec-001',
    personId: OFFICIAL_PERSON_ID,
    certifications: [],
    evaluations: [],
    assignments: [],
    suspensions: [],
    certificationRequirements: [],
    evaluationPolicies: [],
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

function makeParticipant(overrides?: Partial<Participant>): Participant {
  return {
    participantId: 'par-001',
    participantName: 'Player One',
    person: { personId: 'person-001', nationalityCode: 'FRA' } as any,
    ...overrides,
  } as Participant;
}

/** A policy with every rule enabled, so a test can isolate one rule by the
 *  participants it supplies rather than by the policy. */
const ALL_RULES_BLOCK = {
  [POLICY_TYPE_OFFICIATING_CONFLICT]: {
    policyName: 'TEST',
    conflictRules: {
      [CONFLICT_SAME_PERSON]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_DECLARED_RELATIONSHIP]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_NATIONALITY]: { enabled: true, severity: CONFLICT_BLOCK },
      [CONFLICT_ORGANISATION]: { enabled: true, severity: CONFLICT_BLOCK },
    },
  },
};

// ---------------------------------------------------------------------------
// getOfficialConflicts
// ---------------------------------------------------------------------------
describe('getOfficialConflicts', () => {
  it('returns error when NEITHER declaration source is supplied', () => {
    // officialRecord is optional since SHARED_GROUPING: an officialParticipantId (tournament GROUP
    // membership) is an equally valid source. Supplying neither is still an error.
    let result: any = getOfficialConflicts({ officialRecord: undefined as any });
    expect(result.error).toEqual(MISSING_CONFLICT_SOURCE);
  });

  it('accepts an officialParticipantId with NO officialRecord', () => {
    let result: any = getOfficialConflicts({
      officialParticipantId: 'par-official',
      participants: [makeParticipant()],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
      groupParticipants: [],
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('is inert when no conflict policy is supplied', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant({ person: { personId: OFFICIAL_PERSON_ID } as any })],
    });
    expect(result.success).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('errors rather than reporting "no conflicts" when a policy is supplied with no participants', () => {
    // "nothing was checked" must not be indistinguishable from "nothing found".
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.error).toEqual(MISSING_CONFLICT_PARTICIPANTS);
    expect(result.conflicts).toBeUndefined();
  });

  it('detects SAME_PERSON when the official is entered in the tournament', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant({ person: { personId: OFFICIAL_PERSON_ID } as any })],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_SAME_PERSON);
    expect(result.conflicts[0].severity).toEqual(CONFLICT_BLOCK);
    expect(result.blocked).toBe(true);
  });

  it('detects SAME_PERSON from an unhydrated participant.personId', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [{ participantId: 'par-001', personId: OFFICIAL_PERSON_ID } as Participant],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_SAME_PERSON);
  });

  it('detects a DECLARED_RELATIONSHIP matched by personId', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', personId: 'person-001', relationship: 'COACH' }],
    });
    let result: any = getOfficialConflicts({
      officialRecord,
      participants: [makeParticipant()],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_DECLARED_RELATIONSHIP);
    expect(result.conflicts[0].relationship).toEqual('COACH');
    expect(result.conflicts[0].declarationId).toEqual('dec-1');
    expect(result.conflicts[0].reason).toContain('COACH');
    expect(result.blocked).toBe(true);
  });

  it('detects a DECLARED_RELATIONSHIP matched by participantId', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', participantId: 'par-001' }],
    });
    let result: any = getOfficialConflicts({
      officialRecord,
      participants: [makeParticipant()],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_DECLARED_RELATIONSHIP);
  });

  it('does not match a declaration against an unrelated participant', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', personId: 'person-999' }],
    });
    let result: any = getOfficialConflicts({
      officialRecord,
      participants: [makeParticipant()],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('does NOT flag shared nationality under the default policy', () => {
    // NATIONALITY is disabled by default — enabling it at national events, where
    // every official shares the players' nationality, would make it pure noise.
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant()],
      nationalityCode: 'FRA',
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toEqual([]);
  });

  it('flags shared nationality under the ITF policy', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant()],
      nationalityCode: 'FRA',
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_NATIONALITY);
    expect(result.conflicts[0].nationalityCode).toEqual('FRA');
    expect(result.blocked).toBe(true);
  });

  it('falls back to participant.representing when the person carries no nationality', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant({ person: { personId: 'person-001' } as any, representing: 'FRA' as any })],
      nationalityCode: 'FRA',
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_NATIONALITY);
  });

  it('does not flag nationality when the official nationality is unknown', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant()],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF,
    });
    expect(result.conflicts).toEqual([]);
  });

  it('detects ORGANISATION from a declared organisation affiliation', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', organisationId: 'org-A' }],
    });
    let result: any = getOfficialConflicts({
      officialRecord,
      participants: [makeParticipant({ person: { personId: 'person-001', parentOrganisationId: 'org-A' } as any })],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_ORGANISATION);
    expect(result.conflicts[0].severity).toEqual(CONFLICT_WARN);
    // WARN alone does not block.
    expect(result.blocked).toBe(false);
  });

  it('detects ORGANISATION from the organisationIds argument', () => {
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant({ person: { personId: 'person-001', parentOrganisationId: 'org-B' } as any })],
      organisationIds: ['org-B'],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_ORGANISATION);
  });

  it('does not evaluate a rule the policy disables', () => {
    const policyDefinitions = {
      [POLICY_TYPE_OFFICIATING_CONFLICT]: {
        conflictRules: { [CONFLICT_SAME_PERSON]: { enabled: false, severity: CONFLICT_BLOCK } },
      },
    };
    let result: any = getOfficialConflicts({
      officialRecord: makeRecord(),
      participants: [makeParticipant({ person: { personId: OFFICIAL_PERSON_ID } as any })],
      policyDefinitions,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('reports every conflict across multiple participants and rules', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', personId: 'person-002', relationship: 'FAMILY' }],
    });
    let result: any = getOfficialConflicts({
      officialRecord,
      participants: [
        makeParticipant({ participantId: 'par-1', person: { personId: OFFICIAL_PERSON_ID } as any }),
        makeParticipant({ participantId: 'par-2', person: { personId: 'person-002' } as any }),
        makeParticipant({ participantId: 'par-3', person: { personId: 'person-003' } as any }),
      ],
      policyDefinitions: ALL_RULES_BLOCK,
    });
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.map((c: any) => c.conflictType)).toEqual([
      CONFLICT_SAME_PERSON,
      CONFLICT_DECLARED_RELATIONSHIP,
    ]);
    expect(result.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addConflictDeclaration / removeConflictDeclaration
// ---------------------------------------------------------------------------
describe('addConflictDeclaration', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = addConflictDeclaration({ officialRecord: undefined as any, personId: 'p1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('refuses a declaration that identifies nothing', () => {
    // Such a declaration can never match a participant — it would look like a
    // disclosure while checking nothing.
    let result: any = addConflictDeclaration({ officialRecord: makeRecord(), relationship: 'COACH' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('adds a declaration and initializes the array when absent', () => {
    const officialRecord = makeRecord();
    expect(officialRecord.conflictDeclarations).toBeUndefined();

    let result: any = addConflictDeclaration({ officialRecord, personId: 'person-001', relationship: 'COACH' });
    expect(result.success).toBe(true);
    expect(result.declaration.declarationId).toBeDefined();
    expect(result.declaration.declaredAt).toBeDefined();
    expect(officialRecord.conflictDeclarations).toHaveLength(1);
  });

  it('appends to existing declarations', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', personId: 'person-001' }],
    });
    addConflictDeclaration({ officialRecord, participantId: 'par-002' });
    expect(officialRecord.conflictDeclarations).toHaveLength(2);
  });
});

describe('removeConflictDeclaration', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = removeConflictDeclaration({ officialRecord: undefined as any, declarationId: 'dec-1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when declarationId is missing', () => {
    let result: any = removeConflictDeclaration({ officialRecord: makeRecord(), declarationId: '' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when the declaration is not found', () => {
    let result: any = removeConflictDeclaration({ officialRecord: makeRecord(), declarationId: 'nope' });
    expect(result.error).toEqual(CONFLICT_DECLARATION_NOT_FOUND);
  });

  it('removes the declaration', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [
        { declarationId: 'dec-1', personId: 'person-001' },
        { declarationId: 'dec-2', personId: 'person-002' },
      ],
    });
    let result: any = removeConflictDeclaration({ officialRecord, declarationId: 'dec-1' });
    expect(result.success).toBe(true);
    expect(officialRecord.conflictDeclarations).toHaveLength(1);
    expect(officialRecord.conflictDeclarations?.[0].declarationId).toEqual('dec-2');
  });
});

// ---------------------------------------------------------------------------
// assignOfficial — conflict gate
// ---------------------------------------------------------------------------
describe('assignOfficial conflict gate', () => {
  it('assigns unchanged when no conflict policy is supplied', () => {
    const officialRecord = makeRecord();
    let result: any = assignOfficial({ officialRecord, tournamentId: 't-1', roleSubtype: 'CHAIR_UMPIRE' });
    expect(result.success).toBe(true);
    expect(result.assignment).toBeDefined();
    expect(result.conflicts).toBeUndefined();
    expect(officialRecord.assignments).toHaveLength(1);
  });

  it('refuses the assignment on a BLOCK conflict and records nothing', () => {
    const officialRecord = makeRecord();
    let result: any = assignOfficial({
      officialRecord,
      tournamentId: 't-1',
      roleSubtype: 'CHAIR_UMPIRE',
      participants: [makeParticipant({ person: { personId: OFFICIAL_PERSON_ID } as any })],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.error).toEqual(OFFICIAL_CONFLICT_OF_INTEREST);
    expect(result.conflicts).toHaveLength(1);
    expect(result.assignment).toBeUndefined();
    expect(officialRecord.assignments).toHaveLength(0);
  });

  it('assigns but surfaces WARN conflicts', () => {
    const officialRecord = makeRecord({
      conflictDeclarations: [{ declarationId: 'dec-1', organisationId: 'org-A' }],
    });
    let result: any = assignOfficial({
      officialRecord,
      tournamentId: 't-1',
      roleSubtype: 'CHAIR_UMPIRE',
      participants: [makeParticipant({ person: { personId: 'person-001', parentOrganisationId: 'org-A' } as any })],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toEqual(CONFLICT_WARN);
    expect(officialRecord.assignments).toHaveLength(1);
  });

  it('sees a tournament GROUP relationship — parity with addMatchUpOfficial', () => {
    // Without officialParticipantId + groupParticipants this route can only see registry declarations,
    // so the SAME conflict would block per-matchUp and pass here. Same feature, two routes, one answer.
    const officialRecord = makeRecord();
    const result: any = assignOfficial({
      officialRecord,
      tournamentId: 't-1',
      roleSubtype: 'CHAIR_UMPIRE',
      participants: [makeParticipant({ participantId: 'par-competitor' })],
      officialParticipantId: 'par-official',
      groupParticipants: [
        {
          participantId: 'grp-1',
          participantType: 'GROUP',
          participantName: 'Team Alpha',
          participantRole: 'COACH',
          individualParticipantIds: ['par-official', 'par-competitor'],
        } as any,
      ],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });

    expect(result.error).toEqual(OFFICIAL_CONFLICT_OF_INTEREST);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toEqual(CONFLICT_SHARED_GROUPING);
    expect(result.conflicts[0].groupRole).toEqual('COACH');
    expect(officialRecord.assignments).toHaveLength(0);
  });

  it('does not flag a grouping the official is not a member of', () => {
    const officialRecord = makeRecord();
    const result: any = assignOfficial({
      officialRecord,
      tournamentId: 't-1',
      roleSubtype: 'CHAIR_UMPIRE',
      participants: [makeParticipant({ participantId: 'par-competitor' })],
      officialParticipantId: 'par-official',
      groupParticipants: [
        {
          participantId: 'grp-1',
          participantType: 'GROUP',
          participantRole: 'COACH',
          individualParticipantIds: ['someone-else', 'par-competitor'],
        } as any,
      ],
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.success).toBe(true);
    expect(officialRecord.assignments).toHaveLength(1);
  });

  it('refuses to assign when a policy is supplied without participants', () => {
    // The gate must fail closed: an unusable check cannot silently pass.
    const officialRecord = makeRecord();
    let result: any = assignOfficial({
      officialRecord,
      tournamentId: 't-1',
      roleSubtype: 'CHAIR_UMPIRE',
      policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    });
    expect(result.error).toEqual(MISSING_CONFLICT_PARTICIPANTS);
    expect(officialRecord.assignments).toHaveLength(0);
  });
});
