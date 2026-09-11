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
import { ASSIGN_TIMEKEEPER } from '@Constants/timeItemConstants';

type AssignMatchUpTimekeeperArgs = {
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
 * Assign a tournament participant as the timekeeper of a matchUp — relevant for
 * timed matchUpFormats (e.g. INTENNSE bolt/serve clocks). Stored the same way as
 * court/official/scorekeeper assignments: a `SCHEDULE.ASSIGNMENT.TIMEKEEPER`
 * first-class value (`matchUp.schedule.timekeeper`) / legacy timeItem. The
 * timekeeper must be an INDIVIDUAL participant in the tournament; there is no
 * role restriction.
 */
export function assignMatchUpTimekeeper({
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  participantId,
  matchUpId,
  event,
}: AssignMatchUpTimekeeperArgs): { error?: ErrorType; success?: boolean } {
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
    attribute: 'timekeeper',
    itemType: ASSIGN_TIMEKEEPER,
    value: participantId,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
}

/** Clear any assigned timekeeper from a matchUp. */
export function removeMatchUpTimekeeper({
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  event,
}: Omit<AssignMatchUpTimekeeperArgs, 'participantId' | 'removePriorValues'>): {
  error?: ErrorType;
  success?: boolean;
} {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'timekeeper',
    itemType: ASSIGN_TIMEKEEPER,
    value: undefined,
    removePriorValues: true,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
}
