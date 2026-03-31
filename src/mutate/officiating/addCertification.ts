import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD, CERT_ACTIVE } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialCertification } from '@Types/officiatingTypes';

type AddCertificationArgs = {
  officialRecord: OfficialRecord;
  certificationId?: string;
  personId?: string;
  organisationId: string;
  certificationFamily: string;
  certificationLevel?: string;
  status?: string;
  validFrom?: string;
  validUntil?: string;
  documentReferences?: any[];
  notes?: string;
  extensions?: any[];
};

export function addCertification({
  officialRecord,
  certificationId,
  organisationId,
  certificationFamily,
  certificationLevel,
  status,
  validFrom,
  validUntil,
  documentReferences,
  notes,
  extensions,
}: AddCertificationArgs): { error?: any; certification?: OfficialCertification; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!organisationId) return { error: INVALID_VALUES, context: { message: 'Missing organisationId' } } as any;
  if (!certificationFamily)
    return { error: INVALID_VALUES, context: { message: 'Missing certificationFamily' } } as any;

  const now = new Date().toISOString();

  const certification: OfficialCertification = {
    certificationId: certificationId || UUID(),
    personId: officialRecord.personId,
    organisationId,
    certificationFamily,
    certificationLevel,
    status: (status as any) ?? CERT_ACTIVE,
    validFrom,
    validUntil,
    documentReferences: documentReferences ?? [],
    notes,
    statusHistory: [
      {
        fromStatus: (status as any) ?? CERT_ACTIVE,
        toStatus: (status as any) ?? CERT_ACTIVE,
        transitionedAt: now,
        reason: 'Certification created',
      },
    ],
    extensions: extensions ?? [],
  };

  officialRecord.certifications.push(certification);
  officialRecord.updatedAt = now;

  return { ...SUCCESS, certification };
}
