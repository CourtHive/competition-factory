import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD, ASSIGN_PROPOSED } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialAssignment } from '@Types/officiatingTypes';

type AssignOfficialArgs = {
  officialRecord: OfficialRecord;
  assignmentId?: string;
  tournamentId: string;
  roleSubtype: string;
  assignedDate?: string;
  startDate?: string;
  endDate?: string;
  assignedBy?: string;
  notes?: string;
  extensions?: any[];
};

export function assignOfficial({
  officialRecord,
  assignmentId,
  tournamentId,
  roleSubtype,
  assignedDate,
  startDate,
  endDate,
  assignedBy,
  notes,
  extensions,
}: AssignOfficialArgs): { error?: any; assignment?: OfficialAssignment; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!tournamentId) return { error: INVALID_VALUES, context: { message: 'Missing tournamentId' } } as any;
  if (!roleSubtype) return { error: INVALID_VALUES, context: { message: 'Missing roleSubtype' } } as any;

  const now = new Date().toISOString();

  const assignment: OfficialAssignment = {
    assignmentId: assignmentId || UUID(),
    personId: officialRecord.personId,
    tournamentId,
    roleSubtype,
    status: ASSIGN_PROPOSED,
    assignedDate: assignedDate ?? now.split('T')[0],
    startDate,
    endDate,
    assignedBy,
    notes,
    statusHistory: [
      {
        fromStatus: ASSIGN_PROPOSED,
        toStatus: ASSIGN_PROPOSED,
        transitionedAt: now,
        reason: 'Assignment created',
      },
    ],
    extensions: extensions ?? [],
  };

  officialRecord.assignments.push(assignment);
  officialRecord.updatedAt = now;

  return { ...SUCCESS, assignment };
}
