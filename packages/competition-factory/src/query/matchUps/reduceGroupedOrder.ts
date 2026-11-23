import { numericSort } from '@Tools/sorting';
import { chunkArray } from '@Tools/arrays';

export function reduceGroupedOrder({ groupedOrder, roundPositionsCount }) {
  if (!groupedOrder || groupedOrder?.length <= roundPositionsCount) {
    return groupedOrder;
  }

  const groupChunks = chunkArray(groupedOrder, groupedOrder.length / roundPositionsCount);

  const chunkValues = groupChunks.map((chunk) => chunk.reduce((a: number, b: number) => a + b));
  const sortedChunks = chunkValues.slice().sort(numericSort); // make a copy of the values to avoid mutating the original

  return chunkValues.map((chunkValue) => sortedChunks.indexOf(chunkValue) + 1);
}
