import { isString } from './objects';

export function capitalizeFirst(str) {
  return !isString(str)
    ? str
    : str
        .split(' ')
        .map((name) =>
          name
            .split('')
            .map((c, i) => (i ? c.toLowerCase() : c.toUpperCase()))
            .join(''),
        )
        .join(' ');
}

export function constantToString(str) {
  return !isString(str) ? '' : capitalizeFirst(str.replace(/_/g, ' '));
}

/**
 * Collapse every run of whitespace to a single space and trim the ends.
 *
 * Names arrive from forms and spreadsheets carrying whitespace nobody typed on
 * purpose — a trailing space left in a first-name field, a double space pasted
 * out of a roster. HTML collapses the run when it renders, so the artifact is
 * invisible on screen and surfaces only where a string is compared: a search for
 * `'Michael Livson'` misses the stored `'Michael  Livson'`. Trimming alone never
 * reaches an interior run, which is why this collapses rather than trims.
 *
 * Non-strings pass through untouched, matching `capitalizeFirst`.
 */
export function collapseWhitespace(str) {
  return !isString(str) ? str : str.replace(/\s+/g, ' ').trim();
}
