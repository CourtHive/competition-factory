import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { ABANDONED, CANCELLED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

test('completed matchUp outcomes with no winningSide will not cause destructuring errors', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN,
        drawSize: 4,
        outcomes: [
          {
            matchUpStatus: CANCELLED,
            drawPositions: [1, 2],
          },
          {
            matchUpStatus: ABANDONED,
            drawPositions: [1, 3],
          },
          {
            matchUpStatus: DOUBLE_WALKOVER,
            drawPositions: [2, 4],
          },
        ],
      },
    ],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const matchUpStatuses = matchUps.map(({ matchUpStatus }) => matchUpStatus);
  expect(matchUpStatuses).toEqual([ABANDONED, CANCELLED, DOUBLE_WALKOVER, TO_BE_PLAYED, TO_BE_PLAYED, TO_BE_PLAYED]);
});
