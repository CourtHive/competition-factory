import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getMatchUp } from '@Query/matchUps/getMatchUpFromMatchUps';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { findEvent } from '@Acquire/findEvent';

// constants
import { ALLOCATE_COURTS, ASSIGN_COURT } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

// types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type RemoveCourtAssignmentArgs = {
  /** Supplied so notices can carry the sanctioning origin; resolved by paramsMiddleware. */
  event?: Event;
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpId: string;
  drawId?: string;
};
export function removeCourtAssignment(params: RemoveCourtAssignmentArgs): { success?: boolean; error?: ErrorType } {
  const plan = planCourtAssignmentRemoval(params);
  if (!('commit' in plan)) return plan;
  plan.commit();
  return { ...SUCCESS };
}

/**
 * Resolves the matchUp and decides what removing its court assignment writes (its court and allocation timeItems,
 * its first-class `courtId` and `allocatedCourts`) without writing it. The commit performs those removals and
 * announces the matchUp only when something was removed.
 */
export function planCourtAssignmentRemoval({
  tournamentRecord,
  drawDefinition,
  matchUpId,
  drawId,
  event,
}: RemoveCourtAssignmentArgs): { error: ErrorType } | { commit: () => void } {
  const stack = 'removeCourtAssignment';
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!drawDefinition && !drawId) return { error: MISSING_DRAW_ID };

  let matchUp;
  if (!drawDefinition) {
    if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
    ({ drawDefinition } = findEvent({ tournamentRecord, drawId }));
  }

  if (drawDefinition) {
    ({ matchUp } = findDrawMatchUp({ drawDefinition, matchUpId }));
  } else {
    if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
    const matchUps = allTournamentMatchUps({ tournamentRecord, inContext: false }).matchUps ?? [];
    ({ matchUp } = getMatchUp({ matchUps, matchUpId }));
  }
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const writes: (() => void)[] = [];

  // LEGACY / BRIDGE: court assignment lives in timeItems
  const assignmentTypes = new Set<string>([ASSIGN_COURT, ALLOCATE_COURTS]);
  if (matchUp.timeItems?.some((candidate) => assignmentTypes.has(candidate.itemType))) {
    const timeItems = matchUp.timeItems.filter(({ itemType }) => !assignmentTypes.has(itemType));
    writes.push(() => (matchUp.timeItems = timeItems));
  }

  // NATIVE / BRIDGE: court assignment is first-class schedule.courtId / schedule.allocatedCourts,
  // with no timeItem mirror — without this, deleteCourt left the court assigned in NATIVE.
  const schedule = matchUp.schedule;
  if (schedule && typeof schedule === 'object') {
    if (schedule.courtId !== undefined) writes.push(() => delete schedule.courtId);
    if (schedule.allocatedCourts !== undefined) writes.push(() => delete schedule.allocatedCourts);
  }

  const commit = () => {
    if (!writes.length) return;
    for (const write of writes) write();
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  };
  return { commit };
}
