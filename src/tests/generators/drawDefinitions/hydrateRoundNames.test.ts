import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Fixtures
import { POLICY_ROUND_NAMING_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_NAMING_DEFAULT';

it('can hydrate roundNames when generating drawDefinitions', () => {
  const participantsCount = 16;
  const eventId = 'eventId';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventId, eventName: 'Mock Event', participantsProfile: { participantsCount } }],
    setState: true,
  });

  const appliedPolicies = POLICY_ROUND_NAMING_DEFAULT;
  let result = tournamentEngine.generateDrawDefinition({
    drawSize: participantsCount,
    hydrateRoundNames: true,
    appliedPolicies,
    eventId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.getAllDrawMatchUps({ drawDefinition: result.drawDefinition }).matchUps;
  const roundNames = matchUps
    .filter((m) => m.roundNumber && m.roundName)
    .map((m) => ({ roundNumber: m.roundNumber, roundName: m.roundName, abbreviatedRoundName: m.abbreviatedRoundName }));

  const expectedRoundNames = [
    { roundNumber: 1, roundName: 'R16', abbreviatedRoundName: 'R16' },
    { roundNumber: 2, roundName: 'Quarterfinal', abbreviatedRoundName: 'QF' },
    { roundNumber: 3, roundName: 'Semifinal', abbreviatedRoundName: 'SF' },
    { roundNumber: 4, roundName: 'Final', abbreviatedRoundName: 'F' },
  ];

  expectedRoundNames.forEach((expected) => {
    const matchUpRound = roundNames.find((r) => r.roundNumber === expected.roundNumber);
    expect(matchUpRound).toEqual(expected);
  });
});
