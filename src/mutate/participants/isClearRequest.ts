/**
 * An explicit empty string means "clear this field". `undefined` must keep meaning "leave
 * untouched" — consumers send the whole participant (and the whole person object) on every save,
 * so a field they do not manage has to survive the round trip.
 *
 * Clearing DELETES the key rather than storing '', so readers see an absent field instead of a
 * falsy one each of them would have to special-case.
 *
 * Shared rather than duplicated: `modifyParticipant` and `modifyParticipantOtherName` both write
 * `participantOtherName`, and for a while they disagreed about what '' meant — one cleared, the
 * other stored an empty string. One definition is the point.
 */
export function isClearRequest(value) {
  return value === '';
}
