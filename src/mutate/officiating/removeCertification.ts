// Constants
import { MISSING_OFFICIAL_RECORD, CERTIFICATION_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type RemoveCertificationArgs = {
  officialRecord: OfficialRecord;
  certificationId: string;
};

export function removeCertification({ officialRecord, certificationId }: RemoveCertificationArgs) {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!certificationId) return { error: INVALID_VALUES, context: { message: 'Missing certificationId' } } as any;

  const index = officialRecord.certifications.findIndex((c) => c.certificationId === certificationId);
  if (index === -1) return { error: CERTIFICATION_NOT_FOUND, context: { certificationId } };

  officialRecord.certifications.splice(index, 1);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS };
}
