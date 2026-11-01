// Acquire
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// Query
import { deriveCompetitionState } from './deriveCompetitionState';
import { getCompetitionPolicy } from './getCompetitionPolicy';

// constants
import { COMPETITION_STATE } from '@Constants/extensionConstants';

// types
import type { CompetitionPolicy, CompetitionState } from '@Types/competitionPolicyTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type GetCompetitionStateArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  event?: Event;
  /** the draw's competition policy when the caller has it; looked up otherwise */
  competitionPolicy?: CompetitionPolicy;
};

type GetCompetitionStateResult = ResultType & {
  competitionState?: CompetitionState;
};

/**
 * The draw's competition state, DERIVED from its results (`deriveCompetitionState`): the stored copy supplies only the
 * baselines and the processed rounds. Without a competition policy there is nothing to derive by, and the stored copy is
 * returned as it is.
 */
export function getCompetitionState(params: GetCompetitionStateArgs): GetCompetitionStateResult {
  const { drawDefinition } = params;
  const competitionState = getStoredCompetitionState({ drawDefinition });
  if (!competitionState) return { competitionState: undefined };
  const competitionPolicy = params.competitionPolicy ?? getCompetitionPolicy(params).competitionPolicy;
  if (!competitionPolicy) return { competitionState };
  return { competitionState: deriveCompetitionState({ competitionPolicy, competitionState, drawDefinition }) };
}

/** the stored copy, a cache of the derived state: read only for its inputs, and by the mutations that rewrite it */
export function getStoredCompetitionState({ drawDefinition }: { drawDefinition: DrawDefinition }) {
  return firstClassOrExtension({ element: drawDefinition, attribute: 'competitionState', name: COMPETITION_STATE }) as
    CompetitionState | undefined;
}
