import { generateDynamicRatings } from '@Generators/scales/generateDynamicRatings';
import { calculateNewRatings } from '@Generators/scales/calculateNewRatings';

const governor = {
  calculateNewRatings,
  generateDynamicRatings,
};

export default governor;
