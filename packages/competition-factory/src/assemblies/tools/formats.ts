/**
 * matchUpFormat code functions: stateless, positional, no engine (CA 2026-11-07). Their home is `tools.formats`, the
 * planned `formats` package. They are also exported by `matchUpFormatGovernor` (and `parse` / `stringify` by the score
 * governor as `parseMatchUpFormat` / `stringifyMatchUpFormat`), which mounts them on engines that cannot call them
 * correctly; those placements go at 8.0.0. The format validators take a `{ matchUpFormat }` object, so they also stay
 * callable from the governor; `tools.formats` is their 8.0.0 home (CA 2026-11-25). The governor's `isValid` alias is not
 * carried over.
 *
 * The tieFormat functions (a TEAM matchUp's format: its collections and their value) take one params object and read
 * no state (confirmed stateless, Mentat FACTORY_ENGINE_API_MIGRATION_PREP_PLAN slice A), so the tieFormat and score
 * governors also keep them in 7.x; their engine routes are unchanged.
 */
export { aggregateDeciderSetNumber, finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
export { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
export { isValidMatchUpFormat, validateMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { stringify } from '@Helpers/matchUpFormatCode/stringify';
export { parse } from '@Helpers/matchUpFormatCode/parse';

// tieFormats: also tieFormatGovernor (compareTieFormats, tieFormatGenderValidityCheck), scoreGovernor
// (validateTieFormat) and matchUpGovernor (calculateWinCriteria)
export { tieFormatGenderValidityCheck } from '@Validators/tieFormatGenderValidityCheck';
export { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
export { calculateWinCriteria } from '@Helpers/tieFormats/calculateWinCriteria';
export { validateTieFormat } from '@Validators/validateTieFormat';
