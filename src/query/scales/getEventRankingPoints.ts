import { getTournamentPoints } from '@Query/scales/getTournamentPoints';
import { getParticipants } from '@Query/participants/getParticipants';

// constants and types
import { MISSING_EVENT, MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { DOUBLES } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetEventRankingPointsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  eventId: string;
  level?: number;
};

/**
 * Generates ranking points scoped to a single event.
 *
 * Returns a flat array of participant point awards enriched with
 * participantName and participantId for direct display in a table.
 *
 * Unlike getTournamentPoints (which returns personPoints keyed by personId),
 * this returns an array oriented toward event-level display.
 */
export function getEventRankingPoints({
  policyDefinitions,
  tournamentRecord,
  eventId,
  level,
}: GetEventRankingPointsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!eventId) return { error: MISSING_EVENT };

  const event = tournamentRecord.events?.find((e) => e.eventId === eventId);
  if (!event) return { error: MISSING_EVENT };

  if (!policyDefinitions?.[POLICY_TYPE_RANKING_POINTS]) {
    return { error: MISSING_POLICY_DEFINITION };
  }

  const result = getTournamentPoints({
    participantFilters: { eventIds: [eventId] },
    policyDefinitions,
    tournamentRecord,
    level,
  });

  if (result.error) return result;

  const { personPoints = {}, pairPoints = {}, teamPoints = {} } = result;

  // Build participant lookup: participantId → { name, personId }
  const { participants } = getParticipants({ tournamentRecord });
  const personToParticipant: Record<string, { participantId: string; participantName: string }> = {};
  const participantLookup: Record<string, { participantName: string; personId?: string }> = {};

  for (const p of participants ?? []) {
    participantLookup[p.participantId] = {
      participantName: p.participantName ?? '',
      personId: p.person?.personId,
    };
    if (p.person?.personId) {
      personToParticipant[p.person.personId] = {
        participantId: p.participantId,
        participantName: p.participantName ?? '',
      };
    }
  }

  // Collect awards relevant to this event's draws
  const eventDrawIds = new Set((event.drawDefinitions ?? []).map((d) => d.drawId));

  const eventAwards: any[] = [];

  // Process person points (SINGLES and attributed DOUBLES)
  for (const [personId, awards] of Object.entries(personPoints)) {
    const participant = personToParticipant[personId];
    if (!participant) continue;

    for (const award of awards as any[]) {
      if (!eventDrawIds.has(award.drawId)) continue;
      eventAwards.push({
        ...award,
        participantId: participant.participantId,
        participantName: participant.participantName,
        personId,
      });
    }
  }

  // Process pair points (DOUBLES without individual attribution)
  for (const [participantId, awards] of Object.entries(pairPoints)) {
    const info = participantLookup[participantId];
    if (!info) continue;

    for (const award of awards as any[]) {
      if (!eventDrawIds.has(award.drawId)) continue;
      eventAwards.push({
        ...award,
        participantId,
        participantName: info.participantName,
      });
    }
  }

  // Process team points
  for (const [participantId, awards] of Object.entries(teamPoints)) {
    const info = participantLookup[participantId];
    if (!info) continue;

    for (const award of awards as any[]) {
      if (!eventDrawIds.has(award.drawId)) continue;
      eventAwards.push({
        ...award,
        participantId,
        participantName: info.participantName,
      });
    }
  }

  // Sort by points descending, then by participantName
  eventAwards.sort((a, b) => (b.points || 0) - (a.points || 0) || (a.participantName ?? '').localeCompare(b.participantName ?? ''));

  // Determine if this is a doubles event (for display purposes)
  const isDoubles = event.eventType === DOUBLES;

  return {
    eventAwards,
    eventName: event.eventName,
    eventType: event.eventType,
    isDoubles,
    ...SUCCESS,
  };
}
