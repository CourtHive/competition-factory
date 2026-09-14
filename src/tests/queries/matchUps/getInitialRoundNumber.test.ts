import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can accurately determine initialRoundNumber', () => {
  const drawProfiles = [
    {
      drawType: ROUND_ROBIN,
      drawSize: 8,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  generateRange(1, 9).forEach((drawPosition) => {
    const { initialRoundNumber } = getInitialRoundNumber({
      drawPosition,
      matchUps,
    });
    expect(initialRoundNumber).toEqual(1);
  });
});
