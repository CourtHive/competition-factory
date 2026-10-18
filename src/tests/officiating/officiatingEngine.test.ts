import { getOfficiatingMethods, setOfficiatingMethods } from '@Assemblies/engines/officiating/officiatingState';
import * as officiatingGovernor from '@Assemblies/governors/officiatingGovernor';
import { officiatingEngine } from '@Assemblies/engines/officiating';
import { beforeEach, describe, expect, it } from 'vitest';

// Fixtures
import { POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE } from '@Fixtures/policies/POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  CERT_ACTIVE,
  CERT_SUSPENDED,
  CERT_REVOKED,
  CERT_EXPIRED,
  EVAL_DRAFT,
  EVAL_SUBMITTED,
  EVAL_REVIEWED,
  EVAL_APPROVED,
  EVAL_REJECTED,
  ASSIGN_PROPOSED,
  ASSIGN_CONFIRMED,
  ASSIGN_COMPLETED,
  CONFLICT_BLOCK,
  CERTIFICATION_NOT_FOUND,
  EVALUATION_NOT_EDITABLE,
  INVALID_EVALUATION_SCORES,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  OFFICIAL_RECORD_EXISTS,
  OFFICIAL_RECORD_NOT_FOUND,
} from '@Constants/officiatingConstants';

function createTestRecord(overrides?: any) {
  return officiatingEngine.createOfficialRecord({
    personId: 'person-001',
    organisationId: 'org-001',
    ...overrides,
  });
}

describe('Officiating Engine — State Management', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('starts with empty state', () => {
    let result: any = officiatingEngine.getState();
    expect(result.success).toBe(true);
    expect(Object.keys(result.officialRecords)).toHaveLength(0);
  });

  it('reset clears all records', () => {
    createTestRecord();
    officiatingEngine.reset();
    let result: any = officiatingEngine.getState();
    expect(Object.keys(result.officialRecords)).toHaveLength(0);
  });

  it('creates an official record and sets it as active', () => {
    let result: any = createTestRecord();
    expect(result.success).toBe(true);
    expect(result.officialRecord).toBeDefined();
    expect(result.officialRecord.personId).toBe('person-001');
    expect(result.officialRecord.organisationId).toBe('org-001');

    let active: any = officiatingEngine.getActiveOfficialRecordId();
    expect(active).toBe(result.officialRecord.officialRecordId);
  });

  it('rejects duplicate official records', () => {
    let result: any = createTestRecord({ officialRecordId: 'rec-1' });
    expect(result.success).toBe(true);

    result = createTestRecord({ officialRecordId: 'rec-1' });
    expect(result.error).toEqual(OFFICIAL_RECORD_EXISTS);
  });

  it('setState and getState round-trip', () => {
    let result: any = createTestRecord();
    const { officialRecordId } = result.officialRecord;

    let state: any = officiatingEngine.getState();
    officiatingEngine.reset();

    officiatingEngine.setState(state.officialRecords);
    let fetched: any = officiatingEngine.getOfficialRecord({ officialRecordId });
    expect(fetched.success).toBe(true);
    expect(fetched.officialRecord.personId).toBe('person-001');
  });

  it('removes an official record', () => {
    let result: any = createTestRecord({ officialRecordId: 'rec-to-remove' });
    expect(result.success).toBe(true);

    result = officiatingEngine.removeOfficialRecord('rec-to-remove');
    expect(result.success).toBe(true);

    let state: any = officiatingEngine.getState();
    expect(Object.keys(state.officialRecords)).toHaveLength(0);
  });

  it('setActiveOfficialRecordId validates record exists', () => {
    let result: any = officiatingEngine.setActiveOfficialRecordId('nonexistent');
    expect(result.error).toEqual(OFFICIAL_RECORD_NOT_FOUND);
  });

  it('requires personId to create a record', () => {
    let result: any = officiatingEngine.createOfficialRecord({} as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('Officiating Engine — Certifications', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('adds a certification', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      certificationLevel: 'WHITE_BADGE',
      validFrom: '2025-01-01',
      validUntil: '2027-12-31',
    });
    expect(result.success).toBe(true);
    expect(result.certification.certificationFamily).toBe('UMPIRE');
    expect(result.certification.status).toBe(CERT_ACTIVE);
  });

  it('modifies a certification', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.modifyCertification({
      certificationId,
      updates: { certificationLevel: 'BRONZE_BADGE', notes: 'Upgraded' },
    });
    expect(result.success).toBe(true);
    expect(result.certification.certificationLevel).toBe('BRONZE_BADGE');
    expect(result.certification.notes).toBe('Upgraded');
  });

  it('removes a certification', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.removeCertification({ certificationId });
    expect(result.success).toBe(true);

    result = officiatingEngine.getOfficialCertifications({});
    expect(result.certifications).toHaveLength(0);
  });

  it('transitions certification status', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.transitionCertificationStatus({
      certificationId,
      toStatus: CERT_SUSPENDED,
      reason: 'Disciplinary review',
    });
    expect(result.success).toBe(true);
    expect(result.certification.status).toBe(CERT_SUSPENDED);
    expect(result.certification.statusHistory).toHaveLength(2);
  });

  it('rejects invalid certification status transitions', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      status: CERT_REVOKED,
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.transitionCertificationStatus({
      certificationId,
      toStatus: CERT_ACTIVE,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
  });

  it('validates certification', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      validFrom: '2025-01-01',
      validUntil: '2027-12-31',
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.validateCertification({ certificationId, asOfDate: '2026-06-15' });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('validates expired certification', () => {
    let result: any = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      validUntil: '2020-12-31',
    });
    const { certificationId } = result.certification;

    result = officiatingEngine.validateCertification({ certificationId, asOfDate: '2025-01-01' });
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('filters certifications by family and activeOnly', () => {
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'REFEREE',
    });
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      status: CERT_EXPIRED,
    });

    let result: any = officiatingEngine.getOfficialCertifications({
      certificationFamily: 'UMPIRE',
      activeOnly: true,
    });
    expect(result.certifications).toHaveLength(1);
  });
});

