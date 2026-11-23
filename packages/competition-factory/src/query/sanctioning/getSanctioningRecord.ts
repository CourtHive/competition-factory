import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// types
import type { SanctioningRecord } from '@Types/sanctioningTypes';

type GetSanctioningRecordArgs = {
  sanctioningRecord?: SanctioningRecord;
};

export function querySanctioningRecord({ sanctioningRecord }: GetSanctioningRecordArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  return { ...SUCCESS, sanctioningRecord: makeDeepCopy(sanctioningRecord, false, true) };
}
