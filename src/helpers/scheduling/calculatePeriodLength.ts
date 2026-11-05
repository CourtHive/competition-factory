type CalculatePeriodLengthArgs = {
  averageMatchUpMinutes?: number;
  periodLength?: number;
  recoveryMinutes?: number;
};
export function calculatePeriodLength({
  averageMatchUpMinutes,
  periodLength = 30,
  recoveryMinutes,
}: CalculatePeriodLengthArgs) {
  const combinedMinutes = (averageMatchUpMinutes || 90) + (recoveryMinutes || 0);
  return periodLength > combinedMinutes ? combinedMinutes : periodLength || 30;
}
