import { getReferencedParticipants } from './getReferencedParticipants';

// types
import { Event, Tournament } from '@Types/tournamentTypes';

/**
 * The tournament record holding only the participants `event` references (its entries, flights, draws and lineUps,
 * their individuals and every group those individuals belong to), for a query that reads one event's participants.
 * Without an event the record is returned as it is.
 */
export function getEventScopedRecord({ tournamentRecord, event }: { tournamentRecord: Tournament; event?: Event }) {
  if (!event || !tournamentRecord.participants) return tournamentRecord;
  const participants = getReferencedParticipants({ participants: tournamentRecord.participants, record: event });
  return { ...tournamentRecord, participants };
}
