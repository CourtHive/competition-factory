import { validateStatusTransition } from '@Validators/sanctioning/validateStatusTransition';
import { describe, expect, it } from 'vitest';

// Constants
import { POLICY_TYPE_SANCTIONING } from '@Constants/policyConstants';
import {
  APPROVED,
  ACTIVE,
  CLOSED,
  CONDITIONALLY_APPROVED,
  DRAFT,
  ISSUES_FLAGGED,
  MODIFICATION_REQUESTED,
  POST_EVENT,
  REJECTED,
  SUBMITTED,
  UNDER_REVIEW,
  WITHDRAWN,
  VALID_STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  EDITABLE_STATUSES,
  AMENDABLE_STATUSES,
} from '@Constants/sanctioningConstants';

// Types
import type { SanctioningStatus } from '@Types/sanctioningTypes';
import {
  SanctioningStatusEnum,
  EndorsementStatusEnum,
  AmendmentStatusEnum,
  ComplianceStatusEnum,
  ComplianceItemStatusEnum,
  SanctioningRelationshipEnum,
  AmendmentSeverityEnum,
  ComplianceItemTypeEnum,
} from '@Types/sanctioningTypes';

describe('Sanctioning Types & Constants', () => {
  it('defines all sanctioning status values', () => {
    expect(SanctioningStatusEnum.DRAFT).toEqual('DRAFT');
    expect(SanctioningStatusEnum.SUBMITTED).toEqual('SUBMITTED');
    expect(SanctioningStatusEnum.UNDER_REVIEW).toEqual('UNDER_REVIEW');
    expect(SanctioningStatusEnum.APPROVED).toEqual('APPROVED');
    expect(SanctioningStatusEnum.CONDITIONALLY_APPROVED).toEqual('CONDITIONALLY_APPROVED');
    expect(SanctioningStatusEnum.REJECTED).toEqual('REJECTED');
    expect(SanctioningStatusEnum.WITHDRAWN).toEqual('WITHDRAWN');
    expect(SanctioningStatusEnum.MODIFICATION_REQUESTED).toEqual('MODIFICATION_REQUESTED');
    expect(SanctioningStatusEnum.ACTIVE).toEqual('ACTIVE');
    expect(SanctioningStatusEnum.POST_EVENT).toEqual('POST_EVENT');
    expect(SanctioningStatusEnum.CLOSED).toEqual('CLOSED');
    expect(SanctioningStatusEnum.ISSUES_FLAGGED).toEqual('ISSUES_FLAGGED');
    expect(Object.keys(SanctioningStatusEnum)).toHaveLength(12);
  });

  it('defines endorsement status values', () => {
    expect(EndorsementStatusEnum.PENDING).toEqual('PENDING');
    expect(EndorsementStatusEnum.ENDORSED).toEqual('ENDORSED');
    expect(EndorsementStatusEnum.DECLINED).toEqual('DECLINED');
    expect(EndorsementStatusEnum.NOT_REQUIRED).toEqual('NOT_REQUIRED');
  });

  it('defines amendment status values', () => {
    expect(AmendmentStatusEnum.PROPOSED).toEqual('PROPOSED');
    expect(AmendmentStatusEnum.UNDER_REVIEW).toEqual('UNDER_REVIEW');
    expect(AmendmentStatusEnum.APPROVED).toEqual('APPROVED');
    expect(AmendmentStatusEnum.REJECTED).toEqual('REJECTED');
  });

  it('defines compliance status values', () => {
    expect(ComplianceStatusEnum.NOT_APPLICABLE).toEqual('NOT_APPLICABLE');
    expect(ComplianceStatusEnum.PENDING).toEqual('PENDING');
    expect(ComplianceStatusEnum.IN_PROGRESS).toEqual('IN_PROGRESS');
    expect(ComplianceStatusEnum.COMPLIANT).toEqual('COMPLIANT');
    expect(ComplianceStatusEnum.ISSUES_FLAGGED).toEqual('ISSUES_FLAGGED');
  });

  it('defines compliance item status values', () => {
    expect(ComplianceItemStatusEnum.PENDING).toEqual('PENDING');
    expect(ComplianceItemStatusEnum.SUBMITTED).toEqual('SUBMITTED');
    expect(ComplianceItemStatusEnum.VERIFIED).toEqual('VERIFIED');
    expect(ComplianceItemStatusEnum.OVERDUE).toEqual('OVERDUE');
    expect(ComplianceItemStatusEnum.WAIVED).toEqual('WAIVED');
  });

  it('defines compliance item type values', () => {
    expect(ComplianceItemTypeEnum.RESULTS_SUBMISSION).toEqual('RESULTS_SUBMISSION');
    expect(ComplianceItemTypeEnum.FINANCIAL_RECONCILIATION).toEqual('FINANCIAL_RECONCILIATION');
    expect(ComplianceItemTypeEnum.INCIDENT_REPORT).toEqual('INCIDENT_REPORT');
    expect(ComplianceItemTypeEnum.PRIZE_MONEY_CONFIRMATION).toEqual('PRIZE_MONEY_CONFIRMATION');
    expect(ComplianceItemTypeEnum.SANCTION_FEE_PAYMENT).toEqual('SANCTION_FEE_PAYMENT');
    expect(ComplianceItemTypeEnum.SUPERVISOR_REPORT).toEqual('SUPERVISOR_REPORT');
    expect(ComplianceItemTypeEnum.FACILITY_REPORT).toEqual('FACILITY_REPORT');
    expect(ComplianceItemTypeEnum.SAFEGUARDING_REPORT).toEqual('SAFEGUARDING_REPORT');
    expect(ComplianceItemTypeEnum.CUSTOM).toEqual('CUSTOM');
  });

  it('defines sanctioning relationship values', () => {
    expect(SanctioningRelationshipEnum.PRIMARY).toEqual('PRIMARY');
    expect(SanctioningRelationshipEnum.SECONDARY).toEqual('SECONDARY');
    expect(SanctioningRelationshipEnum.INDEPENDENT).toEqual('INDEPENDENT');
  });

  it('defines amendment severity values', () => {
    expect(AmendmentSeverityEnum.MINOR).toEqual('MINOR');
    expect(AmendmentSeverityEnum.SUBSTANTIAL).toEqual('SUBSTANTIAL');
  });

  it('exports POLICY_TYPE_SANCTIONING constant', () => {
    expect(POLICY_TYPE_SANCTIONING).toEqual('sanctioning');
  });
});

