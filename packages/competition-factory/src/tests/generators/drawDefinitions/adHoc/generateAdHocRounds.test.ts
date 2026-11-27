import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC } from '@Constants/drawDefinitionConstants';

it('can generate multiple AD_HOC rounds', () => {
  const drawSize = 32;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        drawSize,
      },
    ],
    setState: true,
  });

  const matchUpsResult = tournamentEngine.allTournamentMatchUps();
  expect(matchUpsResult.matchUps.length).toEqual(Math.floor(drawSize / 2));
  expect(true).toEqual(true);

  const roundsCount = 3;
  const matchUps = tournamentEngine.generateAdHocRounds({ drawId, roundsCount }).matchUps;
  expect(matchUps.length).toEqual(roundsCount * (drawSize / 2));
});

it('can generate AD_HOC with only 2 participants', () => {
  const drawSize = 2;
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P' },
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        drawId: 'did',
        drawSize,
      },
    ],
    setState: true,
  });
  expect(
    defined(
      defined(
        defined(defined(result.tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0].structures,
        'structures',
      )[0].matchUps,
      'matchUps',
    ).length,
  ).toBe(1);
});
