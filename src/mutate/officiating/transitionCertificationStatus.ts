import { transitionRecordStatus } from '@Functions/declaration/transitionRecordStatus';

// constants and types
import {
  MISSING_OFFICIAL_RECORD,
  CERTIFICATION_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_CERTIFICATION_TRANSITIONS,
} from '@Constants/officiatingConstants';
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
  return transitionRecordStatus({
    record: officialRecord,
    collectionKey: 'certifications',
    idKey: 'certificationId',
    entityId: certificationId,
    toStatus,
    transitionedBy,
    reason,
    machineDef: VALID_CERTIFICATION_TRANSITIONS,
    resultKey: 'certification',
    errors: {
      missingRecord: MISSING_OFFICIAL_RECORD,
      notFound: CERTIFICATION_NOT_FOUND,
      invalidTransition: INVALID_OFFICIATING_STATUS_TRANSITION,
    },
  });
}
