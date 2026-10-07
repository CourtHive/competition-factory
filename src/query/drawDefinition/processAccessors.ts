type ProcessAccessorsArgs = {
  significantCharacters?: number;
  accessors: string[];
  value: any;
};

export function processAccessors({ significantCharacters, accessors = [], value }: ProcessAccessorsArgs): string[] {
  const extractedValues: any[] = [];
  const accessor = accessors[0];
  if (value?.[accessor]) {
    const remainingKeys = accessors.slice(1);
    if (Array.isArray(value[accessor])) {
      const values = value[accessor];
      values.forEach((nestedValue) => {
        const result = processAccessors({
          accessors: remainingKeys,
          significantCharacters,
          value: nestedValue,
        });
        extractedValues.push(...result);
      });
    } else {
      value = value[accessor];
      if (remainingKeys.length) {
        const result = processAccessors({
          accessors: remainingKeys,
          significantCharacters,
          value,
        });
        extractedValues.push(...result);
      } else {
        checkValue({ value });
      }
    }
  }

  function checkValue({ value }) {
    if (value && ['string', 'number'].includes(typeof value)) {
      const extractedValue = significantCharacters ? String(value).slice(0, significantCharacters) : value;
      extractedValues.push(extractedValue);
    }
  }
  return extractedValues;
}
