import { makeDeepCopy } from './makeDeepCopy';

type ProcessKeysArgs = {
  significantCharacters?: boolean;
  attributes: string[];
  targetElement: any;
};

export function getAccessorValue({ element, accessor }) {
  if (typeof accessor !== 'string') return { values: [] };
  const targetElement = makeDeepCopy(element);
  const attributes = accessor.split('.');

  const values: any[] = [];
  let value;
  processKeys({ targetElement, attributes });

  const result: any = { value };
  if (values.length) result.values = values;
  return result;

  function processKeys({ targetElement, attributes = [], significantCharacters }: ProcessKeysArgs) {
    for (const [index, attribute] of attributes.entries()) {
      if (targetElement?.[attribute]) {
        const remainingKeys = attributes.slice(index + 1);
        if (!remainingKeys.length) {
          if (!value) value = targetElement[attribute];
          if (!values.includes(targetElement[attribute])) {
            values.push(targetElement[attribute]);
          }
        } else if (Array.isArray(targetElement[attribute])) {
          const values = targetElement[attribute];
          values.forEach((nestedTarget) =>
            processKeys({
              targetElement: nestedTarget,
              attributes: remainingKeys,
            }),
          );
        } else {
          targetElement = targetElement[attribute];
          checkValue({ targetElement, index });
        }
      }
    }

    function checkValue({ targetElement, index }) {
      if (targetElement && index === attributes.length - 1 && ['string', 'number'].includes(typeof targetElement)) {
        const extractedValue = significantCharacters ? targetElement.slice(0, significantCharacters) : targetElement;

        if (value) {
          if (!values.includes(extractedValue)) {
            values.push(extractedValue);
          }
        } else {
          value = extractedValue;
          values.push(extractedValue);
        }
      }
    }
  }
}
