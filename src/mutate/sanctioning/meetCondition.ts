import { MISSING_SANCTIONING_RECORD, CONDITION_NOT_FOUND } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

import type { SanctioningRecord } from '@Types/sanctioningTypes';

type MeetConditionArgs = {
  sanctioningRecord: SanctioningRecord;
  conditionId: string;
  metNotes?: string;
};

export function meetCondition({ sanctioningRecord, conditionId, metNotes }: MeetConditionArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!conditionId) return { error: INVALID_VALUES, context: { message: 'Missing conditionId' } };

  const condition = sanctioningRecord.conditions?.find((c) => c.conditionId === conditionId);
  if (!condition) return { error: CONDITION_NOT_FOUND, context: { conditionId } };

  condition.met = true;
  condition.metAt = new Date().toISOString();
  if (metNotes) condition.metNotes = metNotes;

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  const allMet = sanctioningRecord.conditions?.every((c) => c.met) ?? false;

  return { ...SUCCESS, allConditionsMet: allMet };
}
