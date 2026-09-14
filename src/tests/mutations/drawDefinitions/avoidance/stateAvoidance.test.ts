import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';

const avoidancePolicy = {
  policyAttributes: [{ key: 'person.addresses.state' }],
  roundsToSeparate: 1,
  policyName: 'State',
};

it('will successfully place participants avoiding states', () => {
  const statesProfile = {
    NC: 22,
    SC: 20,
    GA: 17,
    FL: 2,
    IN: 1,
    LA: 1,
    OH: 1,
  };
  const participantsProfile = {
    nationalityCodesCount: 1,
    participantsCount: 32,
    addressProps: {
      citiesCount: 60,
      statesProfile,
    },
  };
  const mockProfile = {
    policyDefinitions: { [POLICY_TYPE_AVOIDANCE]: avoidancePolicy },
    drawProfiles: [{ drawSize: 64 }],
    participantsProfile,
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  expect(participants.length).toEqual(64);

  const states = participants.map((participant) => participant.person.addresses[0].state);
  expect(instanceCount(states)).toEqual(statesProfile);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(63);
  const statePairings = matchUps
    .filter(({ roundNumber }) => roundNumber === 1)
    .map(({ sides }) => sides.map((side) => side.participant.person.addresses[0].state));
  for (const pairing of statePairings) {
    expect(pairing[0]).not.toEqual(pairing[1]);
  }
});
