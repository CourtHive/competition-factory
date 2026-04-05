import { transitionAssignmentStatus } from '@Mutate/officiating/transitionAssignmentStatus';
import { addCertificationRequirement } from '@Mutate/officiating/addCertificationRequirement';
import { removeOfficialAssignment } from '@Mutate/officiating/removeOfficialAssignment';
import { addEvaluationPolicy } from '@Mutate/officiating/addEvaluationPolicy';
import { removeCertification } from '@Mutate/officiating/removeCertification';
import { modifyCertification } from '@Mutate/officiating/modifyCertification';
import { removeEvaluation } from '@Mutate/officiating/removeEvaluation';
import { removeSuspension } from '@Mutate/officiating/removeSuspension';
import { addCertification } from '@Mutate/officiating/addCertification';
import { modifyEvaluation } from '@Mutate/officiating/modifyEvaluation';
import { assignOfficial } from '@Mutate/officiating/assignOfficial';
import { describe, expect, it } from 'vitest';

import {
  INVALID_OFFICIATING_STATUS_TRANSITION,
  MISSING_OFFICIAL_RECORD,
  CERTIFICATION_NOT_FOUND,
  EVALUATION_NOT_EDITABLE,
  EVALUATION_NOT_FOUND,
  ASSIGNMENT_NOT_FOUND,
  SUSPENSION_NOT_FOUND,
  ASSIGN_PROPOSED,
  ASSIGN_CONFIRMED,
  EVAL_SUBMITTED,
  EVAL_DRAFT,
} from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