describe('Sanctioning Status Constants', () => {
  it('exports status string constants', () => {
    expect(DRAFT).toEqual('DRAFT');
    expect(SUBMITTED).toEqual('SUBMITTED');
    expect(UNDER_REVIEW).toEqual('UNDER_REVIEW');
    expect(APPROVED).toEqual('APPROVED');
    expect(CONDITIONALLY_APPROVED).toEqual('CONDITIONALLY_APPROVED');
    expect(REJECTED).toEqual('REJECTED');
    expect(WITHDRAWN).toEqual('WITHDRAWN');
    expect(MODIFICATION_REQUESTED).toEqual('MODIFICATION_REQUESTED');
    expect(ACTIVE).toEqual('ACTIVE');
    expect(POST_EVENT).toEqual('POST_EVENT');
    expect(CLOSED).toEqual('CLOSED');
    expect(ISSUES_FLAGGED).toEqual('ISSUES_FLAGGED');
  });

  it('defines terminal statuses', () => {
    expect(TERMINAL_STATUSES).toContain(REJECTED);
    expect(TERMINAL_STATUSES).toContain(WITHDRAWN);
    expect(TERMINAL_STATUSES).toContain(CLOSED);
    expect(TERMINAL_STATUSES).toHaveLength(3);
  });

  it('defines editable statuses', () => {
    expect(EDITABLE_STATUSES).toContain(DRAFT);
    expect(EDITABLE_STATUSES).toContain(MODIFICATION_REQUESTED);
    expect(EDITABLE_STATUSES).toHaveLength(2);
  });

  it('defines amendable statuses', () => {
    expect(AMENDABLE_STATUSES).toContain(APPROVED);
    expect(AMENDABLE_STATUSES).toContain(ACTIVE);
    expect(AMENDABLE_STATUSES).toHaveLength(2);
  });

  it('defines valid transitions for every status', () => {
    const allStatuses = Object.keys(SanctioningStatusEnum);
    const transitionKeys = Object.keys(VALID_STATUS_TRANSITIONS);
    for (const status of allStatuses) {
      expect(transitionKeys).toContain(status);
    }
  });
});

