// Constants
import { MISSING_OFFICIAL_RECORD, SUSPENSION_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { nowIso } from '@Tools/clock';

// types
import type { OfficialRecord } from '@Types/officiatingTypes';
import type { ResultType } from '@Types/factoryTypes';

type RemoveSuspensionArgs = {
  officialRecord: OfficialRecord;
  suspensionId: string;
};

export function removeSuspension({ officialRecord, suspensionId }: RemoveSuspensionArgs): ResultType {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!suspensionId) return { error: INVALID_VALUES, context: { message: 'Missing suspensionId' } };

  const index = officialRecord.suspensions.findIndex((s) => s.suspensionId === suspensionId);
  if (index === -1) return { error: SUSPENSION_NOT_FOUND, context: { suspensionId } };

  officialRecord.suspensions.splice(index, 1);
  officialRecord.updatedAt = nowIso();

  return { ...SUCCESS };
}
