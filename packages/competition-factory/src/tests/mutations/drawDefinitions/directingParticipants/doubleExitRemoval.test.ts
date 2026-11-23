import { printGlobalLog } from '@Functions/global/globalLog';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import { DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { COMPASS } from '@Constants/drawDefinitionConstants';

const getTarget = (params) =>
  params.matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === params.roundNumber &&
      matchUp.roundPosition === params.roundPosition &&
      (!params.structureName || matchUp.structureName === params.structureName),
  );

test('removing a doubleExit will remove propagated BYEs', () => {
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, idPrefix: 'm' }],
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ drawId }).matchUps;
  let matchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const targetMatchUpId = matchUp.matchUpId;

  expect(matchUp.matchUpId).toEqual('m-East-RP-1-2');
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUp = tournamentEngine.allTournamentMatchUps({ drawId }).matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
  expect(matchUp.sides.find((s) => s.sideNumber === 1).bye).toEqual(true);

  const log = false;
  tournamentEngine.devContext({ log });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUpId,
    outcome: toBePlayed,
    drawId,
  });
  expect(result.success).toEqual(true);

  if (log) printGlobalLog(true);

  // check that the BYE has been removed
  matchUp = tournamentEngine.allTournamentMatchUps({ drawId }).matchUps.find((m) => m.matchUpId === 'm-South-RP-1-1');
  expect(matchUp.sides.find((s) => s.sideNumber === 1).bye).toBeUndefined();
});
