import { findParticipant } from './findParticipant';

// constants and types
import { ContextProfile, PolicyDefinitions, TournamentRecords } from '@Types/factoryTypes';
import { ErrorType, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type PublicFindParticipantArgs = {
  tournamentRecords?: TournamentRecords;
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  contextProfile?: ContextProfile;
  participantId?: string;
  personId?: string;
};
export function publicFindParticipant(params: PublicFindParticipantArgs): {
  participant?: HydratedParticipant;
  tournamentId?: string;
  error?: ErrorType;
  stack?: any;
} {
  const { tournamentRecord, policyDefinitions, contextProfile, participantId, personId } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ||
    {};

  if (typeof participantId !== 'string' && typeof personId !== 'string')
    return { error: MISSING_VALUE, stack: 'publicFindParticipant' };

  let participant, tournamentId;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    tournamentId = tournamentRecord.tournamentId;

    const tournamentParticipants = tournamentRecord.participants ?? [];
    participant = findParticipant({
      tournamentParticipants,
      internalUse: true,
      policyDefinitions,
      contextProfile,
      participantId,
      personId,
    });

    if (participant) break;
  }

  return { participant, tournamentId, ...SUCCESS };
}
