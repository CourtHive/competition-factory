// this was used to float matchUps with checked in participants to the top of the sorted matchUps
export function getFloatValue(matchUp) {
  const allParticipantsCheckedIn = matchUp?.allParticipantsCheckedIn && 100;
  const checkedInParticipantsCount = (matchUp?.checkedInParticipantIds?.length || 0) * 10;

  // floatValue ensures that allParticipantsCheckedIn always floats to top as millisecond
  // differences are not always enough to differentiate
  return checkedInParticipantsCount + allParticipantsCheckedIn;
}
