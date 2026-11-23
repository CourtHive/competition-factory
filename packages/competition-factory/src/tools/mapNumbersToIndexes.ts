export const mapNumbersToIndexes = (indexArray: number[], randNumberArray: number[]) => {
  // remove duplicates and slice the randomList to the length of the indexArray
  const uniqueRandomList = [...new Set(randNumberArray.slice(0, indexArray.length))];
  const sortedRandomList = [...uniqueRandomList].sort((a, b) => a - b);

  // track used indexes
  const usedIndexes = new Set();

  const mappedNumbersToIndexes: number[] = [];

  // // Map each item in the randomList to a comparable value
  uniqueRandomList.forEach((item) => {
    const randNumberIndex = indexArray.indexOf(item);
    if (randNumberIndex !== -1 && !usedIndexes.has(randNumberIndex)) {
      // Valid index found in indexArray
      mappedNumbersToIndexes.push(randNumberIndex);
      usedIndexes.add(randNumberIndex);
    } else {
      // If item is not found in indexArray, map it to its index in the sorted randNumberArray
      const sortedIndex = sortedRandomList.indexOf(item);
      let nextAvailableIndex = indexArray.findIndex((_, i) => !usedIndexes.has(i));

      while (usedIndexes.has(nextAvailableIndex) && nextAvailableIndex === -1 && usedIndexes.size < indexArray.length) {
        nextAvailableIndex = indexArray.findIndex((_, i) => !usedIndexes.has(i) && i > nextAvailableIndex);
      }

      mappedNumbersToIndexes.push(sortedIndex);
      usedIndexes.add(sortedIndex);
    }
  });

  // Add remaining indexes from the indexArray in order
  const remainingIndexes = indexArray.filter((_, index) => !usedIndexes.has(index));

  return [...mappedNumbersToIndexes, ...remainingIndexes];
};
