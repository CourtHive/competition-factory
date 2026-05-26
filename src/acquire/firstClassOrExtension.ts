import { findExtension } from './findExtension';

type FirstClassOrExtensionArgs = {
  element: any;
  attribute: string;
  name: string;
};

/**
 * Read helper for the CODES schemaWriteMode transition.
 *
 * Returns the first-class attribute value if defined, otherwise falls back to
 * the legacy extension value. Used everywhere a former-extension is read so
 * that records written in any write mode (NATIVE, DUAL, LEGACY) read
 * identically.
 *
 * When both are present the first-class field wins — that is the authority in
 * a CODES-aware system; the extension is the legacy mirror.
 */
export function firstClassOrExtension({ element, attribute, name }: FirstClassOrExtensionArgs) {
  if (element?.[attribute] !== undefined) return element[attribute];
  const { extension } = findExtension({ element, name });
  return extension?.value;
}
