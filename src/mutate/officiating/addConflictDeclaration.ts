import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import { OfficialConflictDeclaration, OfficialRecord } from '@Types/officiatingTypes';

type AddConflictDeclarationArgs = {
  officialRecord: OfficialRecord;
  declarationId?: string;
  organisationId?: string;
  participantId?: string;
  relationship?: string;
  declaredAt?: string;
  declaredBy?: string;
  personId?: string;
  notes?: string;
  extensions?: any[];
};

/**
 * Record a relationship the official has declared. At least one of personId,
 * participantId or organisationId is required — a declaration that names nothing
 * can never match a participant, so accepting one would create a record that
 * looks like a disclosure while checking nothing.
 */
export function addConflictDeclaration({
  officialRecord,
  declarationId,
  organisationId,
  participantId,
  relationship,
  declaredAt,
  declaredBy,
  personId,
  notes,
  extensions,
}: AddConflictDeclarationArgs): { error?: any; declaration?: OfficialConflictDeclaration; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!personId && !participantId && !organisationId) {
    return {
      error: INVALID_VALUES,
      context: { message: 'One of personId, participantId or organisationId is required' },
    } as any;
  }

  const now = new Date().toISOString();

  const declaration: OfficialConflictDeclaration = {
    declarationId: declarationId || UUID(),
    personId,
    participantId,
    organisationId,
    relationship,
    declaredAt: declaredAt ?? now,
    declaredBy,
    notes,
    extensions: extensions ?? [],
  };

  officialRecord.conflictDeclarations = [...(officialRecord.conflictDeclarations ?? []), declaration];
  officialRecord.updatedAt = now;

  return { ...SUCCESS, declaration };
}
