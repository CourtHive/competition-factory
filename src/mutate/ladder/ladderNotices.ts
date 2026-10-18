import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';

// types
import type { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';

type LadderNoticeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structure: Structure;
  event?: Event;
};

/**
 * A ladder STANDING is the structure's positionAssignments, so a move announces them as every other
 * position write does: MODIFY_POSITION_ASSIGNMENTS for the structure, and the draw it belongs to.
 * Call it only once the standing has actually moved.
 */
export function ladderStandingNotice({ tournamentRecord, drawDefinition, structure, event }: LadderNoticeArgs) {
  return modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });
}

/** A challenge's lifecycle is written to its matchUp: status, score and the dated time items. */
export function ladderMatchUpNotice({
  tournamentRecord,
  drawDefinition,
  structure,
  matchUp,
  event,
}: LadderNoticeArgs & { matchUp: MatchUp }) {
  return modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    structureId: structure.structureId,
    drawDefinition,
    matchUp,
    event,
  });
}
