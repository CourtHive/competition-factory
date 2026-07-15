import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { getMatchUpScheduleDetails } from '@Query/matchUp/getMatchUpScheduleDetails';
import { publicFindDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { matchUpDuration } from '@Query/matchUp/matchUpDuration';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import { addMatchUpEndTime, addMatchUpStartTime } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';

// constants
import { END_DATE, END_TIME } from '@Constants/timeItemConstants';
import { SINGLES } from '@Constants/eventConstants';

function setup(scheduledDate: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: SINGLES }],
    startDate: '2026-07-10',
    endDate: '2026-07-13',
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const { matchUps } = getAllDrawMatchUps({ drawDefinition, inContext: true });
  const matchUpId = matchUps?.[0]?.matchUpId ?? '';

  const dateResult: any = addMatchUpScheduledDate({ drawDefinition, scheduledDate, matchUpId });
  expect(dateResult.success).toEqual(true);

  return { drawDefinition, matchUpId };
}

describe('addMatchUpEndTime cross-midnight handling', () => {
  it('records an after-midnight end on the next calendar day via END_DATE', () => {
    const { drawDefinition, matchUpId } = setup('2026-07-11');

    expect(addMatchUpStartTime({ drawDefinition, matchUpId, startTime: '21:00' }).success).toEqual(true);
    // 00:23 sorts before the 21:00 start on the scheduledDate — the match crossed midnight
    const endResult: any = addMatchUpEndTime({ drawDefinition, matchUpId, endTime: '00:23' });
    expect(endResult.success).toEqual(true);
    expect(endResult.error).toBeUndefined();

    const { matchUp }: any = publicFindDrawMatchUp({ drawDefinition, matchUpId });
    const endDateItem = matchUp.timeItems.find((timeItem: any) => timeItem.itemType === END_DATE);
    const endTimeItem = matchUp.timeItems.find((timeItem: any) => timeItem.itemType === END_TIME);
    expect(endDateItem?.itemValue).toEqual('2026-07-12');
    // END_TIME stays a bare HH:MM value — no ISO timestamp in the time field
    expect(endTimeItem?.itemValue).toEqual('00:23');

    const { schedule }: any = getMatchUpScheduleDetails({ drawDefinition, matchUp });
    expect(schedule.scheduledDate).toEqual('2026-07-11');
    expect(schedule.endDate).toEqual('2026-07-12');
    expect(schedule.endTime).toEqual('00:23');

    // duration is a correct positive span (21:00 → 00:23 next day = 3h23m)
    const { milliseconds, time }: any = matchUpDuration({ matchUp });
    expect(milliseconds).toEqual((3 * 60 + 23) * 60 * 1000);
    expect(time).toEqual('03:23:00');
  });

  it('rejects a genuine end-before-start value that exceeds the cross-midnight span cap', () => {
    const { drawDefinition, matchUpId } = setup('2026-07-11');

    expect(addMatchUpStartTime({ drawDefinition, matchUpId, startTime: '10:00' }).success).toEqual(true);
    // rolling 09:00 to the next day yields a 23h span — beyond the sanity cap, so it stays an error
    const endResult: any = addMatchUpEndTime({ drawDefinition, matchUpId, endTime: '09:00' });
    expect(endResult.success).toBeUndefined();
    expect(endResult.error).toBeDefined();

    const { matchUp }: any = publicFindDrawMatchUp({ drawDefinition, matchUpId });
    expect(matchUp.timeItems.find((timeItem: any) => timeItem.itemType === END_DATE)).toBeUndefined();
  });

  it('does not write END_DATE for a normal same-day end', () => {
    const { drawDefinition, matchUpId } = setup('2026-07-11');

    expect(addMatchUpStartTime({ drawDefinition, matchUpId, startTime: '10:00' }).success).toEqual(true);
    expect(addMatchUpEndTime({ drawDefinition, matchUpId, endTime: '12:00' }).success).toEqual(true);

    const { matchUp }: any = publicFindDrawMatchUp({ drawDefinition, matchUpId });
    expect(matchUp.timeItems.find((timeItem: any) => timeItem.itemType === END_DATE)).toBeUndefined();

    const { schedule }: any = getMatchUpScheduleDetails({ drawDefinition, matchUp });
    expect(schedule.endDate).toBeUndefined();

    const { milliseconds }: any = matchUpDuration({ matchUp });
    expect(milliseconds).toEqual(2 * 60 * 60 * 1000);
  });
});
