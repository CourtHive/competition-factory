export function getTargetElement(target, element) {
  return (
    (target && element && Array.isArray(element) && element[target - 1]) ||
    (typeof element === 'object' && element[target])
  );
}
