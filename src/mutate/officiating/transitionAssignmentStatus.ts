import { transitionRecordStatus } from '@Functions/declaration/transitionRecordStatus';

// constants and types
import {
  MISSING_OFFICIAL_RECORD,
  ASSIGNMENT_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_ASSIGNMENT_TRANSITIONS,
} from '@Constants/officiatingConstants';
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
  return transitionRecordStatus({
    record: officialRecord,
    collectionKey: 'assignments',
    idKey: 'assignmentId',
    entityId: assignmentId,
    toStatus,
    transitionedBy,
    reason,
    machineDef: VALID_ASSIGNMENT_TRANSITIONS,
    resultKey: 'assignment',
    errors: {
      missingRecord: MISSING_OFFICIAL_RECORD,
      notFound: ASSIGNMENT_NOT_FOUND,
      invalidTransition: INVALID_OFFICIATING_STATUS_TRANSITION,
    },
  });
}
