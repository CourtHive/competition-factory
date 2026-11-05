type FirstClassGroupLeafOrExtensionArgs = {
  element: any;
  groupAttribute: string;
  leafAttribute: string;
  name: string;
};

/**
 * Read helper paired with `setGroupLeafOrExtension` (mutate/extensions), which writes the same value. Prefer
 * `element[groupAttribute][leafAttribute]`; fall back to the legacy
 * extension value.
 */
export function firstClassGroupLeafOrExtension({
  element,
  groupAttribute,
  leafAttribute,
  name,
}: FirstClassGroupLeafOrExtensionArgs) {
  const firstClass = element?.[groupAttribute]?.[leafAttribute];
  if (firstClass !== undefined) return firstClass;
  const ext = (element?.extensions ?? []).find((e: any) => e?.name === name);
  return ext?.value;
}
