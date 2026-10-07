import { processAccessors } from '@Query/drawDefinition/processAccessors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';

it('can procsess nested keys', () => {
  const participant = {
    teams: [
      {
        participantName: 'Team 1',
      },
    ],
    participantName: 'Italo Stewart',
  };
  const result = processAccessors({
    accessors: ['teams', 'participantName'],
    value: participant,
  });
  expect(result).toEqual(['Team 1']);
});

// checkValue accepts numbers, but `significantCharacters` called `value.slice`, which a number lacks:
// an avoidance policy truncating a numeric attribute (a postal code stored as a number) threw, and
// draw generation failed with "value.slice is not a function".
it('truncates a numeric value to its significant characters instead of throwing', () => {
  const participant = { person: { addresses: [{ postalCode: 12345 }, { postalCode: '98765' }] } };
  const result = processAccessors({
    accessors: ['person', 'addresses', 'postalCode'],
    significantCharacters: 3,
    value: participant,
  });
  expect(result).toEqual(['123', '987']);

  // without significantCharacters a number is returned as it was
  expect(processAccessors({ accessors: ['person', 'addresses', 'postalCode'], value: participant })).toEqual([
    12345,
    '98765',
  ]);

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 16 } }],
  });
  tournamentRecord.participants.forEach((participant, index) => {
    if (participant.person) participant.person.addresses = [{ postalCode: 10000 + (index % 4) * 1000 + index } as any];
  });
  tournamentEngine.setState(tournamentRecord);

  const policyAttributes = [{ key: 'person.addresses.postalCode', significantCharacters: 2 }];
  const generation: any = tournamentEngine.generateDrawDefinition({
    policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: { policyAttributes } },
    drawSize: 16,
    eventId,
  });
  expect(generation.error).toBeUndefined();
  expect(generation.drawDefinition).toBeDefined();
});
