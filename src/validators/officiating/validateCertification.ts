// Constants
import { MISSING_OFFICIAL_RECORD, CERTIFICATION_NOT_FOUND, CERTIFICATION_EXPIRED } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialCertification } from '@Types/officiatingTypes';

type ValidateCertificationArgs = {
  officialRecord: OfficialRecord;
  certificationId: string;
  asOfDate?: string;
};

export function validateCertification({
  officialRecord,
  certificationId,
  asOfDate,
}: ValidateCertificationArgs): {
  error?: any;
  success?: boolean;
  valid?: boolean;
  certification?: OfficialCertification;
  reasons?: string[];
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!certificationId) return { error: INVALID_VALUES, context: { message: 'Missing certificationId' } } as any;

  const certification = officialRecord.certifications.find((c) => c.certificationId === certificationId);
  if (!certification) return { error: CERTIFICATION_NOT_FOUND, context: { certificationId } } as any;

  const reasons: string[] = [];
  const checkDate = asOfDate ?? new Date().toISOString().split('T')[0];

  if (certification.status !== 'ACTIVE') {
    reasons.push(`Certification status is ${certification.status}`);
  }

  if (certification.validUntil && certification.validUntil < checkDate) {
    reasons.push(`Certification expired on ${certification.validUntil}`);
  }

  if (certification.validFrom && certification.validFrom > checkDate) {
    reasons.push(`Certification not yet valid until ${certification.validFrom}`);
  }

  const valid = reasons.length === 0;

  if (!valid && certification.validUntil && certification.validUntil < checkDate) {
    return { error: CERTIFICATION_EXPIRED, valid, certification, reasons };
  }

  return { ...SUCCESS, valid, certification, reasons };
}
