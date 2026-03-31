// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type GetOfficialRecordArgs = {
  officialRecord: OfficialRecord;
};

export function queryOfficialRecord({ officialRecord }: GetOfficialRecordArgs): {
  error?: any;
  success?: boolean;
  officialRecord?: OfficialRecord;
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  return { ...SUCCESS, officialRecord };
}
