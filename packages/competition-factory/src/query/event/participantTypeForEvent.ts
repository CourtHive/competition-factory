import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';

// The single source of truth for "which participantType does an event of this type require".
// Shared by checkValidEntries (entry validation) and getEventInconsistencies (integrity scan) so
// the two never diverge. HYBRID events are the exception — they accept both INDIVIDUAL and PAIR —
// and are handled by callers, not here.
export function expectedParticipantType(eventType?: string): string {
  return (eventType === TEAM_EVENT && TEAM) || (eventType === DOUBLES_EVENT && PAIR) || INDIVIDUAL;
}
