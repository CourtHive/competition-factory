import { generateOutcomeFromScoreString as outcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { generateOutcome as outcome } from '@Generators/simulation/generateOutcome';

export { generateTournamentRecord } from '@Generators/mocks/generateTournamentRecord';
export { generateEventWithDraw } from '@Generators/mocks/generateEventWithDraw';
export { generateParticipants } from '@Generators/mocks/generateParticipants';

/** @deprecated moved to `simulationGovernor`; this name is removed at 8.0.0 */
export const generateOutcomeFromScoreString = outcomeFromScoreString;
/** @deprecated moved to `simulationGovernor`; this name is removed at 8.0.0 */
export const generateOutcome = outcome;
