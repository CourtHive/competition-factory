import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getParticipants } from '@Query/participants/getParticipants';
import { getParticipantId } from '@Functions/global/extractors';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { resolveTieFormat } from './resolveTieFormat';

// constants and types
import { DrawDefinition, Event, MatchUp, Participant, Structure, TieFormat, Tournament } from '@Types/tournamentTypes';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  EVENT_NOT_FOUND,
  ErrorType,
  INVALID_MATCHUP,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

// for a given tieMatchUpId (SINGLES or DOUBLES) return:
// the tieMatchUp, the dualMatchUp within which it occurs, an inContext copy of the dualMatchUp
// the tieFormat, collectionId and collectionPosition & etc.

type GetTieMatchUpContextArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  tieMatchUpId: string;
  event: Event;
};
export function getTieMatchUpContext({
  tournamentRecord,
  drawDefinition,
  tieMatchUpId,
  event,
}: GetTieMatchUpContextArgs): {
  inContextDualMatchUp?: HydratedMatchUp;
  inContextTieMatchUp?: HydratedMatchUp;
  teamParticipants?: Participant[];
  relevantAssignments?: any[];
  collectionPosition?: number;
  drawPositions?: number[];
  tieFormat?: TieFormat;
  collectionId?: string;
  dualMatchUp?: MatchUp;
  matchUpTieId?: string;
  structure?: Structure;
  matchUpType?: string;
  tieMatchUp?: MatchUp;
  error?: ErrorType;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!drawDefinition) return { error: MISSING_DRAW_ID };
  if (!event) return { error: EVENT_NOT_FOUND };

  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  // tieMatchUp is matchUpType: SINGLES or DOUBLES
  const { matchUp: tieMatchUp } = findDrawMatchUp({
    matchUpId: tieMatchUpId,
    drawDefinition,
    matchUpsMap,
  });
  if (!tieMatchUp) return { error: MATCHUP_NOT_FOUND };

  const { matchUp: inContextTieMatchUp, structure } = findDrawMatchUp({
    tournamentParticipants: tournamentRecord.participants,
    matchUpId: tieMatchUpId,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });
  if (!inContextTieMatchUp) return { error: MATCHUP_NOT_FOUND };

  const { collectionPosition, drawPositions, collectionId, matchUpTieId, matchUpType } = inContextTieMatchUp;

  if (matchUpType && !includesMatchUpEventType([SINGLES, DOUBLES], matchUpType)) return { error: INVALID_MATCHUP };
  // a SINGLES or DOUBLES matchUp that is not a tieMatchUp has no TEAM matchUp: without this the lineUp mutations read
  // an undefined dual and refused it for an unrelated reason (team not found, participant not found, missing matchUp)
  if (!matchUpTieId) return { error: INVALID_MATCHUP };

  const { positionAssignments } = getPositionAssignments({ structure });
  const relevantAssignments = positionAssignments?.filter((assignment) =>
    drawPositions?.includes(assignment.drawPosition),
  );

  const { matchUp: dualMatchUp } = findDrawMatchUp({
    matchUpId: matchUpTieId,
    drawDefinition,
    matchUpsMap,
  });

  const sideParticipantIds = dualMatchUp?.sides?.map(getParticipantId) ?? [];

  const assignedParticipantIds = relevantAssignments?.map(getParticipantId) ?? [];

  const participantIds = [...sideParticipantIds, ...assignedParticipantIds];

  const { participants: teamParticipants } = getParticipants({
    tournamentRecord,
    participantFilters: {
      participantTypes: [TEAM],
      participantIds,
    },
  });

  const { matchUp: inContextDualMatchUp } = findDrawMatchUp({
    matchUpId: matchUpTieId,
    inContext: true,
    drawDefinition,
    matchUpsMap,
  });

  const tieFormat = resolveTieFormat({
    matchUp: dualMatchUp,
    drawDefinition,
    structure,
    event,
  })?.tieFormat;

  return {
    inContextDualMatchUp,
    inContextTieMatchUp,
    relevantAssignments,
    collectionPosition,
    teamParticipants,
    collectionId,
    matchUpType,
    dualMatchUp,
    tieMatchUp,
    tieFormat,
    structure,
    ...SUCCESS,
  };
}