describe('Status Transition Validation', () => {
  // --- valid transitions ---
  const validTransitions: [SanctioningStatus, SanctioningStatus][] = [
    [DRAFT, SUBMITTED],
    [DRAFT, WITHDRAWN],
    [SUBMITTED, UNDER_REVIEW],
    [SUBMITTED, WITHDRAWN],
    [UNDER_REVIEW, APPROVED],
    [UNDER_REVIEW, CONDITIONALLY_APPROVED],
    [UNDER_REVIEW, REJECTED],
    [UNDER_REVIEW, MODIFICATION_REQUESTED],
    [APPROVED, ACTIVE],
    [APPROVED, MODIFICATION_REQUESTED],
    [APPROVED, WITHDRAWN],
    [CONDITIONALLY_APPROVED, APPROVED],
    [CONDITIONALLY_APPROVED, REJECTED],
    [CONDITIONALLY_APPROVED, WITHDRAWN],
    [MODIFICATION_REQUESTED, SUBMITTED],
    [MODIFICATION_REQUESTED, WITHDRAWN],
    [ACTIVE, POST_EVENT],
    [POST_EVENT, CLOSED],
    [POST_EVENT, ISSUES_FLAGGED],
    [ISSUES_FLAGGED, CLOSED],
  ];

  it.each(validTransitions)('allows transition from %s to %s', (from, to) => {
    let result: any = validateStatusTransition({ fromStatus: from, toStatus: to });
    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  // --- invalid transitions ---
  const invalidTransitions: [SanctioningStatus, SanctioningStatus][] = [
    [DRAFT, APPROVED],
    [DRAFT, UNDER_REVIEW],
    [SUBMITTED, APPROVED],
    [SUBMITTED, DRAFT],
    [UNDER_REVIEW, DRAFT],
    [UNDER_REVIEW, ACTIVE],
    [APPROVED, DRAFT],
    [APPROVED, REJECTED],
    [REJECTED, DRAFT],
    [REJECTED, APPROVED],
    [WITHDRAWN, DRAFT],
    [WITHDRAWN, SUBMITTED],
    [CLOSED, DRAFT],
    [CLOSED, APPROVED],
    [ACTIVE, DRAFT],
    [ACTIVE, APPROVED],
    [POST_EVENT, ACTIVE],
    [POST_EVENT, DRAFT],
  ];

  it.each(invalidTransitions)('rejects transition from %s to %s', (from, to) => {
    let result: any = validateStatusTransition({ fromStatus: from, toStatus: to });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_INVALID_STATUS_TRANSITION');
    expect(result.context).toBeDefined();
  });

  it('rejects transition from unknown status', () => {
    let result: any = validateStatusTransition({
      fromStatus: 'BOGUS' as SanctioningStatus,
      toStatus: SUBMITTED,
    });
    expect(result.error).toBeDefined();
    expect(result.error.code).toEqual('ERR_INVALID_STATUS_TRANSITION');
  });

  it('terminal statuses have no valid transitions', () => {
    for (const status of TERMINAL_STATUSES) {
      const targets = VALID_STATUS_TRANSITIONS[status];
      expect(targets).toHaveLength(0);
    }
  });
});
