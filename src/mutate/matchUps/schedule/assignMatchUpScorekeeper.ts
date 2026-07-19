import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { getParticipants } from '@Query/participants/getParticipants';
import { findParticipant } from '@Acquire/findParticipant';

// constants and types
import {
  ErrorType,
  MISSING_MATCHUP_ID,
  MISSING_PARTICIPANT_ID,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { ASSIGN_SCOREKEEPER } from '@Constants/timeItemConstants';

type AssignMatchUpScorekeeperArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  participantId: string;
  matchUpId: string;
  event?: Event;
};

/**
 * Nominate a tournament participant as the official scorekeeper of a matchUp
 * (crowd-scoring Phase D). Stored the same way as court/official assignments —
 * a `SCHEDULE.ASSIGNMENT.SCOREKEEPER` first-class value (`matchUp.schedule.scorekeeper`)
 * / legacy timeItem. The scorekeeper must be an INDIVIDUAL participant in the
 * tournament; unlike an official there is no role restriction — a competitor
 * may also be nominated to score.
 */
export function assignMatchUpScorekeeper({
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  participantId,
  matchUpId,
  event,
}: AssignMatchUpScorekeeperArgs): { error?: ErrorType; success?: boolean } {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  if (tournamentRecord) {
    const tournamentParticipants =
      getParticipants({
        tournamentRecord,
        participantFilters: { participantTypes: [INDIVIDUAL] },
      }).participants ?? [];

    const participant = findParticipant({ tournamentParticipants, participantId });
    if (!participant) return { error: PARTICIPANT_NOT_FOUND };
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'scorekeeper',
    itemType: ASSIGN_SCOREKEEPER,
    value: participantId,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
}

/** Clear any nominated scorekeeper from a matchUp. */
export function removeMatchUpScorekeeper({
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  event,
}: Omit<AssignMatchUpScorekeeperArgs, 'participantId' | 'removePriorValues'>): {
  error?: ErrorType;
  success?: boolean;
} {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'scorekeeper',
    itemType: ASSIGN_SCOREKEEPER,
    value: undefined,
    removePriorValues: true,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
}
