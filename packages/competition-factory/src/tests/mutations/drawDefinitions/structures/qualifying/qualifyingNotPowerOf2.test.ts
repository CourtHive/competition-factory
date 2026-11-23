import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const scenarios = [
  {
    expectation: { matchUpsCount: 21 },
    qualifyingPositions: 3,
    drawSize: 21,
  },
  {
    expectation: { matchUpsCount: 21 },
    qualifyingPositions: 3,
    drawSize: 24,
  },
  {
    expectation: { matchUpsCount: 9 },
    qualifyingPositions: 3,
    drawSize: 12,
  },
  {
    expectation: { matchUpsCount: 9 },
    qualifyingPositions: 3,
    participantsCount: 12,
  },
  {
    expectation: { matchUpsCount: 6 },
    qualifyingPositions: 6,
    participantsCount: 12,
  },
  {
    expectation: { matchUpsCount: 6 },
    qualifyingPositions: 6,
    participantsCount: 11,
  },
  {
    expectation: { matchUpsCount: 9 },
    qualifyingRoundNumber: 2,
    participantsCount: 12,
  },
  {
    expectation: { matchUpsCount: 6 },
    qualifyingRoundNumber: 1,
    participantsCount: 12,
  },
];

it.each(scenarios)('can generate qualifying non-power-of-2 # of participants', (scenario) => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        ignoreDefaults: true,
        qualifyingProfiles: [
          {
            structureProfiles: [scenario],
            roundTarget: 1,
          },
        ],
      },
    ],
  });

  if (result.error) {
    console.log(result, { scenario });
  } else {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = result;
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    if (scenario.participantsCount) {
      expect(event.entries.length).toEqual(scenario.participantsCount);
      expect(drawDefinition.entries.length).toEqual(scenario.participantsCount);
    } else if (scenario.drawSize) {
      expect(event.entries.length).toEqual(scenario.drawSize);
      expect(drawDefinition.entries.length).toEqual(scenario.drawSize);
    }

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
    expect(matchUps.length).toEqual(scenario.expectation.matchUpsCount);
  }
});
