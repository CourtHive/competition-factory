// Constants
import { CONFLICT_DECLARATION_NOT_FOUND, MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { nowIso } from '@Tools/clock';

// types
import type { OfficialRecord } from '@Types/officiatingTypes';
import type { ResultType } from '@Types/factoryTypes';

type RemoveDeclarationArgs = {
  officialRecord: OfficialRecord;
  declarationId: string;
};

export function removeConflictDeclaration({ officialRecord, declarationId }: RemoveDeclarationArgs): ResultType {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!declarationId) return { error: INVALID_VALUES, context: { message: 'Missing declarationId' } };

  const declarations = officialRecord.conflictDeclarations ?? [];
  const index = declarations.findIndex((declaration) => declaration.declarationId === declarationId);
  if (index === -1) return { error: CONFLICT_DECLARATION_NOT_FOUND, context: { declarationId } };

  declarations.splice(index, 1);
  officialRecord.conflictDeclarations = declarations;
  officialRecord.updatedAt = nowIso();

  return { ...SUCCESS };
}
