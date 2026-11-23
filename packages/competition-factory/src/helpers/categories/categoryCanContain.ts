import { validateCategory } from '@Validators/validateCategory';
import { definedAttributes } from '@Tools/definedAttributes';

// types
import { Category } from '@Types/tournamentTypes';

type CategoryCanContainArgs = {
  childCategory: Category;
  withDetails?: boolean;
  category: Category;
};

export function categoryCanContain({ childCategory, withDetails, category }: CategoryCanContainArgs) {
  const categoryDetails = validateCategory({ category });
  const childCategoryDetails = validateCategory({
    category: childCategory,
  });

  const invalidAgeMin =
    childCategoryDetails.ageMin &&
    ((categoryDetails.ageMin && childCategoryDetails.ageMin < categoryDetails.ageMin) ||
      (categoryDetails.ageMax && childCategoryDetails.ageMin > categoryDetails.ageMax));

  const invalidAgeMax =
    childCategoryDetails.ageMax &&
    ((categoryDetails.ageMax && childCategoryDetails.ageMax > categoryDetails.ageMax) ||
      (categoryDetails.ageMin && childCategoryDetails.ageMax < categoryDetails.ageMin));

  const invalidAgeMinDate =
    childCategoryDetails.ageMinDate &&
    categoryDetails.ageMaxDate &&
    new Date(childCategoryDetails.ageMinDate) > new Date(categoryDetails.ageMaxDate);

  const invalidAgeMaxDate =
    childCategoryDetails.ageMaxDate &&
    categoryDetails.ageMinDate &&
    new Date(childCategoryDetails.ageMaxDate) < new Date(categoryDetails.ageMinDate);

  const ratingComparison =
    category?.ratingType && childCategory?.ratingType && category.ratingType === childCategory.ratingType;

  const invalidRatingRange =
    ratingComparison &&
    ((category.ratingMin && childCategory.ratingMin && childCategory.ratingMin < category.ratingMin) ||
      (category.ratingMax && childCategory.ratingMax && childCategory.ratingMax > category.ratingMax) ||
      (category.ratingMin && childCategory.ratingMax && childCategory.ratingMax < category.ratingMin) ||
      (category.ratingMax && childCategory.ratingMin && childCategory.ratingMin > category.ratingMax));

  const invalidBallType = category?.ballType && childCategory?.ballType && category.ballType !== childCategory.ballType;

  const valid =
    !invalidRatingRange &&
    !invalidAgeMinDate &&
    !invalidAgeMaxDate &&
    !invalidBallType &&
    !invalidAgeMax &&
    !invalidAgeMin;

  const ignoreFalse = true;
  const result = definedAttributes(
    {
      invalidRatingRange,
      invalidAgeMinDate,
      invalidAgeMaxDate,
      invalidBallType,
      invalidAgeMax,
      invalidAgeMin,
      valid,
    },
    ignoreFalse,
  );

  if (withDetails) {
    Object.assign(result, { categoryDetails, childCategoryDetails });
  }

  return result;
}
