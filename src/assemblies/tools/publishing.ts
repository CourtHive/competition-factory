/**
 * Publishing predicates over a publish detail the caller holds: stateless and positional (CA 2026-11-07). A clock is
 * an input: each takes `asOf`, the instant to judge an embargo against (7.x falls back to the competition clock).
 * Their home is `tools.publishing`; `publishingGovernor` also exports them in 7.x, and that placement goes at 8.0.0.
 */
export { getRoundVisibilityState } from '@Query/publishing/getRoundVisibilityState';
export { isEmbargoed, isVisiblyPublished } from '@Query/publishing/isEmbargoed';
