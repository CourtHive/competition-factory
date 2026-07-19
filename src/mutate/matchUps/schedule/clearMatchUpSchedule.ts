import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_OFFICIAL,
  ASSIGN_SCOREKEEPER,
  ASSIGN_TIMEKEEPER,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  END_TIME,
  HOME_PARTICIPANT_ID,
  RESUME_TIME,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  START_TIME,
  STOP_TIME,
  TIME_MODIFIERS,
} from '@Constants/timeItemConstants';

// Map of legacy itemType → first-class MatchUpSchedule attribute for the
// CODES promotion. clearMatchUpSchedule must wipe BOTH surfaces so that
// records written in any schemaWriteMode are cleanly reset.
const ITEM_TYPE_TO_SCHEDULE_ATTR: Record<string, string> = {
  [ALLOCATE_COURTS]: 'allocatedCourts',
  [ASSIGN_COURT]: 'courtId',
  [ASSIGN_OFFICIAL]: 'official',
  [ASSIGN_SCOREKEEPER]: 'scorekeeper',
  [ASSIGN_TIMEKEEPER]: 'timekeeper',
  [ASSIGN_VENUE]: 'venueId',
  [COURT_ANNOTATION]: 'courtAnnotation',
  [COURT_ORDER]: 'courtOrder',
  [HOME_PARTICIPANT_ID]: 'homeParticipantId',
  [SCHEDULED_DATE]: 'scheduledDate',
  [SCHEDULED_TIME]: 'scheduledTime',
  [TIME_MODIFIERS]: 'timeModifiers',
};

export function clearMatchUpSchedule({
  scheduleAttributes = [
    ALLOCATE_COURTS,
    ASSIGN_COURT,
    ASSIGN_VENUE,
    SCHEDULED_DATE,
    SCHEDULED_TIME,
    START_TIME,
    END_TIME,
    RESUME_TIME,
    STOP_TIME,
  ],
  tournamentRecord,
  drawDefinition,
  matchUpId,
}) {
  const stack = 'clearMatchUpSchedule';
  const matchUp = drawDefinition
    ? allDrawMatchUps({
        matchUpFilters: { matchUpIds: [matchUpId] },
        inContext: false,
        drawDefinition,
      }).matchUps?.[0]
    : allTournamentMatchUps({
        matchUpFilters: { matchUpIds: [matchUpId] },
        tournamentRecord,
        inContext: false,
      }).matchUps?.[0];

  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const newTimeItems = (matchUp.timeItems ?? []).filter(
    (timeItem) => timeItem?.itemType && !scheduleAttributes.includes(timeItem?.itemType),
  );
  matchUp.timeItems = newTimeItems;

  // CODES: also strip any first-class `matchUp.schedule.*` attributes
  // whose itemType is being cleared.
  if (matchUp.schedule) {
    for (const itemType of scheduleAttributes) {
      const attr = ITEM_TYPE_TO_SCHEDULE_ATTR[itemType];
      if (attr) delete matchUp.schedule[attr];
    }
    if (Object.keys(matchUp.schedule).length === 0) delete matchUp.schedule;
  }

  modifyMatchUpNotice({
    tournamentId: tournamentRecord.tournamentId,
    context: stack,
    drawDefinition,
    matchUp,
  });

  return { ...SUCCESS };
}
