import { generateDynamicRatings } from '@Mutate/participants/scaleItems/generateDynamicRatings';
import { calculateNewRatings } from '@Helpers/ratings/calculateNewRatings';

const governor = {
  calculateNewRatings,
  generateDynamicRatings,
};

export default governor;
