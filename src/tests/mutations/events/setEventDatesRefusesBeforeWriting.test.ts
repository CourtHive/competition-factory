import { dateStringDaysChange } from '@Tools/dateTime';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_DATE } from '@Constants/errorConditionConstants';

it('refuses an end date outside the tournament without applying the start date', () => {
  const {
    tournamentRecord: { startDate, endDate },
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ eventProfiles: [{ eventName: 'E' }], setState: true });
  const eventDates = () => {
    const { event } = tournamentEngine.getEvent({ eventId });
    return [event.startDate, event.endDate];
  };
  const before = eventDates();

  let result: any = tournamentEngine.setEventDates({
    startDate: dateStringDaysChange(startDate, 1),
    endDate: dateStringDaysChange(endDate, 1),
    eventId,
  });
  expect(result.error).toEqual(INVALID_DATE);
  expect(eventDates()).toEqual(before);

  result = tournamentEngine.setEventDates({ startDate: dateStringDaysChange(startDate, -1), eventId });
  expect(result.error).toEqual(INVALID_DATE);
  expect(eventDates()).toEqual(before);

  result = tournamentEngine.setEventDates({ startDate: dateStringDaysChange(startDate, 1), endDate, eventId });
  expect(result.success).toEqual(true);
  expect(eventDates()).toEqual([dateStringDaysChange(startDate, 1), endDate]);
});