import type { OfficialRecord } from '@Types/officiatingTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides?: Partial<OfficialRecord>): OfficialRecord {
  return {
    officialRecordId: 'rec-1',
    personId: 'person-1',
    certifications: [],
    evaluations: [],
    assignments: [],
    suspensions: [],
    certificationRequirements: [],
    evaluationPolicies: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addEvaluationPolicy
// ---------------------------------------------------------------------------

describe('addEvaluationPolicy — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = addEvaluationPolicy({ officialRecord: undefined as any, evaluationPolicy: {} as any });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when evaluationPolicy is missing', () => {
    let result: any = addEvaluationPolicy({ officialRecord: makeRecord(), evaluationPolicy: undefined as any });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing evaluationPolicy');
  });

  it('returns error when policyName is missing', () => {
    let result: any = addEvaluationPolicy({
      officialRecord: makeRecord(),
      evaluationPolicy: { sections: [{ sectionId: 's1', sectionName: 'S1', criteria: [] }] } as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing policyName');
  });

  it('returns error when sections is empty', () => {
    let result: any = addEvaluationPolicy({
      officialRecord: makeRecord(),
      evaluationPolicy: { policyName: 'Test', sections: [] } as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Policy must include at least one section');
  });

  it('returns error when sections is not an array', () => {
    let result: any = addEvaluationPolicy({
      officialRecord: makeRecord(),
      evaluationPolicy: { policyName: 'Test', sections: 'bad' } as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Policy must include at least one section');
  });
});

// ---------------------------------------------------------------------------
// addCertificationRequirement
// ---------------------------------------------------------------------------

describe('addCertificationRequirement — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = addCertificationRequirement({
      officialRecord: undefined as any,
      certificationFamily: 'ITF',
      certificationLevel: 'Gold',
      organisationId: 'org-1',
      requirements: [],
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when certificationFamily is missing', () => {
    let result: any = addCertificationRequirement({
      officialRecord: makeRecord(),
      certificationFamily: '',
      certificationLevel: 'Gold',
      organisationId: 'org-1',
      requirements: [{ itemId: 'i1', itemType: 'EXAM', description: 'Pass exam' }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationFamily');
  });

  it('returns error when certificationLevel is missing', () => {
    let result: any = addCertificationRequirement({
      officialRecord: makeRecord(),
      certificationFamily: 'ITF',
      certificationLevel: '',
      organisationId: 'org-1',
      requirements: [{ itemId: 'i1', itemType: 'EXAM', description: 'Pass exam' }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationLevel');
  });

  it('returns error when organisationId is missing', () => {
    let result: any = addCertificationRequirement({
      officialRecord: makeRecord(),
      certificationFamily: 'ITF',
      certificationLevel: 'Gold',
      organisationId: '',
      requirements: [{ itemId: 'i1', itemType: 'EXAM', description: 'Pass exam' }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing organisationId');
  });

  it('returns error when requirements is empty array', () => {
    let result: any = addCertificationRequirement({
      officialRecord: makeRecord(),
      certificationFamily: 'ITF',
      certificationLevel: 'Gold',
      organisationId: 'org-1',
      requirements: [],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Requirements must be a non-empty array');
  });

  it('returns error when requirements is not an array', () => {
    let result: any = addCertificationRequirement({
      officialRecord: makeRecord(),
      certificationFamily: 'ITF',
      certificationLevel: 'Gold',
      organisationId: 'org-1',
      requirements: 'bad' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Requirements must be a non-empty array');
  });

  it('succeeds with valid params and assigns itemIds', () => {
    const record = makeRecord();
    let result: any = addCertificationRequirement({
      officialRecord: record,
      certificationFamily: 'ITF',
      certificationLevel: 'Gold',
      organisationId: 'org-1',
      requirements: [{ itemType: 'EXAM', description: 'Pass exam' } as any],
      description: 'Gold badge requirements',
      prerequisiteLevels: ['Silver'],
      minimumAssignments: 10,
      minimumEvaluationScore: 3.5,
      validityPeriodMonths: 24,
      extensions: [{ name: 'x', value: 1 }],
    });
    expect(result.success).toBe(true);
    expect(result.certificationRequirement.requirementId).toBeDefined();
    expect(result.certificationRequirement.requirements[0].itemId).toBeDefined();
    expect(result.certificationRequirement.description).toBe('Gold badge requirements');
    expect(record.certificationRequirements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// modifyCertification
// ---------------------------------------------------------------------------

describe('modifyCertification — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = modifyCertification({
      officialRecord: undefined as any,
      certificationId: 'c1',
      updates: {},
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when certificationId is missing', () => {
    let result: any = modifyCertification({
      officialRecord: makeRecord(),
      certificationId: '',
      updates: {},
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationId');
  });

  it('returns error when certification not found', () => {
    let result: any = modifyCertification({
      officialRecord: makeRecord(),
      certificationId: 'nonexistent',
      updates: {},
    });
    expect(result.error).toEqual(CERTIFICATION_NOT_FOUND);
    expect(result.context.certificationId).toBe('nonexistent');
  });

  it('applies all update fields', () => {
    const record = makeRecord({
      certifications: [
        {
          certificationId: 'c1',
          personId: 'person-1',
          organisationId: 'org-1',
          certificationFamily: 'ITF',
          certificationLevel: 'Silver',
          status: 'ACTIVE',
          statusHistory: [],
          extensions: [],
        } as any,
      ],
    });
    let result: any = modifyCertification({
      officialRecord: record,
      certificationId: 'c1',
      updates: {
        certificationLevel: 'Gold',
        validFrom: '2025-06-01',
        validUntil: '2027-06-01',
        documentReferences: [{ docId: 'd1' }] as any,
        notes: 'Upgraded',
        extensions: [{ name: 'ext', value: true }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.certification.certificationLevel).toBe('Gold');
    expect(result.certification.validFrom).toBe('2025-06-01');
    expect(result.certification.validUntil).toBe('2027-06-01');
    expect(result.certification.documentReferences).toHaveLength(1);
    expect(result.certification.notes).toBe('Upgraded');
    expect(result.certification.extensions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// modifyEvaluation
// ---------------------------------------------------------------------------

describe('modifyEvaluation — guards and branches', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = modifyEvaluation({
      officialRecord: undefined as any,
      evaluationId: 'e1',
      updates: {},
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when evaluationId is missing', () => {
    let result: any = modifyEvaluation({
      officialRecord: makeRecord(),
      evaluationId: '',
      updates: {},
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing evaluationId');
  });

  it('returns error when evaluation not found', () => {
    let result: any = modifyEvaluation({
      officialRecord: makeRecord(),
      evaluationId: 'nonexistent',
      updates: {},
    });
    expect(result.error).toEqual(EVALUATION_NOT_FOUND);
    expect(result.context.evaluationId).toBe('nonexistent');
  });

  it('returns error when evaluation is not editable', () => {
    const record = makeRecord({
      evaluations: [
        {
          evaluationId: 'e1',
          personId: 'person-1',
          evaluatorId: 'evaluator-1',
          status: EVAL_SUBMITTED,
          evaluationDate: '2025-01-01',
          scores: [],
          overallRating: 4,
        } as any,
      ],
    });
    let result: any = modifyEvaluation({
      officialRecord: record,
      evaluationId: 'e1',
      updates: { overallRating: 5 },
    });
    expect(result.error).toEqual(EVALUATION_NOT_EDITABLE);
    expect(result.context.status).toBe(EVAL_SUBMITTED);
  });

  it('applies all update fields on DRAFT evaluation', () => {
    const record = makeRecord({
      evaluations: [
        {
          evaluationId: 'e1',
          personId: 'person-1',
          evaluatorId: 'evaluator-1',
          status: EVAL_DRAFT,
          evaluationDate: '2025-01-01',
          scores: [],
          overallRating: 3,
        } as any,
      ],
    });
    let result: any = modifyEvaluation({
      officialRecord: record,
      evaluationId: 'e1',
      updates: {
        overallRating: 5,
        scores: [{ criterionId: 'cr1', sectionId: 's1', value: 5 }],
        comments: 'Excellent performance',
        documentReference: 'doc-ref-1',
        tournamentId: 'tid-1',
        tournamentName: 'Test Open',
        matchUpId: 'mid-1',
        policyName: 'Chair Umpire Eval',
        extensions: [{ name: 'ext', value: 42 }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.evaluation.overallRating).toBe(5);
    expect(result.evaluation.scores).toHaveLength(1);
    expect(result.evaluation.comments).toBe('Excellent performance');
    expect(result.evaluation.documentReference).toBe('doc-ref-1');
    expect(result.evaluation.tournamentId).toBe('tid-1');
    expect(result.evaluation.tournamentName).toBe('Test Open');
    expect(result.evaluation.matchUpId).toBe('mid-1');
    expect(result.evaluation.policyName).toBe('Chair Umpire Eval');
    expect(result.evaluation.extensions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// assignOfficial
// ---------------------------------------------------------------------------

describe('assignOfficial — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = assignOfficial({
      officialRecord: undefined as any,
      tournamentId: 't1',
      roleSubtype: 'CHAIR_UMPIRE',
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when tournamentId is missing', () => {
    let result: any = assignOfficial({
      officialRecord: makeRecord(),
      tournamentId: '',
      roleSubtype: 'CHAIR_UMPIRE',
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing tournamentId');
  });

  it('returns error when roleSubtype is missing', () => {
    let result: any = assignOfficial({
      officialRecord: makeRecord(),
      tournamentId: 't1',
      roleSubtype: '',
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing roleSubtype');
  });
});

// ---------------------------------------------------------------------------
// addCertification
// ---------------------------------------------------------------------------

describe('addCertification — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = addCertification({
      officialRecord: undefined as any,
      organisationId: 'org-1',
      certificationFamily: 'ITF',
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when organisationId is missing', () => {
    let result: any = addCertification({
      officialRecord: makeRecord(),
      organisationId: '',
      certificationFamily: 'ITF',
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing organisationId');
  });

  it('returns error when certificationFamily is missing', () => {
    let result: any = addCertification({
      officialRecord: makeRecord(),
      organisationId: 'org-1',
      certificationFamily: '',
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationFamily');
  });
});

// ---------------------------------------------------------------------------
// removeCertification
// ---------------------------------------------------------------------------

describe('removeCertification — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = removeCertification({ officialRecord: undefined as any, certificationId: 'c1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when certificationId is missing', () => {
    let result: any = removeCertification({ officialRecord: makeRecord(), certificationId: '' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationId');
  });

  it('returns error when certification not found', () => {
    let result: any = removeCertification({ officialRecord: makeRecord(), certificationId: 'nonexistent' });
    expect(result.error).toEqual(CERTIFICATION_NOT_FOUND);
    expect(result.context.certificationId).toBe('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// removeEvaluation
// ---------------------------------------------------------------------------

describe('removeEvaluation — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = removeEvaluation({ officialRecord: undefined as any, evaluationId: 'e1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when evaluationId is missing', () => {
    let result: any = removeEvaluation({ officialRecord: makeRecord(), evaluationId: '' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing evaluationId');
  });

  it('returns error when evaluation not found', () => {
    let result: any = removeEvaluation({ officialRecord: makeRecord(), evaluationId: 'nonexistent' });
    expect(result.error).toEqual(EVALUATION_NOT_FOUND);
    expect(result.context.evaluationId).toBe('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// removeOfficialAssignment
// ---------------------------------------------------------------------------

describe('removeOfficialAssignment — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = removeOfficialAssignment({ officialRecord: undefined as any, assignmentId: 'a1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when assignmentId is missing', () => {
    let result: any = removeOfficialAssignment({ officialRecord: makeRecord(), assignmentId: '' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing assignmentId');
  });

  it('returns error when assignment not found', () => {
    let result: any = removeOfficialAssignment({ officialRecord: makeRecord(), assignmentId: 'nonexistent' });
    expect(result.error).toEqual(ASSIGNMENT_NOT_FOUND);
    expect(result.context.assignmentId).toBe('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// removeSuspension
// ---------------------------------------------------------------------------

describe('removeSuspension — guards', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = removeSuspension({ officialRecord: undefined as any, suspensionId: 's1' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when suspensionId is missing', () => {
    let result: any = removeSuspension({ officialRecord: makeRecord(), suspensionId: '' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing suspensionId');
  });

  it('returns error when suspension not found', () => {
    let result: any = removeSuspension({ officialRecord: makeRecord(), suspensionId: 'nonexistent' });
    expect(result.error).toEqual(SUSPENSION_NOT_FOUND);
    expect(result.context.suspensionId).toBe('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// transitionAssignmentStatus
// ---------------------------------------------------------------------------

describe('transitionAssignmentStatus — guards and branches', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = transitionAssignmentStatus({
      officialRecord: undefined as any,
      assignmentId: 'a1',
      toStatus: ASSIGN_CONFIRMED,
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when assignmentId is missing', () => {
    let result: any = transitionAssignmentStatus({
      officialRecord: makeRecord(),
      assignmentId: '',
      toStatus: ASSIGN_CONFIRMED,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing assignmentId');
  });

  it('returns error when toStatus is missing', () => {
    let result: any = transitionAssignmentStatus({
      officialRecord: makeRecord(),
      assignmentId: 'a1',
      toStatus: '' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing toStatus');
  });

  it('returns error when assignment not found', () => {
    let result: any = transitionAssignmentStatus({
      officialRecord: makeRecord(),
      assignmentId: 'nonexistent',
      toStatus: ASSIGN_CONFIRMED,
    });
    expect(result.error).toEqual(ASSIGNMENT_NOT_FOUND);
    expect(result.context.assignmentId).toBe('nonexistent');
  });

  it('returns error for invalid status transition', () => {
    const record = makeRecord({
      assignments: [
        {
          assignmentId: 'a1',
          personId: 'person-1',
          tournamentId: 't1',
          roleSubtype: 'CHAIR_UMPIRE',
          status: ASSIGN_PROPOSED,
          assignedDate: '2025-01-01',
          statusHistory: [],
          extensions: [],
        } as any,
      ],
    });
    // PROPOSED cannot transition directly to COMPLETED
    let result: any = transitionAssignmentStatus({
      officialRecord: record,
      assignmentId: 'a1',
      toStatus: 'COMPLETED' as any,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.fromStatus).toBe(ASSIGN_PROPOSED);
    expect(result.context.toStatus).toBe('COMPLETED');
  });
});
