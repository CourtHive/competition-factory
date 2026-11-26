/**
 * Draw-type predicates over a drawType (or `{ drawType }`) the caller holds: stateless and positional.
 * Their home is `tools.draws`; `drawsGovernor` also exports them in 7.x, and that placement goes at 8.0.0.
 *
 * Below them, draw queries that take one params object and read no state (confirmed stateless by the
 * statelessGovernorTools test): draw-type coercion, feed-in qualifying positions, seeding thresholds,
 * round robin group sizes and tallies, and playoff group validation. `drawsGovernor` keeps them in 7.x; their engine
 * routes are unchanged.
 */
export { isAdHocType } from '@Query/drawDefinition/isAdHocType';
export { isLadder } from '@Query/drawDefinition/isLadder';

// params-object queries, also drawsGovernor
export { getValidGroupSizes } from '@Helpers/drawTopology/roundRobin/validGroupSizes';
export { getFeedInQualifyingPositions } from '@Generators/drawDefinitions/feedInQualifying';
export { getDrawTypeCoercion } from '@Generators/drawDefinitions/getDrawTypeCoercion';
export { getSeedingThresholds } from '@Query/drawDefinition/getSeedBlocks';
export { validatePlayoffGroups } from '@Validators/validatePlayoffGroups';
export { getTally } from '@Query/structure/getTally';
