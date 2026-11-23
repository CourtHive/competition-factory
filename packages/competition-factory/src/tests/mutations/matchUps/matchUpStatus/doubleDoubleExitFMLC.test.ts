import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

const scenarios = [{ removals: ['FMLC-1-2', 'FMLC-1-1'] }, { removals: ['FMLC-1-1', 'FMLC-1-2'] }];

test.each(scenarios)('removing one of two adjacent double exits will preserve propagated BYE', (scenario) => {
  const drawId = 'did';
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'FMLC',
        drawSize: 8,
        drawId,
        outcomes: [
          {
            matchUpStatus: DOUBLE_DEFAULT,
            roundPosition: 1,
            roundNumber: 1,
          },
          {
            matchUpStatus: DOUBLE_DEFAULT,
            roundPosition: 2,
            roundNumber: 1,
          },
        ],
      },
    ],
    setState: true,
  });
  expect(result.success).toBe(true);

  // consolation matchUp with propagated BYE
  const matchUpId = 'FMLC-c-2-1';

  result = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(result.matchUpStatus).toBe(BYE);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: TO_BE_PLAYED },
    matchUpId: scenario.removals[0],
    drawId,
  });
  expect(result.success).toBe(true);

  result = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(result.matchUpStatus).toBe(BYE);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: TO_BE_PLAYED },
    matchUpId: scenario.removals[1],
    drawId,
  });
  expect(result.success).toBe(true);

  result = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(result.matchUpStatus).toBe(TO_BE_PLAYED);
});
