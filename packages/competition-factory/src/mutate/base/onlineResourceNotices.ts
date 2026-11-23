import { modifyTournamentDetailNotice } from '@Mutate/tournaments/tournamentDetailNotice';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { modifyVenueNotice } from '@Mutate/venues/venueNotices';

// constants and types
import { INVALID_PARTICIPANT, NOT_FOUND, PARTICIPANT_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { Participant, Person, Tournament, Venue } from '@Types/tournamentTypes';

/** The venue holding a court, and the court: a court's resources are announced as a change to its venue. */
export function findResourceCourt({
  tournamentRecord,
  courtId,
  venueId,
}: {
  tournamentRecord: Tournament;
  courtId: string;
  venueId?: string;
}) {
  for (const venue of tournamentRecord.venues ?? []) {
    if (venueId && venue.venueId !== venueId) continue;
    const court = (venue.courts ?? []).find((c) => c.courtId === courtId);
    if (court) return { venue, court };
  }
  return {};
}

/**
 * The participant an online resource is attached to or removed from, and the element that holds it:
 * the participant's person when `personId` is given, otherwise the participant.
 */
export function findResourceParticipant({
  tournamentRecord,
  participantId,
  personId,
}: {
  tournamentRecord: Tournament;
  participantId?: string;
  personId?: string;
}): { participant?: Participant; element?: Participant | Person; error?: ErrorType } {
  const participant = (tournamentRecord.participants ?? []).find(
    (p) => (personId && p.person?.personId === personId) || p.participantId === participantId,
  );
  if (!participant) return { error: personId ? NOT_FOUND : PARTICIPANT_NOT_FOUND };
  if (!personId) return { participant, element: participant };
  // both personId and participantId were provided and the person does not match the found participant
  if (participant.person?.personId !== personId) return { error: INVALID_PARTICIPANT };
  return { participant, element: participant.person };
}

/**
 * Announce an online resource change on the topic of the element that holds it. The tournament's own
 * resources and matchUps' resources are announced where they are written.
 */
export function onlineResourceNotice({
  tournamentRecord,
  organisation,
  participant,
  venue,
}: {
  tournamentRecord: Tournament;
  participant?: Participant;
  organisation?: boolean;
  venue?: Venue;
}) {
  const tournamentId = tournamentRecord.tournamentId;
  if (participant) modifyParticipantsNotice({ tournamentId, participants: [participant] });
  if (venue) modifyVenueNotice({ tournamentId, venue });
  // the payload's parentOrganisation is the organisation as it now stands, resources included
  if (organisation) modifyTournamentDetailNotice({ tournamentRecord, detail: {} });
}
