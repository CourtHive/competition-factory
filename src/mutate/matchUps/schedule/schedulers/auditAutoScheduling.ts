import { addTournamentTimeItem } from '@Mutate/timeItems/addTimeItem';
import { addNotice, hasTopic } from '@Global/state/globalState';

// constants
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';
import { Tournament } from '@Types/tournamentTypes';
import { AUDIT } from '@Constants/topicConstants';

export function auditAutoScheduling({ autoSchedulingAudit, tournamentRecords }) {
  addNotice({ topic: AUDIT, payload: autoSchedulingAudit });

  const getCount = (obj) => {
    if (!obj) return 0;
    const values: any[] = Object.values(obj);
    return values.reduce((count, value) => count + value.length || 0, 0);
  };

  const profileRoundsCount = (autoSchedulingAudit?.schedulingProfile ?? []).reduce(
    (count, dateProfile) => count + dateProfile.venues.reduce((vc, venue) => vc + venue.rounds.length, 0),
    0,
  );

  const itemValue = {
    scheduledDatesCount: autoSchedulingAudit.scheduledDates?.length,
    noTimeMatchUpIdsCount: getCount(autoSchedulingAudit?.noTimeMatchUpIds),
    scheduledMatchUpIdsCount: getCount(autoSchedulingAudit?.scheduledMatchUpIds),
    overLimitMatchUpIdsCount: getCount(autoSchedulingAudit?.overLimitMatchUpIds),
    requestConflictsCount: getCount(autoSchedulingAudit?.requestConflicts),
    profileRoundsCount,
  };
  const timeItem = {
    itemType: AUTO_SCHEDULING_AUDIT,
    itemValue,
  };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const tournamentId: string = (tournamentRecord as Tournament).tournamentId;
    if (hasTopic(AUDIT)) {
      addNotice({
        payload: { type: AUTO_SCHEDULING_AUDIT, tournamentId, detail: itemValue },
        topic: AUDIT,
      });
    } else {
      addTournamentTimeItem({ tournamentRecord, timeItem });
    }
  }
}
