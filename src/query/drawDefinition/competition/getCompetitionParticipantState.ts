// Query
import { getCompetitionState } from './getCompetitionState';

// Types
import { CompetitionParticipantState } from '@Types/competitionPolicyTypes';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

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
