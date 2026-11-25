/**
 * matchUpFormat code functions: stateless, positional, no engine (CA 2026-11-07). Their home is `tools.formats`, the
 * planned `formats` package. They are also exported by `matchUpFormatGovernor` (and `parse` / `stringify` by the score
 * governor as `parseMatchUpFormat` / `stringifyMatchUpFormat`), which mounts them on engines that cannot call them
 * correctly; those placements go at 8.0.0.
 *
 * The three format validators take an object (`{ matchUpFormat }`), so the positional guard does not see them, but they
 * are stateless too: `tools.formats` is the single format surface at 8.0.0 (CA 2026-11-08, plan item 11). `isValid` is
 * `isValidMatchUpFormat` under the matchUpFormat governor's short name.
 */
export { aggregateDeciderSetNumber, finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
export { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
export { isValidMatchUpFormat as isValid, isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { validateMatchUpFormat } from '@Validators/isValidMatchUpFormat';
export { stringify } from '@Helpers/matchUpFormatCode/stringify';
export { parse } from '@Helpers/matchUpFormatCode/parse';
