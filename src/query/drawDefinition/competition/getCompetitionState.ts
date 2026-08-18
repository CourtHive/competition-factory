// Acquire
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// Constants
import { COMPETITION_STATE } from '@Constants/extensionConstants';

// Types
import { CompetitionState } from '@Types/competitionPolicyTypes';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type GetCompetitionStateArgs = {
  drawDefinition: DrawDefinition;
};

type GetCompetitionStateResult = ResultType & {
  competitionState?: CompetitionState;
};

export function getCompetitionState({ drawDefinition }: GetCompetitionStateArgs): GetCompetitionStateResult {
  const competitionState = firstClassOrExtension({
    element: drawDefinition,
    attribute: 'competitionState',
    name: COMPETITION_STATE,
  });
  return { competitionState: competitionState as CompetitionState | undefined };
}
