// Constants
import { CONFLICT_DECLARATION_NOT_FOUND, MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type RemoveConflictDeclarationArgs = {
  officialRecord: OfficialRecord;
  declarationId: string;
};

export function removeConflictDeclaration({ officialRecord, declarationId }: RemoveConflictDeclarationArgs) {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!declarationId) return { error: INVALID_VALUES, context: { message: 'Missing declarationId' } } as any;

  const declarations = officialRecord.conflictDeclarations ?? [];
  const index = declarations.findIndex((declaration) => declaration.declarationId === declarationId);
  if (index === -1) return { error: CONFLICT_DECLARATION_NOT_FOUND, context: { declarationId } };

  declarations.splice(index, 1);
  officialRecord.conflictDeclarations = declarations;
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS };
}
