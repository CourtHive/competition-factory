import { formatPersonName } from './formatPersonName';

// constants and types
import { INDIVIDUAL, PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { Participant } from '@Types/tournamentTypes';

/** How a participant type's names are written: a person format (e.g. `LAST, F.`) and a doubles joiner. */
export type ParticipantNameFormats = { [participantType: string]: { personFormat: string; doublesJoiner?: string } };

type FormatParticipantNameArgs = {
  participantMap: { [participantId: string]: Participant };
  formats: ParticipantNameFormats;
  participant: Participant;
};

export function formatParticipantName({ participantMap, participant, formats }: FormatParticipantNameArgs) {
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
        ?.map((id: string) => {
          const individual = participantMap[id];
          const person = individual?.person;
          const hasPersonName = person?.standardGivenName || person?.standardFamilyName;
          return hasPersonName
            ? formatPersonName({ person, personFormat })
            : individual?.participantOtherName || individual?.participantName || '';
        })
        .filter(Boolean)
        .join(doublesJoiner ?? '/');
    }
  }
}
