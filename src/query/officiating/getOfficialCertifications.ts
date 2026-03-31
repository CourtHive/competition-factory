// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialCertification } from '@Types/officiatingTypes';

type GetOfficialCertificationsArgs = {
  officialRecord: OfficialRecord;
  certificationFamily?: string;
  certificationLevel?: string;
  organisationId?: string;
  activeOnly?: boolean;
};

export function getOfficialCertifications({
  officialRecord,
  certificationFamily,
  certificationLevel,
  organisationId,
  activeOnly,
}: GetOfficialCertificationsArgs): {
  error?: any;
  success?: boolean;
  certifications?: OfficialCertification[];
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  let certifications = [...officialRecord.certifications];

  if (certificationFamily) {
    certifications = certifications.filter((c) => c.certificationFamily === certificationFamily);
  }
  if (certificationLevel) {
    certifications = certifications.filter((c) => c.certificationLevel === certificationLevel);
  }
  if (organisationId) {
    certifications = certifications.filter((c) => c.organisationId === organisationId);
  }
  if (activeOnly) {
    certifications = certifications.filter((c) => c.status === 'ACTIVE');
  }

  return { ...SUCCESS, certifications };
}
