/**
 * JS-`Date` plumbing shared by the calendar-intent modules.
 *
 * These are NOT calendar intents. They are the primitives the intent modules are
 * built out of — a type guard for a parseable `Date`, and numeric padding. They
 * live in their own module so `plainDate` and `plainTime` can share them without
 * importing each other, and so the intent modules stay about intent.
 */

/** Left-pad a single-character value to two characters. */
export function zeroPad(number): string {
  return number.toString()[1] ? number : '0' + number;
}

/** True only for a value that is (or parses to) a valid `Date`; `new Date('xxx')` is false. */
export function isDate(dateArg) {
  if (typeof dateArg == 'boolean') return false;
  // ignore warnings here as Number.isNaN causes the function to behave differently
  const t = (dateArg instanceof Date && dateArg) || (!Number.isNaN(Number(dateArg)) && new Date(dateArg)) || false;
  return t && !Number.isNaN(Number(t.valueOf()));
}

/** True only for an actual `Date` instance (not a parseable string or number). */
export function isDateObject(value) {
  if (typeof value !== 'object' || Array.isArray(value)) {
    return false;
  } else {
    const datePrototype = Object.prototype.toString.call(value);
    return datePrototype === '[object Date]';
  }
}
