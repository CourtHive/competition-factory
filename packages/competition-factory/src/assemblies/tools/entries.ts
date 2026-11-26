/**
 * Entry fee helpers over fee values the caller holds: stateless and positional. Their home is
 * `tools.entries`; `entriesGovernor` also exports them in 7.x, and that placement goes at 8.0.0.
 *
 * Below them, entry queries that take one params object and read no state (confirmed stateless by the
 * statelessGovernorTools test): entry status ordering, the highest entry position, and whether one
 * category can contain another. `entriesGovernor` (and `eventGovernor` for `categoryCanContain`) keeps them in 7.x;
 * their engine routes are unchanged.
 */
export { getEntryFeeRange, isIndeterminateFee, resolveEntryFee } from '@Query/entries/resolveEntryFee';

// params-object queries, also entriesGovernor and eventGovernor
export { getEntryStatusOrdinals } from '@Query/entries/getEntryStatusOrdinals';
export { categoryCanContain } from '@Helpers/categories/categoryCanContain';
export { getMaxEntryPosition } from '@Query/entries/getMaxEntryPosition';
