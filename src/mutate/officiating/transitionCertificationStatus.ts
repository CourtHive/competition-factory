// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_OFFICIAL_RECORD,
  CERTIFICATION_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_CERTIFICATION_TRANSITIONS,
} from '@Constants/officiatingConstants';

// Types
import type { OfficialRecord, CertificationStatus, OfficialCertification } from '@Types/officiatingTypes';

type TransitionCertificationStatusArgs = {
  officialRecord: OfficialRecord;
  certificationId: string;
  toStatus: CertificationStatus;
  transitionedBy?: string;
  reason?: string;
};

export function transitionCertificationStatus({
  officialRecord,
  certificationId,
  toStatus,
  transitionedBy,
  reason,
}: TransitionCertificationStatusArgs): { error?: any; certification?: OfficialCertification; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!certificationId) return { error: INVALID_VALUES, context: { message: 'Missing certificationId' } } as any;
  if (!toStatus) return { error: INVALID_VALUES, context: { message: 'Missing toStatus' } } as any;

  const certification = officialRecord.certifications.find((c) => c.certificationId === certificationId);
  if (!certification) return { error: CERTIFICATION_NOT_FOUND, context: { certificationId } } as any;

  const validTargets = VALID_CERTIFICATION_TRANSITIONS[certification.status];
  if (!validTargets?.includes(toStatus)) {
    return {
      error: INVALID_OFFICIATING_STATUS_TRANSITION,
      context: { fromStatus: certification.status, toStatus, validTargets },
    } as any;
  }

  const now = new Date().toISOString();

  certification.statusHistory ??= [];
  certification.statusHistory.push({
    fromStatus: certification.status,
    toStatus,
    transitionedAt: now,
    transitionedBy,
    reason,
  });

  certification.status = toStatus;
  officialRecord.updatedAt = now;

  return { ...SUCCESS, certification };
}
