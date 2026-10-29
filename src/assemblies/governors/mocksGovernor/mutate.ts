import { completeDrawMatchUps as completeDraw } from '@Mutate/simulation/completeDrawMatchUps';

export { anonymizeTournamentRecord } from '@Generators/tournamentRecords/anonymizeTournamentRecord';
export { removeMatchUpOutcome } from '@Generators/mocks/removeMatchUpOutcome';
export { modifyTournamentRecord } from '@Generators/mocks/modifyTournamentRecord';

/** @deprecated moved to `simulationGovernor`; this name is removed at 8.0.0 */
export const completeDrawMatchUps = completeDraw;