describe('Officiating Engine — Evaluations', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('adds an evaluation', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 4.2,
    });
    expect(result.success).toBe(true);
    expect(result.evaluation.status).toBe(EVAL_DRAFT);
    expect(result.evaluation.overallRating).toBe(4.2);
    expect(result.evaluation.subjectPersonId).toBe('person-001');
  });

  it('modifies an evaluation in DRAFT status', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 3.5,
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.modifyEvaluation({
      evaluationId,
      updates: { overallRating: 4.0, comments: 'Updated' },
    });
    expect(result.success).toBe(true);
    expect(result.evaluation.overallRating).toBe(4.0);
  });

  it('rejects modification of submitted evaluation', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 3.5,
    });
    const { evaluationId } = result.evaluation;

    officiatingEngine.transitionEvaluationStatus({
      evaluationId,
      toStatus: EVAL_SUBMITTED,
    });

    result = officiatingEngine.modifyEvaluation({
      evaluationId,
      updates: { overallRating: 5.0 },
    });
    expect(result.error).toEqual(EVALUATION_NOT_EDITABLE);
  });

  it('transitions evaluation through full workflow', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 4.0,
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_SUBMITTED });
    expect(result.success).toBe(true);

    result = officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_REVIEWED });
    expect(result.success).toBe(true);

    result = officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_APPROVED });
    expect(result.success).toBe(true);

    expect(result.evaluation.statusHistory).toHaveLength(4);
  });

  it('rejects invalid evaluation status transition', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 3.0,
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_APPROVED });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
  });

  it('rejected evaluation can return to DRAFT', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 2.0,
    });
    const { evaluationId } = result.evaluation;

    officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_SUBMITTED });
    officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_REJECTED });

    result = officiatingEngine.transitionEvaluationStatus({ evaluationId, toStatus: EVAL_DRAFT });
    expect(result.success).toBe(true);
    expect(result.evaluation.status).toBe(EVAL_DRAFT);
  });

  it('removes an evaluation', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 3.0,
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.removeEvaluation({ evaluationId });
    expect(result.success).toBe(true);

    result = officiatingEngine.getEvaluations({});
    expect(result.evaluations).toHaveLength(0);
  });

  it('rejects negative overall rating', () => {
    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: -1,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('Officiating Engine — Assignments', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('assigns an official', () => {
    let result: any = officiatingEngine.assignOfficial({
      tournamentId: 'tournament-001',
      roleSubtype: 'CHAIR_UMPIRE',
    });
    expect(result.success).toBe(true);
    expect(result.assignment.status).toBe(ASSIGN_PROPOSED);
    expect(result.assignment.tournamentId).toBe('tournament-001');
  });

  it('transitions assignment to CONFIRMED then COMPLETED', () => {
    let result: any = officiatingEngine.assignOfficial({
      tournamentId: 'tournament-001',
      roleSubtype: 'CHAIR_UMPIRE',
    });
    const { assignmentId } = result.assignment;

    result = officiatingEngine.transitionAssignmentStatus({ assignmentId, toStatus: ASSIGN_CONFIRMED });
    expect(result.success).toBe(true);

    result = officiatingEngine.transitionAssignmentStatus({ assignmentId, toStatus: ASSIGN_COMPLETED });
    expect(result.success).toBe(true);
    expect(result.assignment.statusHistory).toHaveLength(3);
  });

  it('rejects invalid assignment transitions', () => {
    let result: any = officiatingEngine.assignOfficial({
      tournamentId: 'tournament-001',
      roleSubtype: 'CHAIR_UMPIRE',
    });
    const { assignmentId } = result.assignment;

    result = officiatingEngine.transitionAssignmentStatus({ assignmentId, toStatus: ASSIGN_COMPLETED });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
  });

  it('removes an assignment', () => {
    let result: any = officiatingEngine.assignOfficial({
      tournamentId: 'tournament-001',
      roleSubtype: 'REFEREE',
    });
    const { assignmentId } = result.assignment;

    result = officiatingEngine.removeOfficialAssignment({ assignmentId });
    expect(result.success).toBe(true);
  });

  it('filters assignments by tournamentId and roleSubtype', () => {
    officiatingEngine.assignOfficial({ tournamentId: 't-1', roleSubtype: 'CHAIR_UMPIRE' });
    officiatingEngine.assignOfficial({ tournamentId: 't-1', roleSubtype: 'REFEREE' });
    officiatingEngine.assignOfficial({ tournamentId: 't-2', roleSubtype: 'CHAIR_UMPIRE' });

    let result: any = officiatingEngine.getOfficialAssignments({ tournamentId: 't-1' });
    expect(result.assignments).toHaveLength(2);

    result = officiatingEngine.getOfficialAssignments({ roleSubtype: 'CHAIR_UMPIRE' });
    expect(result.assignments).toHaveLength(2);
  });
});

describe('Officiating Engine — Suspensions', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('adds and removes a suspension', () => {
    let result: any = officiatingEngine.addSuspension({
      suspensionType: 'DISCIPLINARY',
      suspendedFrom: '2026-01-01',
      suspendedUntil: '2026-06-30',
    });
    expect(result.success).toBe(true);
    expect(result.suspension.suspensionType).toBe('DISCIPLINARY');

    result = officiatingEngine.removeSuspension({ suspensionId: result.suspension.suspensionId });
    expect(result.success).toBe(true);
  });
});

