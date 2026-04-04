import { getParticipants as participantGetter } from './getParticipants';

// constants and types
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { ParticipantMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUp } from '@Types/tournamentTypes';

export function getCompetitionParticipants(params): ResultType & {
  mappedMatchUps?: { [key: string]: HydratedMatchUp };
  participantIdsWithConflicts?: string[];
  participants?: HydratedParticipant[];
  participantMap?: ParticipantMap;
  matchUps?: MatchUp[];
  derivedEventInfo?: any;
  derivedDrawInfo?: any;
  success?: boolean;
} {
  const { tournamentRecords } = params ?? {};
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length) {
    return { error: MISSING_TOURNAMENT_RECORDS };
  }

  const participants: HydratedParticipant[] = [];
  const participantMap: ParticipantMap = {}; // turn into Map
  const derivedEventInfo: any = {};
  const derivedDrawInfo: any = {};
  const matchUps: MatchUp[] = [];
  const mappedMatchUps = {};

  const participantIdsWithConflicts: string[] = [];
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const {
      participantIdsWithConflicts: idsWithConflicts,
      mappedMatchUps: tournamentMappedMatchUps,
      participantMap: tournamentParticipantMap,
      participants: tournamentParticipants,
      matchUps: tournamentMatchUps,
      derivedEventInfo: eventInfo,
      derivedDrawInfo: drawInfo,
    } = participantGetter({ ...params, tournamentRecord });

    Object.assign(mappedMatchUps, tournamentMappedMatchUps);
    Object.assign(participantMap, tournamentParticipantMap);
    Object.assign(derivedEventInfo, eventInfo);
    Object.assign(derivedDrawInfo, drawInfo);

    participants.push(...(tournamentParticipants ?? []));
    matchUps.push(...(tournamentMatchUps ?? []));

    idsWithConflicts?.forEach((participantId) => {
      if (!participantIdsWithConflicts.includes(participantId)) participantIdsWithConflicts.push(participantId);
    });
  }
  return {
    participantIdsWithConflicts,
    derivedEventInfo,
    derivedDrawInfo,
    participantMap,
    mappedMatchUps,
    participants,
    ...SUCCESS,
    matchUps,
  };
}
