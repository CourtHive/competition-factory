export const ELEMENT_REQUIRED = 'element required';
export const MISSING_NAME = 'missing name';

/**
 * A supplied `participantName` was replaced by a name derived from `person`.
 *
 * Not an error: for an INDIVIDUAL the derived name is canonical, and `updateParticipantName: false`
 * opts out. But discarding a value the caller explicitly supplied while returning success is exactly
 * the silence that makes a no-op look like a success, so it is surfaced.
 */
export const PARTICIPANT_NAME_DERIVED_FROM_PERSON = 'participantName derived from person; supplied value not used';
