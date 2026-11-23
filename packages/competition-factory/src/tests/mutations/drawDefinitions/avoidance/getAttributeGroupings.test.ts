import { getAttributeGroupings } from '@Query/participants/getAttributeGrouping';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and fixtures
import { participantTypes } from '@Constants/participantConstants';
import { fixtures } from '@Fixtures/index';

const { PAIR } = participantTypes;

it('can generate groupings accurately', () => {
  const { participants } = mocksEngine.generateParticipants({
    nationalityCodesCount: 10,
    addressProps: {
      postalCodesCount: 10,
      citiesCount: 10,
      statesCount: 10,
    },

    participantsCount: 32,
    participantType: PAIR,
    inContext: true,
  });

  const doublesParticipants = participants.filter((participant) => participant.participantType === PAIR);

  const doublesParticipantsIds = doublesParticipants.map((participant) => participant.participantId);

  const doublesParticipantsNationalityCodes = Object.assign(
    {},
    ...doublesParticipants.map((participant) => {
      const nationalityCodes = participant.individualParticipants.map((individualParticipant) => {
        return individualParticipant.person.nationalityCode;
      });
      return { [participant.participantId]: nationalityCodes };
    }),
  );

  expect(Object.keys(doublesParticipantsNationalityCodes).length).toEqual(32);

  const policyAttributes = fixtures.policies.POLICY_AVOIDANCE_COUNTRY.avoidance.policyAttributes;
  const groupings = getAttributeGroupings({
    targetParticipantIds: doublesParticipantsIds,
    policyAttributes,
    participants,
  });

  Object.keys(groupings).forEach((nationalityCode) => {
    const groupingParticipantIds = groupings[nationalityCode];
    groupingParticipantIds.forEach((participantId) => {
      const includesNationalityCode = doublesParticipantsNationalityCodes[participantId].includes(nationalityCode);
      expect(includesNationalityCode).toEqual(true);
    });
  });
});
