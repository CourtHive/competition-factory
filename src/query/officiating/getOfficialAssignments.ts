// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialAssignment, AssignmentStatus } from '@Types/officiatingTypes';

type GetOfficialAssignmentsArgs = {
  officialRecord: OfficialRecord;
  tournamentId?: string;
  roleSubtype?: string;
  status?: AssignmentStatus;
};

export function getOfficialAssignments({
  officialRecord,
  tournamentId,
  roleSubtype,
  status,
}: GetOfficialAssignmentsArgs): {
  error?: any;
  success?: boolean;
  assignments?: OfficialAssignment[];
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  let assignments = [...officialRecord.assignments];

  if (tournamentId) {
    assignments = assignments.filter((a) => a.tournamentId === tournamentId);
  }
  if (roleSubtype) {
    assignments = assignments.filter((a) => a.roleSubtype === roleSubtype);
  }
  if (status) {
    assignments = assignments.filter((a) => a.status === status);
  }

  return { ...SUCCESS, assignments };
}
