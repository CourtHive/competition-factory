import { validateOfficiatingStatusTransition } from '@Validators/officiating/validateOfficiatingStatusTransition';
import { validateCertification } from '@Validators/officiating/validateCertification';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { describe, expect, it } from 'vitest';
import {
  INVALID_OFFICIATING_STATUS_TRANSITION,
  CERTIFICATION_NOT_FOUND,
  MISSING_OFFICIAL_RECORD,
  CERTIFICATION_EXPIRED,
  CERT_ACTIVE,
  CERT_SUSPENDED,
  CERT_EXPIRED,
  EVAL_DRAFT,
  EVAL_SUBMITTED,
  ASSIGN_PROPOSED,
  ASSIGN_CONFIRMED,
  CERT_REVOKED,
  EVAL_APPROVED,
  ASSIGN_COMPLETED,
  EVAL_REJECTED,
  ASSIGN_DECLINED,
} from '@Constants/officiatingConstants';

// types
import type { OfficialRecord } from '@Types/officiatingTypes';

function makeRecord(certifications: any[] = []): OfficialRecord {
  return {
    officialRecordId: 'rec-001',
    personId: 'person-001',
    certifications,
    evaluations: [],
    assignments: [],
    suspensions: [],
    certificationRequirements: [],
    evaluationPolicies: [],
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
  };
}

function makeCert(overrides: any = {}) {
  return {
    certificationId: 'cert-001',
    personId: 'person-001',
    organisationId: 'org-001',
    certificationFamily: 'UMPIRE',
    status: CERT_ACTIVE,
    ...overrides,
  };
}

describe('validateCertification', () => {
  it('returns error when officialRecord is missing', () => {
    let result: any = validateCertification({
      officialRecord: undefined as any,
      certificationId: 'cert-001',
    });
    expect(result.error).toEqual(MISSING_OFFICIAL_RECORD);
  });

  it('returns error when certificationId is missing', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord(),
      certificationId: '' as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toBe('Missing certificationId');
  });

  it('returns error when certification is not found', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ certificationId: 'other-cert' })]),
      certificationId: 'cert-missing',
    });
    expect(result.error).toEqual(CERTIFICATION_NOT_FOUND);
    expect(result.context.certificationId).toBe('cert-missing');
  });

  it('returns valid for ACTIVE certification within date range', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ validFrom: '2025-01-01', validUntil: '2027-12-31' })]),
      certificationId: 'cert-001',
      asOfDate: '2026-06-15',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.certification.certificationId).toBe('cert-001');
  });

  it('returns invalid with reason when status is not ACTIVE', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ status: CERT_SUSPENDED })]),
      certificationId: 'cert-001',
      asOfDate: '2026-06-15',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Certification status is SUSPENDED');
  });

  it('returns CERTIFICATION_EXPIRED error when validUntil is before checkDate', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ validUntil: '2024-12-31' })]),
      certificationId: 'cert-001',
      asOfDate: '2025-06-01',
    });
    expect(result.error).toEqual(CERTIFICATION_EXPIRED);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Certification expired on 2024-12-31');
  });

  it('returns invalid with reason when validFrom is after checkDate', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ validFrom: '2027-01-01' })]),
      certificationId: 'cert-001',
      asOfDate: '2026-06-15',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Certification not yet valid until 2027-01-01');
  });

  it('collects multiple reasons when status is not ACTIVE and expired', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ status: CERT_EXPIRED, validUntil: '2024-12-31' })]),
      certificationId: 'cert-001',
      asOfDate: '2025-06-01',
    });
    expect(result.error).toEqual(CERTIFICATION_EXPIRED);
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBe(2);
    expect(result.reasons).toContain('Certification status is EXPIRED');
    expect(result.reasons).toContain('Certification expired on 2024-12-31');
  });

  it('uses current date when asOfDate is not provided', () => {
    const futureDate = '2099-12-31';
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert({ validFrom: '2020-01-01', validUntil: futureDate })]),
      certificationId: 'cert-001',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns valid for ACTIVE certification with no date bounds', () => {
    let result: any = validateCertification({
      officialRecord: makeRecord([makeCert()]),
      certificationId: 'cert-001',
      asOfDate: '2026-06-15',
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('validateOfficiatingStatusTransition', () => {
  it('allows valid certification transition ACTIVE → SUSPENDED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'certification',
      fromStatus: CERT_ACTIVE,
      toStatus: CERT_SUSPENDED,
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('allows valid evaluation transition DRAFT → SUBMITTED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'evaluation',
      fromStatus: EVAL_DRAFT,
      toStatus: EVAL_SUBMITTED,
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('allows valid assignment transition PROPOSED → CONFIRMED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'assignment',
      fromStatus: ASSIGN_PROPOSED,
      toStatus: ASSIGN_CONFIRMED,
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('rejects unknown entityType', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'unknown' as any,
      fromStatus: CERT_ACTIVE,
      toStatus: CERT_EXPIRED,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toContain('Unknown entityType');
  });

  it('rejects unknown fromStatus for certification', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'certification',
      fromStatus: 'BOGUS',
      toStatus: CERT_ACTIVE,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.fromStatus).toBe('BOGUS');
    expect(result.context.message).toContain('Unknown status');
  });

  it('rejects invalid certification transition REVOKED → ACTIVE', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'certification',
      fromStatus: CERT_REVOKED,
      toStatus: CERT_ACTIVE,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.validTargets).toEqual([]);
  });

  it('rejects invalid evaluation transition DRAFT → APPROVED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'evaluation',
      fromStatus: EVAL_DRAFT,
      toStatus: EVAL_APPROVED,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.fromStatus).toBe(EVAL_DRAFT);
    expect(result.context.toStatus).toBe(EVAL_APPROVED);
  });

  it('rejects invalid assignment transition COMPLETED → PROPOSED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'assignment',
      fromStatus: ASSIGN_COMPLETED,
      toStatus: ASSIGN_PROPOSED,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.validTargets).toEqual([]);
  });

  it('allows evaluation REJECTED → DRAFT', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'evaluation',
      fromStatus: EVAL_REJECTED,
      toStatus: EVAL_DRAFT,
    });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('rejects transition from terminal assignment state DECLINED', () => {
    let result: any = validateOfficiatingStatusTransition({
      entityType: 'assignment',
      fromStatus: ASSIGN_DECLINED,
      toStatus: ASSIGN_CONFIRMED,
    });
    expect(result.error).toEqual(INVALID_OFFICIATING_STATUS_TRANSITION);
    expect(result.context.validTargets).toEqual([]);
  });
});
