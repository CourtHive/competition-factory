import { getOfficialConflicts } from '@Query/officiating/getOfficialConflicts';
import { UUID } from '@Tools/UUID';

// Constants
import {
  MISSING_OFFICIAL_RECORD,
  OFFICIAL_CONFLICT_OF_INTEREST,
  ASSIGN_PROPOSED,
} from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialConflict, OfficialAssignment, OfficialRecord } from '@Types/officiatingTypes';
import type { Participant } from '@Types/tournamentTypes';

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
  /** Conflict-of-interest gate — opt-in. Supply a policy AND the tournament's
   *  participants to have the assignment checked; a BLOCK-severity conflict
   *  refuses it. Omitting policyDefinitions skips the check entirely. */
  policyDefinitions?: { [key: string]: any };
  participants?: Participant[];
  nationalityCode?: string;
  organisationIds?: string[];
};

export function assignOfficial({
  officialRecord,
  organisationIds,
  nationalityCode,
  policyDefinitions,
  assignmentId,
  participants,
  tournamentId,
  roleSubtype,
  assignedDate,
  startDate,
  endDate,
  assignedBy,
  notes,
  extensions,
}: AssignOfficialArgs): {
  error?: any;
  assignment?: OfficialAssignment;
  conflicts?: OfficialConflict[];
  success?: boolean;
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!tournamentId) return { error: INVALID_VALUES, context: { message: 'Missing tournamentId' } } as any;
  if (!roleSubtype) return { error: INVALID_VALUES, context: { message: 'Missing roleSubtype' } } as any;

  const conflictResult = getOfficialConflicts({
    officialRecord,
    participants,
    nationalityCode,
    organisationIds,
    policyDefinitions,
  });
  // A malformed conflict check must not fall through to an unchecked assignment.
  if (conflictResult.error) return { error: conflictResult.error };
  if (conflictResult.blocked) {
    return { error: OFFICIAL_CONFLICT_OF_INTEREST, conflicts: conflictResult.conflicts } as any;
  }

  const conflicts = conflictResult.conflicts ?? [];
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

  // Non-blocking (WARN) conflicts are returned so the caller can surface them
  // alongside the successful assignment rather than discarding them.
  return conflicts.length ? { ...SUCCESS, assignment, conflicts } : { ...SUCCESS, assignment };
}
