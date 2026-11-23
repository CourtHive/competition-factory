/*
 * What `getDualIssues` reports about a TEAM dual. Per line: the line's `matchUpId` (and its collection) is named.
 */
export const LINEUP_INCOMPLETE = 'LINEUP_INCOMPLETE'; // a side has no participant, or a doubles side has one
export const DUPLICATE_IN_COLLECTION = 'DUPLICATE_IN_COLLECTION'; // one participant on two lines of a collection
export const INELIGIBLE_GENDER = 'INELIGIBLE_GENDER'; // does not fit the collection's (or line's) gender
export const INELIGIBLE_CATEGORY = 'INELIGIBLE_CATEGORY'; // outside the collection's (or line's) category ages
export const SCORE_INCOMPLETE = 'SCORE_INCOMPLETE'; // a COMPLETED line whose score does not satisfy its format
export const MISSING_REASON = 'MISSING_REASON'; // a RETIRED or DEFAULTED line with no status code

/*
 * Per dual: the dual itself is the subject.
 */
export const DUAL_DECIDED = 'DUAL_DECIDED'; // one team has won with lines still unplayed (`matchUpIds`)
export const MANUAL_SCORE = 'MANUAL_SCORE'; // automatic team scoring is off: the score is held by hand
export const MANUAL_SCORE_DIVERGES = 'MANUAL_SCORE_DIVERGES'; // the held score differs from what the lines produce

export const dualIssueConstants = {
  LINEUP_INCOMPLETE,
  DUPLICATE_IN_COLLECTION,
  INELIGIBLE_GENDER,
  INELIGIBLE_CATEGORY,
  SCORE_INCOMPLETE,
  MISSING_REASON,
  DUAL_DECIDED,
  MANUAL_SCORE,
  MANUAL_SCORE_DIVERGES,
} as const;
