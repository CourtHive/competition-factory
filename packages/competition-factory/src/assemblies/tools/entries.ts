/**
 * Entry fee helpers over fee values the caller holds: stateless and positional (CA 2026-11-07). Their home is
 * `tools.entries`; `entriesGovernor` also exports them in 7.x, and that placement goes at 8.0.0.
 */
export { getEntryFeeRange, isIndeterminateFee, resolveEntryFee } from '@Query/entries/resolveEntryFee';
