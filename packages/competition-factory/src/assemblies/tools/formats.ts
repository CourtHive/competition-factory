/**
 * matchUpFormat code functions: stateless, positional, no engine (CA 2026-11-07). Their home is `tools.formats`, the
 * planned `formats` package. They are also exported by `matchUpFormatGovernor` (and `parse` / `stringify` by the score
 * governor as `parseMatchUpFormat` / `stringifyMatchUpFormat`), which mounts them on engines that cannot call them
 * correctly; those placements go at 8.0.0. The format validators take a `{ matchUpFormat }` object, so they also stay
 * callable from the governor; `tools.formats` is their 8.0.0 home (CA 2026-11-25). The governor's `isValid` alias is not
 * carried over.
 */
export { aggregateDeciderSetNumber, finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
export { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
export { isValidMatchUpFormat, validateMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { stringify } from '@Helpers/matchUpFormatCode/stringify';
export { parse } from '@Helpers/matchUpFormatCode/parse';
