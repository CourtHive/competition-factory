import { INVALID_VALUES } from '@Constants/errorConditionConstants';

export function getTimeItemValues({ element }) {
  if (!element) return { error: INVALID_VALUES };
  if (!element.timeItems) return {};
  if (!Array.isArray(element.timeItems)) return { error: INVALID_VALUES };
  const mapItem = (key, value) => (a, i) => {
    if (!i[key]) return a;
    a[i[key]] = i[value];
    return a;
  };
  return element.timeItems.reduce(mapItem('itemType', 'itemValue'), {});
}
