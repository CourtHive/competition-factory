import { formatPersonName } from './formatPersonName';

import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';

export function formatParticipantName({ participantMap, participant, formats }) {
  const { participantType, individualParticipantIds, person } = participant;
  const format = participantType && formats[participantType];
  if (participantType === TEAM_PARTICIPANT) return;

  if (format) {
    const { personFormat, doublesJoiner } = format;
    if (participantType === INDIVIDUAL) {
      const hasPersonName = person?.standardGivenName || person?.standardFamilyName;
      if (hasPersonName) {
        participant.participantName = formatPersonName({ person, personFormat });
      }
    }
    if (participantType === PAIR) {
      participant.participantName = individualParticipantIds
        ?.map((id) => {
          const individual = participantMap[id];
          const person = individual?.person;
          const hasPersonName = person?.standardGivenName || person?.standardFamilyName;
          return hasPersonName
            ? formatPersonName({ person, personFormat })
            : (individual?.participantOtherName || individual?.participantName || '');
        })
        .filter(Boolean)
        .join(doublesJoiner ?? '/');
    }
  }
}