describe('Officiating Engine — Eligibility', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('eligible when active cert exists and no suspension', () => {
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      certificationLevel: 'WHITE_BADGE',
      validFrom: '2025-01-01',
      validUntil: '2027-12-31',
    });

    let result: any = officiatingEngine.getOfficialEligibility({
      certificationFamily: 'UMPIRE',
      asOfDate: '2026-06-01',
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('not eligible when suspended', () => {
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    officiatingEngine.addSuspension({
      suspendedFrom: '2026-01-01',
      suspendedUntil: '2026-12-31',
    });

    let result: any = officiatingEngine.getOfficialEligibility({
      certificationFamily: 'UMPIRE',
      asOfDate: '2026-06-01',
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('Official has active suspension(s)');
  });

  it('not eligible when no matching certification', () => {
    let result: any = officiatingEngine.getOfficialEligibility({
      certificationFamily: 'UMPIRE',
      certificationLevel: 'GOLD_BADGE',
    });
    expect(result.eligible).toBe(false);
  });

  it('checks certification requirement minimum assignments', () => {
    officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
      certificationLevel: 'BRONZE_BADGE',
    });

    officiatingEngine.addCertificationRequirement({
      certificationFamily: 'UMPIRE',
      certificationLevel: 'BRONZE_BADGE',
      organisationId: 'org-001',
      requirements: [{ itemId: 'r1', description: 'Training course', required: true }],
      minimumAssignments: 10,
    });

    let result: any = officiatingEngine.getOfficialEligibility({
      certificationFamily: 'UMPIRE',
      certificationLevel: 'BRONZE_BADGE',
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('Insufficient completed assignments'))).toBe(true);
  });
});

describe('Officiating Engine — Evaluation Summary', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('returns zero summary when no evaluations', () => {
    let result: any = officiatingEngine.getEvaluationSummary({});
    expect(result.summary.evaluationCount).toBe(0);
    expect(result.summary.averageRating).toBe(0);
  });

  it('computes average rating from approved evaluations', () => {
    // Add and approve two evaluations
    let r1: any = officiatingEngine.addEvaluation({ evaluatorPersonId: 'e1', overallRating: 4.0 });
    officiatingEngine.transitionEvaluationStatus({
      evaluationId: r1.evaluation.evaluationId,
      toStatus: EVAL_SUBMITTED,
    });
    officiatingEngine.transitionEvaluationStatus({ evaluationId: r1.evaluation.evaluationId, toStatus: EVAL_REVIEWED });
    officiatingEngine.transitionEvaluationStatus({ evaluationId: r1.evaluation.evaluationId, toStatus: EVAL_APPROVED });

    let r2: any = officiatingEngine.addEvaluation({ evaluatorPersonId: 'e2', overallRating: 3.0 });
    officiatingEngine.transitionEvaluationStatus({
      evaluationId: r2.evaluation.evaluationId,
      toStatus: EVAL_SUBMITTED,
    });
    officiatingEngine.transitionEvaluationStatus({ evaluationId: r2.evaluation.evaluationId, toStatus: EVAL_REVIEWED });
    officiatingEngine.transitionEvaluationStatus({ evaluationId: r2.evaluation.evaluationId, toStatus: EVAL_APPROVED });

    // Add a draft evaluation (should be excluded)
    officiatingEngine.addEvaluation({ evaluatorPersonId: 'e3', overallRating: 1.0 });

    let result: any = officiatingEngine.getEvaluationSummary({});
    expect(result.summary.evaluationCount).toBe(2);
    expect(result.summary.averageRating).toBe(3.5);
  });
});

