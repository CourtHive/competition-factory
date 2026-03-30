// Constants
import { MISSING_OFFICIAL_RECORD, SUSPENSION_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type RemoveSuspensionArgs = {
  officialRecord: OfficialRecord;
  suspensionId: string;
};

export function removeSuspension({ officialRecord, suspensionId }: RemoveSuspensionArgs) {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!suspensionId) return { error: INVALID_VALUES, context: { message: 'Missing suspensionId' } } as any;

  const index = officialRecord.suspensions.findIndex((s) => s.suspensionId === suspensionId);
  if (index === -1) return { error: SUSPENSION_NOT_FOUND, context: { suspensionId } };

  officialRecord.suspensions.splice(index, 1);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS };
}
