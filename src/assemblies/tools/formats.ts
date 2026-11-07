/**
 * matchUpFormat code functions: stateless, positional, no engine (CA 2026-11-07). Their home is `tools.formats`, the
 * planned `formats` package. They are also exported by `matchUpFormatGovernor` (and `parse` / `stringify` by the score
 * governor as `parseMatchUpFormat` / `stringifyMatchUpFormat`), which mounts them on engines that cannot call them
 * correctly; those placements go at 8.0.0.
 */
export { aggregateDeciderSetNumber, finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
export { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
export { stringify } from '@Helpers/matchUpFormatCode/stringify';
export { parse } from '@Helpers/matchUpFormatCode/parse';
