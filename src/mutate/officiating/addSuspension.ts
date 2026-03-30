import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialSuspension } from '@Types/officiatingTypes';

type AddSuspensionArgs = {
  officialRecord: OfficialRecord;
  suspensionId?: string;
  organisationId?: string;
  suspensionType?: string;
  suspensionNotes?: string;
  suspendedFrom?: string;
  suspendedUntil?: string;
  extensions?: any[];
};

export function addSuspension({
  officialRecord,
  suspensionId,
  organisationId,
  suspensionType,
  suspensionNotes,
  suspendedFrom,
  suspendedUntil,
  extensions,
}: AddSuspensionArgs): { error?: any; suspension?: OfficialSuspension; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  const suspension: OfficialSuspension = {
    suspensionId: suspensionId || UUID(),
    personId: officialRecord.personId,
    organisationId,
    suspensionType,
    suspensionNotes,
    suspendedFrom,
    suspendedUntil,
    extensions: extensions ?? [],
  };

  officialRecord.suspensions.push(suspension);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS, suspension };
}
