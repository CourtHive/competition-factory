// Constants
import { MISSING_OFFICIAL_RECORD, CERTIFICATION_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialCertification } from '@Types/officiatingTypes';

type ModifyCertificationArgs = {
  officialRecord: OfficialRecord;
  certificationId: string;
  updates: Partial<
    Pick<
      OfficialCertification,
      'certificationLevel' | 'validFrom' | 'validUntil' | 'documentReferences' | 'notes' | 'extensions'
    >
  >;
};

export function modifyCertification({
  officialRecord,
  certificationId,
  updates,
}: ModifyCertificationArgs): { error?: any; certification?: OfficialCertification; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!certificationId) return { error: INVALID_VALUES, context: { message: 'Missing certificationId' } } as any;

  const certification = officialRecord.certifications.find((c) => c.certificationId === certificationId);
  if (!certification) return { error: CERTIFICATION_NOT_FOUND, context: { certificationId } } as any;

  if (updates.certificationLevel !== undefined) certification.certificationLevel = updates.certificationLevel;
  if (updates.validFrom !== undefined) certification.validFrom = updates.validFrom;
  if (updates.validUntil !== undefined) certification.validUntil = updates.validUntil;
  if (updates.documentReferences !== undefined) certification.documentReferences = updates.documentReferences;
  if (updates.notes !== undefined) certification.notes = updates.notes;
  if (updates.extensions !== undefined) certification.extensions = updates.extensions;

  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS, certification };
}
