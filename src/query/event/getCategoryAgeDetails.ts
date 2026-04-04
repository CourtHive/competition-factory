import { dateStringDaysChange, extractDate, isValidDateString, zeroPad } from '@Tools/dateTime';
import { definedAttributes } from '@Tools/definedAttributes';
import { isNumeric } from '@Tools/math';

// Constants and types
import { INVALID_CATEGORY, INVALID_DATE } from '@Constants/errorConditionConstants';
import { Category } from '@Types/tournamentTypes';

const typeMatch = (arr, type) => arr.filter(Boolean).every((i) => typeof i === type);
const allNumeric = (arr) => arr.filter(Boolean).every(isNumeric);

type ParseArgs = {
  consideredDate?: string;
  category?: Category;
};
function constructedDate(y: number, df: string) {
  return `${y}-${df}`;
}

export function getCategoryAgeDetails(params: ParseArgs) {
  const category = params.category;
  if (typeof category !== 'object' || !category) return { error: INVALID_CATEGORY };

  let { ageCategoryCode, ageMaxDate, ageMinDate, ageMax, ageMin } = category;
  const categoryName = category.categoryName;
  let combinedAge;

  const isValidCategory =
    typeMatch([ageCategoryCode, ageMaxDate, ageMinDate, categoryName], 'string') &&
    allNumeric([ageMax, ageMin]) &&
    [ageMaxDate, ageMinDate].filter(Boolean).every(isValidDateString);

  if (!isValidCategory) return { error: INVALID_CATEGORY };

  const consideredDate = params.consideredDate ?? extractDate(new Date().toLocaleDateString('sv'));
  if (!consideredDate || !isValidDateString(consideredDate)) return { error: INVALID_DATE };

  const [consideredYear] = consideredDate
    .split('-')
    .slice(0, 3)
    .map((n) => Number.parseInt(n));
  const previousDayDate = dateStringDaysChange(consideredDate, -1);
  if (!previousDayDate) return { error: INVALID_DATE };
  const [previousDayMonth, previousDay] = previousDayDate
    .split('-')
    .slice(1, 3)
    .map((n) => Number.parseInt(n));
  const previousMonthDay = `${zeroPad(previousDayMonth)}-${zeroPad(previousDay)}`;

  const nextDayDate = dateStringDaysChange(consideredDate, 1);
  if (!nextDayDate) return { error: INVALID_DATE };
  const [nextDayMonth, nextDay] = nextDayDate
    .split('-')
    .slice(1, 3)
    .map((n) => Number.parseInt(n));
  const nextMonthDay = `${zeroPad(nextDayMonth)}-${zeroPad(nextDay)}`;

  let calculatedAgeMaxDate = ageMin && dateStringDaysChange(consideredDate, -1 * 365 * ageMin);
  let calculatedAgeMinDate = ageMax && dateStringDaysChange(consideredDate, -1 * 365 * ageMax);

  const errors: string[] = [];
  const addError = (errorString: string) => !errors.includes(errorString) && errors.push(errorString);

  ageCategoryCode = ageCategoryCode ?? categoryName;

  const prePost = /^([UO]?)(\d{1,2})([UO]?)$/;
  const extractCombined = /^C(\d{1,2})-(\d{1,2})$/;

  const isBetween = ageCategoryCode?.includes('-');
  const isCombined = isBetween && ageCategoryCode?.match(extractCombined);
  const isCoded = ageCategoryCode?.match(prePost);

  // Helper functions extracted for clarity and reduced complexity

  function handleUPre(ageInt: number) {
    const ageMinYear = consideredYear - ageInt;
    const newMinDate = constructedDate(ageMinYear, nextMonthDay);

    if (category!.ageMinDate && category!.ageMinDate !== newMinDate)
      addError(`Invalid submitted ageMinDate: ${ageMinDate}`);

    ageMinDate = newMinDate;

    if (ageCategoryCode) {
      if (category!.ageMax && category!.ageMax !== ageInt - 1) {
        addError(`Invalid submitted ageMax: ${ageMax}`);
        calculatedAgeMinDate = undefined;
      }
      ageMax = ageInt - 1;
    }
  }

  function handleUPost(ageInt: number) {
    const ageMinYear = consideredYear - ageInt - 1;
    const newMinDate = constructedDate(ageMinYear, nextMonthDay);

    if (category!.ageMin && category!.ageMin > ageInt) {
      addError(`Invalid submitted ageMin: ${ageMin}`);
    }

    if (category!.ageMax && category!.ageMax > ageInt) {
      addError(`Invalid submitted ageMax: ${ageMax}`);
    }

    if (category!.ageMinDate && category!.ageMinDate !== newMinDate)
      addError(`Invalid submitted ageMinDate: ${ageMinDate}`);

    ageMinDate = newMinDate;

    if (ageCategoryCode) {
      if (category!.ageMax && category!.ageMax !== ageInt) {
        addError(`Invalid submitted ageMax: ${ageMax}`);
        calculatedAgeMaxDate = undefined;
      }
      ageMax = ageInt;
    }
  }

  function handleOPre(ageInt: number) {
    const ageMaxYear = consideredYear - ageInt;
    const newMaxDate = constructedDate(ageMaxYear, previousMonthDay);

    if (category!.ageMaxDate && category!.ageMaxDate !== newMaxDate)
      addError(`Invalid submitted ageMaxDate: ${ageMaxDate}`);

    ageMaxDate = newMaxDate;

    if (ageCategoryCode) {
      if (category!.ageMin && category!.ageMin !== ageInt + 1) {
        addError(`Invalid submitted ageMin: ${ageMin}`);
        calculatedAgeMaxDate = undefined;
      }
      ageMin = ageInt + 1;
    }
  }

  function handleOPost(ageInt: number) {
    const ageMaxYear = consideredYear - ageInt - 1;
    const newMaxDate = constructedDate(ageMaxYear, previousMonthDay);

    if (category!.ageMaxDate && category!.ageMaxDate !== newMaxDate)
      addError(`Invalid submitted ageMaxDate: ${ageMaxDate}`);

    ageMaxDate = newMaxDate;

    if (ageCategoryCode) {
      if (category!.ageMin && category!.ageMin !== ageInt) {
        addError(`Invalid submitted ageMin: ${ageMin}`);
        calculatedAgeMaxDate = undefined;
      }
      ageMin = ageInt;
    }
  }

  function processCode(code: string) {
    const matchResult = prePost.exec(code) ?? [];
    const [pre, age, post] = matchResult.slice(1);
    const ageInt = Number.parseInt(age);
    if (pre === 'U') {
      if (category!.ageMaxDate && category!.ageMaxDate !== ageMaxDate) {
        addError(`Invalid submitted ageMaxDate: ${category!.ageMaxDate}`);
      }
      handleUPre(ageInt);
    } else if (pre === 'O') {
      handleOPre(ageInt);
    }

    if (post === 'U') {
      if (category!.ageMaxDate && category!.ageMaxDate !== ageMaxDate) {
        addError(`Invalid submitted ageMaxDate: ${category!.ageMaxDate}`);
      }
      handleUPost(ageInt);
    } else if (post === 'O') {
      handleOPost(ageInt);
    }

    ageMaxDate = (ageMaxDate ?? calculatedAgeMaxDate) || undefined;
    ageMinDate = (ageMinDate ?? calculatedAgeMinDate) || undefined;
  }

  function handleCombined() {
    ageMaxDate = undefined;
    ageMinDate = undefined;
    ageMax = undefined;
    ageMin = undefined;

    if (category!.ageMin) {
      const ageMaxYear = consideredYear - category!.ageMin;
      ageMaxDate = constructedDate(ageMaxYear, previousMonthDay);
    }
    if (category!.ageMax) {
      const ageMinYear = consideredYear - category!.ageMax - 1;
      ageMinDate = constructedDate(ageMinYear, nextMonthDay);
    }

    const [lowAge, highAge] = (ageCategoryCode?.match(extractCombined) ?? []).slice(1).map((n) => Number.parseInt(n));
    if (lowAge <= highAge) {
      ageMin = lowAge;
      ageMax = highAge;
      combinedAge = true;
    } else {
      addError(`Invalid combined age range ${ageCategoryCode}`);
    }
  }

  function handleDefault() {
    if (ageMin) handleOPre(ageMin);
    if (ageMax) handleUPost(ageMax);
  }

  // Main logic
  function processCategoryCode() {
    if (isCombined) {
      handleCombined();
    } else if (isBetween) {
      ageCategoryCode?.split('-').forEach(processCode);
    } else if (isCoded && ageCategoryCode) {
      processCode(ageCategoryCode);
    } else {
      handleDefault();
    }
  }

  processCategoryCode();

  if (ageMax && category?.ageMin && category?.ageMin > ageMax) {
    addError(`Invalid submitted ageMin: ${category?.ageMin}`);
    ageMin = undefined;
  }

  const result = definedAttributes({
    consideredDate,
    combinedAge,
    ageMaxDate,
    ageMinDate,
    ageMax,
    ageMin,
  });

  if (errors.length) result.errors = errors;

  return result;
}
