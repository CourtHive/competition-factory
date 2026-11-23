export function findCategoryTiming({ timesBlockArray, categoryName, categoryType }) {
  return timesBlockArray
    .filter((f) => Array.isArray(f))
    .map((times) =>
      times
        .sort((a, b) => (b.categoryNames?.length || 0) - (a.categoryNames?.length || 0))
        .find(
          ({ categoryTypes, categoryNames }) =>
            (!categoryNames?.length && !categoryTypes?.length) ||
            categoryNames?.includes(categoryName) ||
            categoryTypes?.includes(categoryType),
        ),
    )
    .find(Boolean);
}
