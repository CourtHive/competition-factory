// Query
import { getCompetitionState } from './getCompetitionState';

// Types
import type { CompetitionParticipantState } from '@Types/competitionPolicyTypes';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type GetCompetitionParticipantStateArgs = {
  drawDefinition: DrawDefinition;
  participantId: string;
};

type GetCompetitionParticipantStateResult = ResultType & {
  participantState?: CompetitionParticipantState;
};

export function getCompetitionParticipantState({
  drawDefinition,
  participantId,
}: GetCompetitionParticipantStateArgs): GetCompetitionParticipantStateResult {
  const { competitionState } = getCompetitionState({ drawDefinition });
  const participantState = competitionState?.participantStates?.[participantId];
  return { participantState };
}
