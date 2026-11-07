/**
 * Draw-type predicates over a drawType (or `{ drawType }`) the caller holds: stateless and positional (CA 2026-11-07).
 * Their home is `tools.draws`; `drawsGovernor` also exports them in 7.x, and that placement goes at 8.0.0.
 */
export { isAdHocType } from '@Query/drawDefinition/isAdHocType';
export { isLadder } from '@Query/drawDefinition/isLadder';
