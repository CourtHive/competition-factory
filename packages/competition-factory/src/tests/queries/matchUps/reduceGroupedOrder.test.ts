import { reduceGroupedOrder } from '@Query/matchUps/reduceGroupedOrder';
import { it, expect } from 'vitest';

it.each([
  {
    groupedOrder: [2, 1, 4, 3, 6, 5, 8, 7],
    roundPositionsCount: 4,
    sizedGroupOrder: [1, 2, 3, 4],
  },
  {
    groupedOrder: [2, 1, 4, 3, 6, 5, 8, 7],
    roundPositionsCount: 2,
    sizedGroupOrder: [1, 2],
  },
])('properly reduces groupedOrder', ({ groupedOrder, roundPositionsCount, sizedGroupOrder }) => {
  const result = reduceGroupedOrder({
    roundPositionsCount,
    groupedOrder,
  });
  expect(result).toEqual(sizedGroupOrder);
});
