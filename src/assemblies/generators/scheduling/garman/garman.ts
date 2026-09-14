import { getCourtsAvailableAtPeriodStart } from '@Query/venues/getCourtsAvailableAtPeriodStart';
import { generateTimeSlots } from '@Generators/scheduling/generateTimeSlots';
import { courtGenerator } from '@Generators/scheduling/courtGenerator';
import { getScheduleTimes } from '@Query/venues/getScheduleTimes';

export const garman = {
  getCourtsAvailableAtPeriodStart,
  generateTimeSlots,
  getScheduleTimes,
  courtGenerator,
};

export default garman;
