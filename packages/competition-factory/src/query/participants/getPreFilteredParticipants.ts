import { filterParticipants } from '@Query/participants/filterParticipants';
import { withGroupings } from './getReferencedParticipants';

// types
import { Participant, Tournament } from '@Types/tournamentTypes';
import { ParticipantFilters } from '@Types/factoryTypes';

// each of these reads other participants (opponents, matchUps, schedules, statistics), so with any of them the whole
// pool is built. withDraws returns the tournament's matchUps, whose sides are built from the map.
const CROSS_PARTICIPANT_OPTIONS = [
  'withPotentialMatchUps',
  'withRankingProfile',
  'withScheduleItems',
  'scheduleAnalysis',
  'withTeamMatchUps',
  'withStatistics',
  'withOpponents',
  'withMatchUps',
  'withDraws',
];

/**
 * Whether getParticipants can build only the participants its filters can keep. Only when the caller does not ask
 * for the participantMap (which holds every participant, filtered or not), filters something, filters nothing by
 * `accessorValues` (which reads built participants), and asks for nothing that reads other participants.
 */
export function canPreFilter(params: { participantFilters?: ParticipantFilters; returnParticipantMap?: boolean }) {
  const { participantFilters } = params;
  return (
    params.returnParticipantMap === false &&
    !!participantFilters &&
    Object.keys(participantFilters).length > 0 &&
    !participantFilters.accessorValues &&
    !CROSS_PARTICIPANT_OPTIONS.some((option) => (params as Record<string, unknown>)[option])
  );
}

type GetPreFilteredParticipantsArgs = {
  participantFilters: ParticipantFilters;
  tournamentRecord: Tournament;
};

/**
 * The stored participants the filters keep, with their groupings: every filter but `accessorValues` reads stored
 * attributes only (type, role, id, sex, presence, responsibilities, entries, positions), so the stored participants
 * filter exactly as the built ones do.
 */
export function getPreFilteredParticipants({ participantFilters, tournamentRecord }: GetPreFilteredParticipantsArgs) {
  const participants: Participant[] = tournamentRecord.participants ?? [];
  const kept = filterParticipants({ participants, participantFilters, tournamentRecord });
  const participantIds = new Set(kept.map(({ participantId }) => participantId));
  return withGroupings({ participants, participantIds });
}

/**
 * What getParticipantMap reports as missing when it builds the whole pool, in its order: a participant without an id,
 * and every member id a group names that no participant holds.
 */
export function getMissingParticipantIds(participants: Participant[]): string[] {
  const ids = new Set(participants.map((participant) => participant?.participantId).filter(Boolean));
  const missing: string[] = [];
  for (const { participantId, individualParticipantIds } of participants) {
    if (!ids.has(participantId)) {
      missing.push(participantId);
      continue;
    }
    for (const individualId of individualParticipantIds ?? []) {
      if (!ids.has(individualId)) missing.push(individualId);
    }
  }
  return missing;
}
