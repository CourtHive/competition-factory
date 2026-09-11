import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { legacyMode } from '@Tests/testHarness/legacyMode';
import { getMatchUpScheduleDetails } from '@Query/matchUp/getMatchUpScheduleDetails';
import { resetMatchUpTimeItems } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { matchUpDuration } from '@Query/matchUp/matchUpDuration';
import { publicFindDrawMatchUp } from '@Acquire/findDrawMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  addMatchUpEndTime,
  addMatchUpResumeTime,
  addMatchUpStartTime,
  addMatchUpStopTime,
} from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';

// constants
import { DOUBLES } from '@Constants/eventConstants';
import { ERROR } from '@Constants/resultConstants';

const t200101_10 = '2020-01-01T10:00:00Z';
const t200101_9 = '2020-01-01T09:00:00Z';
const t200101_8 = '2020-01-01T08:15:00Z';

// asserts legacy timeItem accumulation; NATIVE first-class schedule storage is covered by
// scheduleFirstClassStorage.test.ts
legacyMode('can add schedule items', () => {
  it('can add schedule items', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, eventType: DOUBLES }],
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const { matchUps } = getAllDrawMatchUps({ drawDefinition, inContext: true });
    let matchUp = matchUps?.[0];
    const matchUpId = matchUp?.matchUpId ?? '';

    const scheduledDate = '2020-01-01';
    let result = addMatchUpScheduledDate({
      drawDefinition,
      scheduledDate,
      matchUpId,
    });
    expect(result.success).toEqual(true);

    let {
      matchUp: { timeItems },
    } = publicFindDrawMatchUp({ drawDefinition, matchUpId });
    expect(timeItems.length).toEqual(1);

    let scheduledTime = '2020-01-02T08:00';
    // NOTE: the date will be stripped from the time since there is already a scheduledDate
    result = addMatchUpScheduledTime({
      drawDefinition,
      scheduledTime,
      matchUpId,
    });
    expect(result.success).toEqual(true);

    scheduledTime = '2020-01-01T08:00';
    result = addMatchUpScheduledTime({
      drawDefinition,
      matchUpId,
      scheduledTime,
    });
    expect(result.success).toEqual(true);

    scheduledTime = '08:00';
    result = addMatchUpScheduledTime({
      drawDefinition,
      matchUpId,
      scheduledTime,
    });
    expect(result.success).toEqual(true);

    let milliseconds, time, relevantTimeItems;
    let startTime, stopTime, resumeTime, endTime;

    // test matchUp duration with start and stop time
    startTime = '2020-01-01T08:05:00Z';
    result = addMatchUpStartTime({ drawDefinition, matchUpId, startTime });
    expect(result.success).toEqual(true);

    endTime = '2020-01-01T09:05:00Z';
    result = addMatchUpEndTime({ drawDefinition, matchUpId, endTime });
    expect(result.success).toEqual(true);

    ({ matchUp } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    // @ts-expect-error potentially undefined
    let { schedule } = getMatchUpScheduleDetails({ drawDefinition, matchUp });
    expect(schedule.scheduledDate).toEqual('2020-01-01');
    expect(schedule.scheduledTime).toEqual(scheduledTime);

    ({ milliseconds, time, relevantTimeItems } = matchUpDuration({
      matchUp,
    }));
    expect(relevantTimeItems.length).toEqual(2);
    expect(milliseconds).toEqual(3600000);
    expect(time).toEqual('01:00:00');

    // now test matchDuration with start, stop, resume, end times
    result = resetMatchUpTimeItems({ drawDefinition, matchUpId });
    expect(result.success).toEqual(true);

    startTime = '2020-01-01T08:05:00Z';
    result = addMatchUpStartTime({ drawDefinition, matchUpId, startTime });
    expect(result.success).toEqual(true);

    stopTime = t200101_8;
    result = addMatchUpStopTime({ drawDefinition, matchUpId, stopTime });
    expect(result.success).toEqual(true);

    resumeTime = t200101_9;
    result = addMatchUpResumeTime({ drawDefinition, matchUpId, resumeTime });
    expect(result.success).toEqual(true);

    endTime = t200101_10;
    result = addMatchUpEndTime({ drawDefinition, matchUpId, endTime });
    expect(result.success).toEqual(true);

    ({ matchUp } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    ({ milliseconds, time, relevantTimeItems } = matchUpDuration({
      matchUp,
    }));
    expect(relevantTimeItems.length).toEqual(4);
    expect(time).toEqual('01:10:00');
    expect(milliseconds).toEqual(4200000);

    // @ts-expect-error potentially undefined
    ({ schedule } = getMatchUpScheduleDetails({ drawDefinition, matchUp }));
    expect(schedule.time).toEqual('01:10:00');
    expect(schedule.milliseconds).toEqual(4200000);
    expect(schedule.startTime).toEqual(startTime);

    // now test expected behaviors
    result = resetMatchUpTimeItems({ drawDefinition, matchUpId });
    expect(result.success).toEqual(true);

    endTime = t200101_10;
    result = addMatchUpEndTime({ drawDefinition, matchUpId, endTime });
    expect(result.success).toEqual(true);

    startTime = '2020-01-01T08:00:00Z';
    result = addMatchUpStartTime({ drawDefinition, matchUpId, startTime });
    expect(result.success).toEqual(true);

    ({
      matchUp: { timeItems },
    } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    expect(timeItems.length).toEqual(2);

    // startTime should be replaced
    startTime = '2020-01-01T08:30:00Z';
    result = addMatchUpStartTime({ drawDefinition, matchUpId, startTime });
    expect(result.success).toEqual(true);

    ({
      matchUp: { timeItems },
    } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    expect(timeItems.length).toEqual(2);

    // correct time should be calculated even though end was entered before start
    ({ matchUp } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    ({ milliseconds, time, relevantTimeItems } = matchUpDuration({
      matchUp,
    }));
    expect(relevantTimeItems.length).toEqual(2);
    expect(time).toEqual('01:30:00');
    expect(milliseconds).toEqual(5400000);

    // now test error conditions
    result = resetMatchUpTimeItems({ drawDefinition, matchUpId });
    expect(result.success).toEqual(true);

    stopTime = new Date(t200101_8);
    result = addMatchUpStopTime({ drawDefinition, matchUpId, stopTime });
    expect(result).toHaveProperty(ERROR);

    resumeTime = new Date(t200101_9);
    result = addMatchUpResumeTime({ drawDefinition, matchUpId, resumeTime });
    expect(result).toHaveProperty(ERROR);

    // test adding end time after stop time
    result = resetMatchUpTimeItems({ drawDefinition, matchUpId });
    expect(result.success).toEqual(true);

    startTime = '2020-01-01T08:00:00Z';
    result = addMatchUpStartTime({ drawDefinition, matchUpId, startTime });
    expect(result.success).toEqual(true);

    stopTime = t200101_8;
    result = addMatchUpStopTime({ drawDefinition, matchUpId, stopTime });
    expect(result.success).toEqual(true);

    endTime = t200101_10;
    result = addMatchUpEndTime({ drawDefinition, matchUpId, endTime });
    expect(result.success).toEqual(true);

    // end time should be ignored since there is a stop time
    resumeTime = t200101_9;
    result = addMatchUpResumeTime({ drawDefinition, matchUpId, resumeTime });
    expect(result).toHaveProperty(ERROR);

    ({
      matchUp: { timeItems },
    } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    expect(timeItems.length).toEqual(3);

    ({ matchUp } = publicFindDrawMatchUp({ drawDefinition, matchUpId }));
    ({ milliseconds, time, relevantTimeItems } = matchUpDuration({
      matchUp,
    }));
    expect(relevantTimeItems.length).toEqual(3);
    expect(time).toEqual('00:15:00');
    expect(milliseconds).toEqual(900000);
  });
});
