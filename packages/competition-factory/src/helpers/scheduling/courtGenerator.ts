import { generateRange } from '@Tools/arrays';

type CourtGeneratorArgs = {
  startTime?: string;
  endTime?: string;
  count?: number;
  date?: string;
};
export function courtGenerator(params?: CourtGeneratorArgs) {
  const { startTime = '8:00', endTime = '20:30', count = 10, date } = params ?? {};
  return generateRange(0, count).map(() => ({
    dateAvailability: [{ date, startTime, endTime }],
  }));
}
