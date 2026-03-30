// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_OFFICIAL_RECORD,
  ASSIGNMENT_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_ASSIGNMENT_TRANSITIONS,
} from '@Constants/officiatingConstants';

// Types
import type { OfficialRecord, AssignmentStatus, OfficialAssignment } from '@Types/officiatingTypes';

type TransitionAssignmentStatusArgs = {
  officialRecord: OfficialRecord;
  assignmentId: string;
  toStatus: AssignmentStatus;
  transitionedBy?: string;
  reason?: string;
};

export function transitionAssignmentStatus({
  officialRecord,
  assignmentId,
  toStatus,
  transitionedBy,
  reason,
}: TransitionAssignmentStatusArgs): { error?: any; assignment?: OfficialAssignment; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!assignmentId) return { error: INVALID_VALUES, context: { message: 'Missing assignmentId' } } as any;
  if (!toStatus) return { error: INVALID_VALUES, context: { message: 'Missing toStatus' } } as any;

  const assignment = officialRecord.assignments.find((a) => a.assignmentId === assignmentId);
  if (!assignment) return { error: ASSIGNMENT_NOT_FOUND, context: { assignmentId } } as any;

  const validTargets = VALID_ASSIGNMENT_TRANSITIONS[assignment.status];
  if (!validTargets?.includes(toStatus)) {
    return {
      error: INVALID_OFFICIATING_STATUS_TRANSITION,
      context: { fromStatus: assignment.status, toStatus, validTargets },
    } as any;
  }

  const now = new Date().toISOString();

  assignment.statusHistory ??= [];
  assignment.statusHistory.push({
    fromStatus: assignment.status,
    toStatus,
    transitionedAt: now,
    transitionedBy,
    reason,
  });

  assignment.status = toStatus;
  officialRecord.updatedAt = now;

  return { ...SUCCESS, assignment };
}
