import { MISSING_EVALUATION_POLICY, MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { describe, expect, it } from 'vitest';

import { POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE } from '@Fixtures/policies/POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE';

import { getOfficialCertifications } from '@Query/officiating/getOfficialCertifications';
import { getOfficialAssignments } from '@Query/officiating/getOfficialAssignments';
import { getOfficialEligibility } from '@Query/officiating/getOfficialEligibility';
import { getEvaluationTemplate } from '@Query/officiating/getEvaluationTemplate';
import { getEvaluationSummary } from '@Query/officiating/getEvaluationSummary';
import { getEvaluations } from '@Query/officiating/getEvaluations';

import type { OfficialRecord } from '@Types/officiatingTypes';

function makeRecord(overrides?: Partial<OfficialRecord>): OfficialRecord {
  return {
    officialRecordId: 'rec-001',
    personId: 'person-001',
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

// ---------------------------------------------------------------------------
// getEvaluations
// ---------------------------------------------------------------------------
describe('getEvaluations', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = getEvaluations({ officialRecord: undefined as any });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
    expect(result.success).toBeUndefined();
  });

  it('returns all evaluations with no filters', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'APPROVED', scores: [] },
        { evaluationId: 'e2', evaluatorPersonId: 'ev2', subjectPersonId: 'p1', evaluationDate: '2025-07-01', overallRating: 3, status: 'DRAFT', scores: [] },
      ],
    });
    let result: any = getEvaluations({ officialRecord: record });
    expect(result.success).toBe(true);
    expect(result.evaluations).toHaveLength(2);
  });

  it('filters by evaluatorPersonId', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'APPROVED', scores: [] },
        { evaluationId: 'e2', evaluatorPersonId: 'ev2', subjectPersonId: 'p1', evaluationDate: '2025-07-01', overallRating: 3, status: 'APPROVED', scores: [] },
      ],
    });
    let result: any = getEvaluations({ officialRecord: record, evaluatorPersonId: 'ev1' });
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0].evaluationId).toBe('e1');
  });

  it('filters by status, tournamentId, and policyName simultaneously', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'APPROVED', tournamentId: 't1', policyName: 'POL_A', scores: [] },
        { evaluationId: 'e2', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-07-01', overallRating: 3, status: 'DRAFT', tournamentId: 't1', policyName: 'POL_A', scores: [] },
        { evaluationId: 'e3', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-08-01', overallRating: 5, status: 'APPROVED', tournamentId: 't2', policyName: 'POL_A', scores: [] },
      ],
    });
    let result: any = getEvaluations({ officialRecord: record, status: 'APPROVED', tournamentId: 't1', policyName: 'POL_A' });
    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0].evaluationId).toBe('e1');
  });

  it('returns empty array when no evaluations match filters', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'APPROVED', scores: [] },
      ],
    });
    let result: any = getEvaluations({ officialRecord: record, status: 'DRAFT' });
    expect(result.success).toBe(true);
    expect(result.evaluations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getOfficialCertifications
// ---------------------------------------------------------------------------
describe('getOfficialCertifications', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = getOfficialCertifications({ officialRecord: undefined as any });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns all certifications with no filters', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', status: 'ACTIVE' },
        { certificationId: 'c2', personId: 'p1', organisationId: 'org2', certificationFamily: 'REFEREE', status: 'EXPIRED' },
      ],
    });
    let result: any = getOfficialCertifications({ officialRecord: record });
    expect(result.success).toBe(true);
    expect(result.certifications).toHaveLength(2);
  });

  it('filters by certificationFamily, certificationLevel, organisationId, and activeOnly', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'WHITE_BADGE', status: 'ACTIVE' },
        { certificationId: 'c2', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'BRONZE_BADGE', status: 'EXPIRED' },
        { certificationId: 'c3', personId: 'p1', organisationId: 'org2', certificationFamily: 'UMPIRE', certificationLevel: 'WHITE_BADGE', status: 'ACTIVE' },
      ],
    });
    let result: any = getOfficialCertifications({
      officialRecord: record,
      certificationFamily: 'UMPIRE',
      certificationLevel: 'WHITE_BADGE',
      organisationId: 'org1',
      activeOnly: true,
    });
    expect(result.certifications).toHaveLength(1);
    expect(result.certifications[0].certificationId).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// getOfficialAssignments
