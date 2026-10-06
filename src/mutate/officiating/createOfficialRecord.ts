import { nowIso } from '@Tools/clock';
import { UUID } from '@Tools/UUID';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { OfficialRecord } from '@Types/officiatingTypes';

type CreateOfficialRecordArgs = {
  officialRecordId?: string;
  personId: string;
  organisationId?: string;
  extensions?: any[];
};

export function createOfficialRecord({
  officialRecordId,
  personId,
  organisationId,
  extensions,
}: CreateOfficialRecordArgs): {
  error?: any;
  context?: { message: string };
  officialRecord?: OfficialRecord;
  success?: boolean;
} {
  if (!personId) return { error: INVALID_VALUES, context: { message: 'Missing personId' } };

  const now = nowIso();

  const officialRecord: OfficialRecord = {
    officialRecordId: officialRecordId || UUID(),
    personId,
    organisationId,
    certifications: [],
    evaluations: [],
    assignments: [],
    suspensions: [],
    certificationRequirements: [],
    evaluationPolicies: [],
    createdAt: now,
    updatedAt: now,
    extensions: extensions ?? [],
  };

  return { ...SUCCESS, officialRecord };
}
