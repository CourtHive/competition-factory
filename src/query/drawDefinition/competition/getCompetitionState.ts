// Acquire
import { findExtension } from '@Acquire/findExtension';

// Constants
import { COMPETITION_STATE } from '@Constants/extensionConstants';

// Types
import type { CompetitionState } from '@Types/competitionPolicyTypes';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type GetCompetitionStateArgs = {
  drawDefinition: DrawDefinition;
};

type GetCompetitionStateResult = ResultType & {
  competitionState?: CompetitionState;
};

export function getCompetitionState({ drawDefinition }: GetCompetitionStateArgs): GetCompetitionStateResult {
  const { extension } = findExtension({ element: drawDefinition, name: COMPETITION_STATE });
  return { competitionState: extension?.value as CompetitionState | undefined };
}