// ---------------------------------------------------------------------------
describe('getOfficialAssignments', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = getOfficialAssignments({ officialRecord: undefined as any });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns all assignments with no filters', () => {
    const record = makeRecord({
      assignments: [
        { assignmentId: 'a1', personId: 'p1', tournamentId: 't1', roleSubtype: 'CHAIR_UMPIRE', status: 'PROPOSED', assignedDate: '2025-01-01' },
        { assignmentId: 'a2', personId: 'p1', tournamentId: 't2', roleSubtype: 'REFEREE', status: 'COMPLETED', assignedDate: '2025-02-01' },
      ],
    });
    let result: any = getOfficialAssignments({ officialRecord: record });
    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(2);
  });

  it('filters by tournamentId, roleSubtype, and status', () => {
    const record = makeRecord({
      assignments: [
        { assignmentId: 'a1', personId: 'p1', tournamentId: 't1', roleSubtype: 'CHAIR_UMPIRE', status: 'COMPLETED', assignedDate: '2025-01-01' },
        { assignmentId: 'a2', personId: 'p1', tournamentId: 't1', roleSubtype: 'REFEREE', status: 'COMPLETED', assignedDate: '2025-02-01' },
        { assignmentId: 'a3', personId: 'p1', tournamentId: 't2', roleSubtype: 'CHAIR_UMPIRE', status: 'PROPOSED', assignedDate: '2025-03-01' },
      ],
    });
    let result: any = getOfficialAssignments({ officialRecord: record, tournamentId: 't1', roleSubtype: 'CHAIR_UMPIRE', status: 'COMPLETED' });
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].assignmentId).toBe('a1');
  });
});

