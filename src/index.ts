export { factoryVersion as version } from './functions/global/factoryVersion';

// GOVERNORS ------------------------------------------------------------
export * as governors from './assemblies/governors';
export * from './assemblies/governors';

// UTILITIES ------------------------------------------------------------
export * as matchUpFormatCode from './assemblies/governors/matchUpFormatGovernor';
export * as utilities from './assemblies/tools'; // deprecate
export * as tools from './assemblies/tools';

// GLOBAL STATE ---------------------------------------------------------
export * as globalState from './global/state/globalState';
export { policyRegistry } from './global/policyRegistry';

export { forge } from './forge';

// ENGINES - For cusomization --------------------------------------------
export { asyncEngine } from './assemblies/engines/async';
export { syncEngine } from './assemblies/engines/sync';
export { askEngine } from './assemblies/engines/ask';

export { matchUpEngine } from './assemblies/engines/matchUp';
export { mocksEngine } from './assemblies/engines/mock';

// ENGINES - Standalone class engines -----------------------------------
export { TemporalEngine } from './assemblies/engines/temporal';
export * as temporal from './assemblies/engines/temporal';

// ENGINES - Scale engine -----------------------------------------------
export { scaleEngine } from './assemblies/engines/scale';

// ENGINES - Sanctioning engine -----------------------------------------
export { sanctioningEngine } from './assemblies/engines/sanctioning';

// ENGINES - Officiating engine -----------------------------------------
export { officiatingEngine } from './assemblies/engines/officiating';

// ENGINES - For backwards compatibility ---------------------------------
export { competitionEngine } from './tests/engines/syncEngine';
export { tournamentEngine } from './tests/engines/syncEngine';

// FIXTURES --------------------------------------------------------------
export { fixtures } from './fixtures';

// PURE STATS — usable without an engine instance.
export { computeRatingDistributionStats } from './query/formatWizard/distributionStats';

// CONSTANTS -------------------------------------------------------------
export * as factoryConstants from './constants';
export * from './constants';

// TYPES -----------------------------------------------------------------
export type * from './types';

// Statistics types (top-level convenience re-exports)
export type { StatObject, MatchStatistics, StatCounters, StatisticsOptions } from './query/scoring/statistics/types';
export { toStatObjects } from './query/scoring/statistics/toStatObjects';
export { calculateMatchStatistics } from './query/scoring/statistics/standalone';
