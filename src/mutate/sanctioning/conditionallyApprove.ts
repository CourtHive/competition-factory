import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, CONDITIONALLY_APPROVED } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { UUID } from '@Tools/UUID';

// Types
import type { SanctioningRecord, Condition } from '@Types/sanctioningTypes';

type ConditionallyApproveArgs = {
  sanctioningRecord: SanctioningRecord;
  conditions: Array<{ description: string }>;
  approvedBy?: string;
};

export function conditionallyApprove({ sanctioningRecord, conditions, approvedBy }: ConditionallyApproveArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { error: INVALID_VALUES, context: { message: 'At least one condition is required' } };
  }

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: CONDITIONALLY_APPROVED,
    transitionedBy: approvedBy,
    reason: 'Conditionally approved pending conditions',
  });
  if (result.error) return result;

  const now = new Date().toISOString();
  sanctioningRecord.conditions ??= [];
  for (const c of conditions) {
    const condition: Condition = {
      conditionId: UUID(),
      description: c.description,
      met: false,
      createdAt: now,
    };
    sanctioningRecord.conditions.push(condition);
  }

  return result;
}
