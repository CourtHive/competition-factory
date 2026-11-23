export const hasSchedule = ({ scheduleAttributes = ['scheduledDate', 'scheduledTime'], schedule = {} }) => {
  const matchUpScheduleKeys = Object.keys(schedule)
    .filter((key) => scheduleAttributes.includes(key))
    .filter((key) => schedule[key]);
  return !!matchUpScheduleKeys.length;
};
