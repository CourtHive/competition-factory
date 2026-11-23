// Query
import { getCompetitionState } from './getCompetitionState';

// types
import type { CompetitionParticipantState } from '@Types/competitionPolicyTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type GetCompetitionParticipantStateArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string;
  event?: Event;
};

type GetCompetitionParticipantStateResult = ResultType & {
  participantState?: CompetitionParticipantState;
};

export function getCompetitionParticipantState({
  tournamentRecord,
  drawDefinition,
  participantId,
  event,
}: GetCompetitionParticipantStateArgs): GetCompetitionParticipantStateResult {
  const { competitionState } = getCompetitionState({ tournamentRecord, drawDefinition, event });
  const participantState = competitionState?.participantStates?.[participantId];
  return { participantState };
}
