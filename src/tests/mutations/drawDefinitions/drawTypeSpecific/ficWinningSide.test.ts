import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FICSF, MAIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

it('can complete FIC consolation with WOWO before main', () => {
  const winningSide = 1;
  const roundNumber = 1;
  const drawProfiles = [
    {
      drawSize: 16,
      drawType: FICSF,
      outcomes: [
        { roundNumber, roundPosition: 1, winningSide },
        { roundNumber, roundPosition: 2, winningSide },
        { roundNumber, roundPosition: 3, winningSide },
        { roundNumber, roundPosition: 4, winningSide },
        { roundNumber, roundPosition: 5, winningSide },
        { roundNumber, roundPosition: 6, winningSide },
        { roundNumber, roundPosition: 7, winningSide },
        { roundNumber, roundPosition: 8, winningSide },
      ],
    },
  ];

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links.length).toEqual(3);

  const { completedMatchUps, upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(8);
  expect(upcomingMatchUps.length).toEqual(8);

  const consolationMatchUpIds = upcomingMatchUps
    .filter((matchUp) => matchUp.stage === CONSOLATION)
    .map(({ matchUpId }) => matchUpId);
  expect(consolationMatchUpIds.length).toEqual(4);

  consolationMatchUpIds.forEach((matchUpId) => {
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  const consolation2ndRoundStatuses = tournamentEngine
    .allTournamentMatchUps({
      matchUpFilters: { roundNumbers: [2] },
      contextFilters: { stages: ['CONSOLATION'] },
    })
    .matchUps.map(({ matchUpStatus }) => matchUpStatus);

  expect(unique(consolation2ndRoundStatuses)).toEqual([WALKOVER]);

  const mainMatchUpIds = upcomingMatchUps.filter((matchUp) => matchUp.stage === MAIN).map(({ matchUpId }) => matchUpId);
  expect(mainMatchUpIds.length).toEqual(4);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: mainMatchUpIds[0],
    drawId,
  });
  expect(result.success).toEqual(true);
});
