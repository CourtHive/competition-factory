/**
 * An eventProfile's participantsProfile that says anything beyond participantsCount describes participants
 * the tournament pool was not built to: the event generates its own, for every draw, so that they are honoured.
 * A participantsCount alone does not, and an event with drawProfiles is still sized by its draws.
 */
export function eventGeneratesOwnParticipants(eventProfile): boolean {
  const participantsProfile = eventProfile?.participantsProfile ?? {};
  return Object.keys(participantsProfile).some(
    (key) => key !== 'participantsCount' && participantsProfile[key] !== undefined,
  );
}
