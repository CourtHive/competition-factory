import { UUID } from '@Tools/UUID';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
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
}: CreateOfficialRecordArgs): { error?: any; officialRecord?: OfficialRecord; success?: boolean } {
  if (!personId) return { error: INVALID_VALUES, context: { message: 'Missing personId' } } as any;

  const now = new Date().toISOString();

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
