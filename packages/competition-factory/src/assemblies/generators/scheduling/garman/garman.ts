import { getCourtsAvailableAtPeriodStart } from '@Helpers/scheduling/getCourtsAvailableAtPeriodStart';
import { generateTimeSlots } from '@Helpers/scheduling/generateTimeSlots';
import { getScheduleTimes } from '@Helpers/scheduling/getScheduleTimes';
import { courtGenerator } from '@Helpers/scheduling/courtGenerator';

export const garman = {
  getCourtsAvailableAtPeriodStart,
  generateTimeSlots,
  getScheduleTimes,
  courtGenerator,
};

export default garman;