// ---------------------------------------------------------------------------
// getEvaluationSummary
// ---------------------------------------------------------------------------
describe('getEvaluationSummary', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = getEvaluationSummary({ officialRecord: undefined as any });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns zero summary when no evaluations exist', () => {
    const record = makeRecord();
    let result: any = getEvaluationSummary({ officialRecord: record });
    expect(result.success).toBe(true);
    expect(result.summary.evaluationCount).toBe(0);
    expect(result.summary.averageRating).toBe(0);
  });

  it('returns zero summary when no approved evaluations exist and approvedOnly is true', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 5, status: 'DRAFT', scores: [] },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record });
    expect(result.summary.evaluationCount).toBe(0);
    expect(result.summary.averageRating).toBe(0);
  });

  it('includes non-approved evaluations when approvedOnly is false', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'DRAFT', scores: [] },
        { evaluationId: 'e2', evaluatorPersonId: 'ev2', subjectPersonId: 'p1', evaluationDate: '2025-07-01', overallRating: 2, status: 'SUBMITTED', scores: [] },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record, approvedOnly: false });
    expect(result.summary.evaluationCount).toBe(2);
    expect(result.summary.averageRating).toBe(3);
    expect(result.summary.latestRating).toBe(2);
    expect(result.summary.latestDate).toBe('2025-07-01');
  });

  it('computes average and latest from approved evaluations', () => {
    const record = makeRecord({
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-01-01', overallRating: 4, status: 'APPROVED', scores: [] },
        { evaluationId: 'e2', evaluatorPersonId: 'ev2', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 3, status: 'APPROVED', scores: [] },
        { evaluationId: 'e3', evaluatorPersonId: 'ev3', subjectPersonId: 'p1', evaluationDate: '2025-03-01', overallRating: 5, status: 'DRAFT', scores: [] },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record });
    expect(result.summary.evaluationCount).toBe(2);
    expect(result.summary.averageRating).toBe(3.5);
    expect(result.summary.latestDate).toBe('2025-06-01');
    expect(result.summary.latestRating).toBe(3);
  });

  it('computes section averages when policyName is provided', () => {
    const policy = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE;
    const record = makeRecord({
      evaluationPolicies: [policy],
      evaluations: [
        {
          evaluationId: 'e1',
          evaluatorPersonId: 'ev1',
          subjectPersonId: 'p1',
          evaluationDate: '2025-06-01',
          overallRating: 4,
          status: 'APPROVED',
          policyName: policy.policyName,
          scores: [
            { criterionId: 'rules_knowledge', sectionId: 'pre_match', value: 5 },
            { criterionId: 'court_preparation', sectionId: 'pre_match', value: 3 },
            { criterionId: 'equipment_check', sectionId: 'pre_match', value: 4 },
            { criterionId: 'score_calling', sectionId: 'match_management', value: 4 },
            { criterionId: 'overrule_accuracy', sectionId: 'match_management', value: 4 },
            { criterionId: 'time_management', sectionId: 'match_management', value: 4 },
            { criterionId: 'player_interactions', sectionId: 'match_management', value: 4 },
            { criterionId: 'scorecard_accuracy', sectionId: 'post_match', value: 5 },
          ],
        },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record, policyName: policy.policyName });
    expect(result.success).toBe(true);
    expect(result.summary.sectionAverages).toBeDefined();
    expect(result.summary.sectionAverages).toHaveLength(3);

    const preMatch = result.summary.sectionAverages.find((s: any) => s.sectionId === 'pre_match');
    expect(preMatch.average).toBe(4);

    const matchMgmt = result.summary.sectionAverages.find((s: any) => s.sectionId === 'match_management');
    expect(matchMgmt.average).toBe(4);

    expect(result.summary.meetsThreshold).toBe(true);
  });

  it('meetsThreshold is false when average is below passingThreshold', () => {
    const policy = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE;
    const record = makeRecord({
      evaluationPolicies: [policy],
      evaluations: [
        {
          evaluationId: 'e1',
          evaluatorPersonId: 'ev1',
          subjectPersonId: 'p1',
          evaluationDate: '2025-06-01',
          overallRating: 2,
          status: 'APPROVED',
          policyName: policy.policyName,
          scores: [
            { criterionId: 'rules_knowledge', sectionId: 'pre_match', value: 2 },
          ],
        },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record, policyName: policy.policyName });
    expect(result.summary.meetsThreshold).toBe(false);
  });

  it('skips section averages when policyName does not match any policy', () => {
    const record = makeRecord({
      evaluationPolicies: [],
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 4, status: 'APPROVED', policyName: 'NONEXISTENT', scores: [] },
      ],
    });
    let result: any = getEvaluationSummary({ officialRecord: record, policyName: 'NONEXISTENT' });
    expect(result.success).toBe(true);
    expect(result.summary.sectionAverages).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getEvaluationTemplate
// ---------------------------------------------------------------------------
describe('getEvaluationTemplate', () => {
  it('returns error when no policy or policyName is provided', () => {
    let result: any = getEvaluationTemplate({});
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when policyName provided but officialRecord is missing', () => {
    let result: any = getEvaluationTemplate({ policyName: 'ANY' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when policyName is not found in officialRecord policies', () => {
    const record = makeRecord({ evaluationPolicies: [] });
    let result: any = getEvaluationTemplate({ officialRecord: record, policyName: 'MISSING_POLICY' });
    expect(result.error).toEqual(MISSING_EVALUATION_POLICY);
    expect(result.context.policyName).toBe('MISSING_POLICY');
  });

  it('generates template from inline evaluationPolicy without officialRecord', () => {
    const policy = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE;
    let result: any = getEvaluationTemplate({ evaluationPolicy: policy });
    expect(result.success).toBe(true);
    expect(result.evaluationPolicy).toEqual(policy);
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('generates template from officialRecord policy by policyName', () => {
    const policy = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE;
    const record = makeRecord({ evaluationPolicies: [policy] });
    let result: any = getEvaluationTemplate({ officialRecord: record, policyName: policy.policyName });
    expect(result.success).toBe(true);
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('produces correct field structure from policy sections', () => {
    const policy = POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE;
    let result: any = getEvaluationTemplate({ evaluationPolicy: policy });

    const totalCriteria = policy.sections.reduce((sum, s) => sum + s.criteria.length, 0);
    expect(result.fields).toHaveLength(totalCriteria);

    const field = result.fields[0];
    expect(field.fieldId).toBe('pre_match.rules_knowledge');
    expect(field.sectionId).toBe('pre_match');
    expect(field.sectionName).toBe('Pre-match Preparation');
    expect(field.criterionId).toBe('rules_knowledge');
    expect(field.criterionName).toBe('Rules Knowledge');
    expect(field.scoringType).toBe('SCALE');
    expect(field.required).toBe(true);
    expect(field.weight).toBe(0.4);
    expect(field.sectionWeight).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// getOfficialEligibility
// ---------------------------------------------------------------------------
describe('getOfficialEligibility', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = getOfficialEligibility({ officialRecord: undefined as any, certificationFamily: 'UMPIRE' });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('eligible when active cert exists with no suspension', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', status: 'ACTIVE', validFrom: '2025-01-01', validUntil: '2027-12-31' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', asOfDate: '2026-06-01' });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('not eligible when suspended', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', status: 'ACTIVE' },
      ],
      suspensions: [
        { suspensionId: 's1', personId: 'p1', suspendedFrom: '2026-01-01', suspendedUntil: '2026-12-31' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', asOfDate: '2026-06-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('Official has active suspension(s)');
  });

  it('not eligible when no matching certification', () => {
    const record = makeRecord();
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'GOLD_BADGE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('No active UMPIRE GOLD_BADGE certification'))).toBe(true);
  });

  it('not eligible when matching cert is expired', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', status: 'ACTIVE', validUntil: '2020-12-31' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('Matching certification(s) are expired or not yet valid');
  });

  it('not eligible when cert is not yet valid', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', status: 'ACTIVE', validFrom: '2028-01-01' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('Matching certification(s) are expired or not yet valid');
  });

  it('filters certifications by organisationId', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org-other', certificationFamily: 'UMPIRE', status: 'ACTIVE' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', organisationId: 'org1', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('No active UMPIRE certification'))).toBe(true);
  });

  it('checks minimumAssignments requirement', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'BRONZE_BADGE', status: 'ACTIVE' },
      ],
      certificationRequirements: [
        {
          requirementId: 'req1',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'BRONZE_BADGE',
          organisationId: 'org1',
          requirements: [],
          minimumAssignments: 10,
        },
      ],
      assignments: [
        { assignmentId: 'a1', personId: 'p1', tournamentId: 't1', roleSubtype: 'CHAIR_UMPIRE', status: 'COMPLETED', assignedDate: '2025-01-01' },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'BRONZE_BADGE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('Insufficient completed assignments: 1/10'))).toBe(true);
  });

  it('checks minimumEvaluationScore requirement — no approved evaluations', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'SILVER_BADGE', status: 'ACTIVE' },
      ],
      certificationRequirements: [
        {
          requirementId: 'req1',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'SILVER_BADGE',
          organisationId: 'org1',
          requirements: [],
          minimumEvaluationScore: 4.0,
        },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'SILVER_BADGE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('No approved evaluations');
  });

  it('checks minimumEvaluationScore requirement — score below minimum', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'SILVER_BADGE', status: 'ACTIVE' },
      ],
      certificationRequirements: [
        {
          requirementId: 'req1',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'SILVER_BADGE',
          organisationId: 'org1',
          requirements: [],
          minimumEvaluationScore: 4.0,
        },
      ],
      evaluations: [
        { evaluationId: 'e1', evaluatorPersonId: 'ev1', subjectPersonId: 'p1', evaluationDate: '2025-06-01', overallRating: 3, status: 'APPROVED', scores: [] },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'SILVER_BADGE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('below minimum'))).toBe(true);
  });

  it('checks prerequisiteLevels requirement', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'GOLD_BADGE', status: 'ACTIVE' },
      ],
      certificationRequirements: [
        {
          requirementId: 'req1',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'GOLD_BADGE',
          organisationId: 'org1',
          requirements: [],
          prerequisiteLevels: ['SILVER_BADGE'],
        },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'GOLD_BADGE', asOfDate: '2026-01-01' });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('Missing prerequisite certification level: SILVER_BADGE');
  });

  it('satisfies prerequisiteLevels when an expired prereq cert exists', () => {
    const record = makeRecord({
      certifications: [
        { certificationId: 'c1', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'GOLD_BADGE', status: 'ACTIVE' },
        { certificationId: 'c2', personId: 'p1', organisationId: 'org1', certificationFamily: 'UMPIRE', certificationLevel: 'SILVER_BADGE', status: 'EXPIRED' },
      ],
      certificationRequirements: [
        {
          requirementId: 'req1',
          certificationFamily: 'UMPIRE',
          certificationLevel: 'GOLD_BADGE',
          organisationId: 'org1',
          requirements: [],
          prerequisiteLevels: ['SILVER_BADGE'],
        },
      ],
    });
    let result: any = getOfficialEligibility({ officialRecord: record, certificationFamily: 'UMPIRE', certificationLevel: 'GOLD_BADGE', asOfDate: '2026-01-01' });
    expect(result.reasons.every((r: string) => !r.includes('prerequisite'))).toBe(true);
  });
});
