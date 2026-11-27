// Constants
import { MISSING_OFFICIAL_RECORD, ASSIGNMENT_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { nowIso } from '@Tools/clock';

// types
import type { OfficialRecord } from '@Types/officiatingTypes';
import type { ResultType } from '@Types/factoryTypes';

type RemoveOfficialAssignmentArgs = {
  officialRecord: OfficialRecord;
  assignmentId: string;
};

export function removeOfficialAssignment({ officialRecord, assignmentId }: RemoveOfficialAssignmentArgs): ResultType {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!assignmentId) return { error: INVALID_VALUES, context: { message: 'Missing assignmentId' } };

  const index = officialRecord.assignments.findIndex((a) => a.assignmentId === assignmentId);
  if (index === -1) return { error: ASSIGNMENT_NOT_FOUND, context: { assignmentId } };

  officialRecord.assignments.splice(index, 1);
  officialRecord.updatedAt = nowIso();

  return { ...SUCCESS };
}