describe('Officiating Engine — Evaluation Policy & Template', () => {
  beforeEach(() => {
    officiatingEngine.reset();
    createTestRecord();
  });

  it('adds an evaluation policy and generates a template', () => {
    let result: any = officiatingEngine.addEvaluationPolicy({
      evaluationPolicy: POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE,
    });
    expect(result.success).toBe(true);

    result = officiatingEngine.getEvaluationTemplate({
      policyName: 'ITF_CHAIR_UMPIRE_EVALUATION',
    });
    expect(result.success).toBe(true);
    expect(result.fields).toBeDefined();
    expect(result.fields.length).toBeGreaterThan(0);

    // Check field structure
    const field = result.fields[0];
    expect(field.fieldId).toBeDefined();
    expect(field.sectionId).toBeDefined();
    expect(field.sectionName).toBeDefined();
    expect(field.criterionId).toBeDefined();
    expect(field.criterionName).toBeDefined();
    expect(field.scoringType).toBeDefined();
    expect(field.required).toBeDefined();
  });

  it('validates required scores on submission', () => {
    officiatingEngine.addEvaluationPolicy({
      evaluationPolicy: POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE,
    });

    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 4.0,
      policyName: 'ITF_CHAIR_UMPIRE_EVALUATION',
      scores: [], // missing required scores
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.transitionEvaluationStatus({
      evaluationId,
      toStatus: EVAL_SUBMITTED,
    });
    expect(result.error).toEqual(INVALID_EVALUATION_SCORES);
    expect(result.error.code).toBe('ERR_INVALID_EVALUATION_SCORES');
  });

  it('allows submission when all required scores are present', () => {
    officiatingEngine.addEvaluationPolicy({
      evaluationPolicy: POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE,
    });

    // Collect all required criterion IDs
    const requiredScores = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE.sections.flatMap((s) =>
      s.criteria
        .filter((c) => c.required)
        .map((c) => ({ criterionId: c.criterionId, sectionId: s.sectionId, value: 4 })),
    );

    let result: any = officiatingEngine.addEvaluation({
      evaluatorPersonId: 'evaluator-001',
      overallRating: 4.0,
      policyName: 'ITF_CHAIR_UMPIRE_EVALUATION',
      scores: requiredScores,
    });
    const { evaluationId } = result.evaluation;

    result = officiatingEngine.transitionEvaluationStatus({
      evaluationId,
      toStatus: EVAL_SUBMITTED,
    });
    expect(result.success).toBe(true);
  });

  it('generates template from inline policy without record', () => {
    let result: any = officiatingEngine.getEvaluationTemplate({
      evaluationPolicy: POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE,
    });
    expect(result.success).toBe(true);
    expect(result.fields.length).toBeGreaterThan(0);
  });
});

describe('Officiating Engine — Execution Queue', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('executes a sequence of directives', () => {
    let result: any = officiatingEngine.executionQueue([
      {
        method: 'createOfficialRecord',
        params: { personId: 'person-queue', organisationId: 'org-001' },
      },
      {
        method: 'addCertification',
        params: { organisationId: 'org-001', certificationFamily: 'UMPIRE' },
      },
      {
        method: 'assignOfficial',
        params: { tournamentId: 'tournament-q', roleSubtype: 'CHAIR_UMPIRE' },
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  it('rolls back on error when rollbackOnError is true', () => {
    officiatingEngine.createOfficialRecord({ personId: 'person-rb', organisationId: 'org-001' });

    let result: any = officiatingEngine.executionQueue(
      [
        {
          method: 'addCertification',
          params: { organisationId: 'org-001', certificationFamily: 'UMPIRE' },
        },
        {
          method: 'transitionCertificationStatus',
          params: { certificationId: 'nonexistent', toStatus: CERT_EXPIRED },
        },
      ],
      true,
    );

    expect(result.error).toEqual(CERTIFICATION_NOT_FOUND);
    expect(result.rolledBack).toBe(true);

    // State should be rolled back — no certifications
    let record: any = officiatingEngine.getOfficialRecord({});
    expect(record.officialRecord.certifications).toHaveLength(0);
  });

  it('pipes result from one directive to the next', () => {
    officiatingEngine.createOfficialRecord({ personId: 'person-pipe', organisationId: 'org-001' });

    const directives = (pipe?: any) => [
      {
        method: 'addCertification',
        params: { organisationId: 'org-001', certificationFamily: 'UMPIRE' },
      },
      {
        method: 'transitionCertificationStatus',
        params: { toStatus: CERT_SUSPENDED },
        pipe,
      },
    ];

    // control: without the pipe the transition has no certificationId to act on
    let result: any = officiatingEngine.executionQueue(directives(), true);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toEqual('Missing certificationId');
    expect(result.rolledBack).toBe(true);

    result = officiatingEngine.executionQueue(directives({ certificationId: true }));
    expect(result.success).toBe(true);
    const { certificationId } = result.results[0];
    expect(certificationId).toEqual(result.results[0].certification.certificationId);

    const certifications: any[] = officiatingEngine.getOfficialRecord({}).officialRecord?.certifications ?? [];
    expect(certifications).toHaveLength(1);
    expect(certifications[0].certificationId).toEqual(certificationId);
    expect(certifications[0].status).toEqual(CERT_SUSPENDED);
  });

  it('rejects invalid directives', () => {
    let result: any = officiatingEngine.executionQueue('not an array' as any);
    expect(result.error).toEqual(INVALID_VALUES);

    result = officiatingEngine.executionQueue([{ method: 'nonexistentMethod' }]);
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('Officiating Engine — Multi-Record Management', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('creates two records, switches active, and targets the correct one', () => {
    let result: any = createTestRecord({ personId: 'person-A', officialRecordId: 'rec-A' });
    expect(result.success).toBe(true);

    result = createTestRecord({ personId: 'person-B', officialRecordId: 'rec-B' });
    expect(result.success).toBe(true);

    // Active should be rec-B (last created)
    expect(officiatingEngine.getActiveOfficialRecordId()).toBe('rec-B');

    // Switch active to rec-A
    result = officiatingEngine.setActiveOfficialRecordId('rec-A');
    expect(result.success).toBe(true);
    expect(officiatingEngine.getActiveOfficialRecordId()).toBe('rec-A');

    // Operations should target rec-A
    result = officiatingEngine.addCertification({
      organisationId: 'org-001',
      certificationFamily: 'UMPIRE',
    });
    expect(result.success).toBe(true);

    // Verify rec-A has the certification
    result = officiatingEngine.getOfficialCertifications({ officialRecordId: 'rec-A' });
    expect(result.certifications).toHaveLength(1);

    // Verify rec-B has no certifications
    result = officiatingEngine.getOfficialCertifications({ officialRecordId: 'rec-B' });
    expect(result.certifications).toHaveLength(0);
  });

  it('uses explicit officialRecordId on query methods instead of active record', () => {
    createTestRecord({ personId: 'person-A', officialRecordId: 'rec-A' });
    createTestRecord({ personId: 'person-B', officialRecordId: 'rec-B' });

    // Active is rec-B, but query rec-A explicitly
    let result: any = officiatingEngine.getOfficialRecord({ officialRecordId: 'rec-A' });
    expect(result.success).toBe(true);
    expect(result.officialRecord.personId).toBe('person-A');

    // Query rec-B explicitly
    result = officiatingEngine.getOfficialRecord({ officialRecordId: 'rec-B' });
    expect(result.success).toBe(true);
    expect(result.officialRecord.personId).toBe('person-B');
  });
});

describe('Officiating Engine — setState Edge Cases', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('setState with null/undefined resets to empty records', () => {
    createTestRecord();
    let result: any = officiatingEngine.setState(null as any);
    expect(result.success).toBe(true);

    result = officiatingEngine.getState();
    expect(Object.keys(result.officialRecords)).toHaveLength(0);

    createTestRecord();
    result = officiatingEngine.setState(undefined as any);
    expect(result.success).toBe(true);

    result = officiatingEngine.getState();
    expect(Object.keys(result.officialRecords)).toHaveLength(0);
  });

  it('setState with multiple records sets activeOfficialRecordId to undefined', () => {
    let result: any = createTestRecord({ personId: 'person-A', officialRecordId: 'rec-A' });
    const recA = result.officialRecord;
    result = createTestRecord({ personId: 'person-B', officialRecordId: 'rec-B' });
    const recB = result.officialRecord;

    // Save state with both records
    result = officiatingEngine.getState();
    const multiRecords = result.officialRecords;

    // Reset and restore
    officiatingEngine.reset();
    officiatingEngine.setState(multiRecords);

    // With 2 records, activeOfficialRecordId should be undefined
    let activeId: any = officiatingEngine.getActiveOfficialRecordId();
    expect(activeId).toBeUndefined();

    // Both records should still be accessible by explicit ID
    result = officiatingEngine.getOfficialRecord({ officialRecordId: recA.officialRecordId });
    expect(result.success).toBe(true);
    result = officiatingEngine.getOfficialRecord({ officialRecordId: recB.officialRecordId });
    expect(result.success).toBe(true);
  });
});

describe('Officiating Engine — setOfficialRecord Validation', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('setOfficialRecord with missing officialRecordId returns error', () => {
    let result: any = officiatingEngine.setOfficialRecord({} as any);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toContain('Missing officialRecordId');
  });
});

describe('Officiating Engine — Execution Queue Extended', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('pipe success path transfers values from previous result to next params', () => {
    createTestRecord({ personId: 'person-pipe', officialRecordId: 'rec-pipe' });

    const directives = (pipe?: any) => [
      {
        method: 'assignOfficial',
        params: { tournamentId: 'tournament-pipe', roleSubtype: 'CHAIR_UMPIRE' },
      },
      { method: 'removeOfficialAssignment', params: {}, pipe },
    ];

    // control: without the pipe the removal has no assignmentId
    let result: any = officiatingEngine.executionQueue(directives(), true);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toEqual('Missing assignmentId');

    result = officiatingEngine.executionQueue(directives({ assignmentId: true }));
    expect(result.success).toBe(true);
    expect(result.results[0].assignmentId).toEqual(result.results[0].assignment.assignmentId);
    expect(officiatingEngine.getOfficialAssignments({}).assignments).toHaveLength(0);
  });

  it('a pipe key absent from the previous result leaves the explicit param in place', () => {
    createTestRecord({ personId: 'person-pipe', officialRecordId: 'rec-pipe' });

    // assignOfficial returns no top-level tournamentId, so the filter given here must survive the pipe
    let result: any = officiatingEngine.executionQueue([
      {
        method: 'assignOfficial',
        params: { tournamentId: 'tournament-pipe', roleSubtype: 'CHAIR_UMPIRE' },
      },
      {
        method: 'getOfficialAssignments',
        params: { tournamentId: 'tournament-other' },
        pipe: { tournamentId: true },
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.results[1].assignments).toHaveLength(0);
    expect(officiatingEngine.getOfficialAssignments({}).assignments).toHaveLength(1);
  });

  it('every creator returns the id of what it created at the top level, for a pipe to carry', () => {
    let result: any = createTestRecord({ personId: 'person-ids', officialRecordId: 'rec-ids' });
    expect(result.officialRecordId).toEqual('rec-ids');

    const created: [string, any, string, string][] = [
      [
        'addCertification',
        { organisationId: 'org-001', certificationFamily: 'UMPIRE' },
        'certification',
        'certificationId',
      ],
      ['addEvaluation', { evaluatorPersonId: 'evaluator-001', overallRating: 4 }, 'evaluation', 'evaluationId'],
      ['assignOfficial', { tournamentId: 'tournament-ids', roleSubtype: 'CHAIR_UMPIRE' }, 'assignment', 'assignmentId'],
      ['addSuspension', { suspendedFrom: '2026-01-01', suspendedUntil: '2026-06-30' }, 'suspension', 'suspensionId'],
      ['addConflictDeclaration', { personId: 'person-042', relationship: 'COACH' }, 'declaration', 'declarationId'],
      [
        'addCertificationRequirement',
        {
          organisationId: 'org-001',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'BRONZE_BADGE',
          requirements: [{ itemId: 'r1', description: 'Training course', required: true }],
        },
        'certificationRequirement',
        'requirementId',
      ],
    ];
    for (const [method, params, entityKey, idKey] of created) {
      result = (officiatingEngine as any)[method](params);
      expect(result.success, method).toBe(true);
      expect(result[idKey]).toBeTypeOf('string');
      expect(result[idKey]).toEqual(result[entityKey][idKey]);
    }
  });

  it('rejects non-object directive in array', () => {
    let result: any = officiatingEngine.executionQueue([42 as any]);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toContain('directive must be an object');
  });

  it('returns error without rollback when rollbackOnError is falsy', () => {
    createTestRecord({ personId: 'person-norb', officialRecordId: 'rec-norb' });

    let result: any = officiatingEngine.executionQueue(
      [
        {
          method: 'addCertification',
          params: { organisationId: 'org-001', certificationFamily: 'UMPIRE' },
        },
        {
          method: 'transitionCertificationStatus',
          params: { certificationId: 'nonexistent', toStatus: CERT_EXPIRED },
        },
      ],
      false,
    );

    expect(result.error).toEqual(CERTIFICATION_NOT_FOUND);
    expect(result.rolledBack).toBe(false);

    // State should NOT be rolled back — certification from first directive should persist
    let record: any = officiatingEngine.getOfficialRecord({ officialRecordId: 'rec-norb' });
    expect(record.officialRecord.certifications).toHaveLength(1);
  });
});

describe('Officiating Engine — Methods Registration', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('setOfficiatingMethods registers functions and getOfficiatingMethods retrieves them', () => {
    let methods: any = getOfficiatingMethods();
    expect(Object.keys(methods)).toHaveLength(0);

    const customMethod = () => 'custom';
    let result: any = setOfficiatingMethods({
      myMethod: customMethod,
      notAFunction: 'string-value',
    });
    expect(result.success).toBe(true);

    methods = getOfficiatingMethods();
    expect(methods.myMethod).toBe(customMethod);
    expect(methods.myMethod()).toBe('custom');
    // Non-function values should not be registered
    expect(methods.notAFunction).toBeUndefined();
  });
});

/**
 * Governor ↔ engine exposure guard.
 *
 * The officiating engine is a HAND-AUTHORED object literal, so adding a method to the governor does
 * NOT expose it on the engine. That split has already bitten once: factory 6.25.0 shipped the
 * conflict-of-interest methods on the governor (which CFS imports) but not on the engine — and
 * courthive-ams drives every officiating operation through a generic `engine[method]` passthrough, so
 * the whole feature was unreachable while every existing test stayed green.
 *
 * Anything deliberately NOT exposed must be listed in NOT_ON_ENGINE with a reason, so the omission is
 * a decision on the record rather than an oversight.
 */
const NOT_ON_ENGINE: Record<string, string> = {
  // Belongs on `tournamentEngine`, NOT here — it needs a tournamentRecord + drawDefinition, which this
  // engine's state does not hold (this is an OfficialRecord aggregate). It IS already exposed on
  // tournamentEngine, which resolves both from engine state given a drawId, so this is a placement
  // decision rather than an absence. Verified empirically, not assumed.
  getMatchUpOfficialConflicts: 'lives on tournamentEngine — needs tournament state, not OfficialRecord state',
  // Pure status-transition validator, consumed directly rather than as an engine operation.
  // (`validateCertification` IS on the engine — this guard caught that on its first run.)
  validateOfficiatingStatusTransition: 'pure validator, consumed directly',
  // Engine exposes this as `queryOfficialRecord`'s underlying getter via getState/resolveRecord.
  queryOfficialRecord: 'engine exposes record access via getState / resolveRecord',
};

describe('Officiating governor ↔ engine exposure', () => {
  const governorMethods = Object.entries(officiatingGovernor as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);

  it('finds governor methods to check', () => {
    expect(governorMethods.length).toBeGreaterThan(10);
  });

  it('every governor method is on the engine, or explicitly excluded with a reason', () => {
    const missing = governorMethods.filter(
      (name) => typeof (officiatingEngine as any)[name] !== 'function' && !NOT_ON_ENGINE[name],
    );
    expect(missing).toEqual([]);
  });

  it('the exclusion list has no stale entries', () => {
    // An excluded name that IS on the engine means the list is lying about the surface.
    const contradictory = Object.keys(NOT_ON_ENGINE).filter(
      (name) => typeof (officiatingEngine as any)[name] === 'function',
    );
    expect(contradictory).toEqual([]);
  });
});

describe('Officiating Engine — Conflict of Interest', () => {
  beforeEach(() => {
    officiatingEngine.reset();
  });

  it('adds, evaluates and removes a conflict declaration through the engine', () => {
    // This is the path courthive-ams uses: engine[method] against the active record.
    const created: any = createTestRecord();
    const officialRecordId = created.officialRecord.officialRecordId;

    let result: any = officiatingEngine.addConflictDeclaration({
      officialRecordId,
      personId: 'person-042',
      relationship: 'COACH',
    });
    expect(result.success).toBe(true);
    const declarationId = result.declaration.declarationId;

    // Evaluate against a participant matching the declaration.
    result = officiatingEngine.getOfficialConflicts({
      officialRecordId,
      participants: [{ participantId: 'par-1', person: { personId: 'person-042' } }],
      policyDefinitions: {
        officiatingConflict: {
          conflictRules: { DECLARED_RELATIONSHIP: { enabled: true, severity: CONFLICT_BLOCK } },
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.blocked).toBe(true);

    result = officiatingEngine.removeConflictDeclaration({ officialRecordId, declarationId });
    expect(result.success).toBe(true);

    const state: any = officiatingEngine.getState();
    expect(state.officialRecords[officialRecordId].conflictDeclarations).toHaveLength(0);
  });
});
