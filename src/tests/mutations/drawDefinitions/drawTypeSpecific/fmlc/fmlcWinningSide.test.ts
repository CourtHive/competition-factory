import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';

it('can complete FMLC consolation with BYE before main', () => {
  const winningSide = 1;
  const roundNumber = 1;
  const stage = 'CONSOLATION';
  const drawProfiles = [
    {
      drawSize: 16,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      outcomes: [
        { roundNumber, roundPosition: 1, winningSide },
        { roundNumber, roundPosition: 2, winningSide },
        { roundNumber, roundPosition: 3, winningSide },
        { roundNumber, roundPosition: 4, winningSide },
        { roundNumber, roundPosition: 5, winningSide },
        { roundNumber, roundPosition: 6, winningSide },
        { roundNumber, roundPosition: 7, winningSide },
        { roundNumber, roundPosition: 8, winningSide },
        { stage, roundNumber: 1, roundPosition: 1, winningSide },
        { stage, roundNumber: 1, roundPosition: 2, winningSide },
        { stage, roundNumber: 1, roundPosition: 3, winningSide },
        { stage, roundNumber: 1, roundPosition: 4, winningSide },
        { stage, roundNumber: 3, roundPosition: 1, winningSide },
        { stage, roundNumber: 3, roundPosition: 2, winningSide },
        { stage, roundNumber: 4, roundPosition: 1, winningSide },
      ],
    },
  ];

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.links.length).toEqual(2);

  const { completedMatchUps, upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(15);
  expect(upcomingMatchUps.length).toEqual(4);

  const matchUpIds = upcomingMatchUps.filter((matchUp) => matchUp.stage === MAIN).map(({ matchUpId }) => matchUpId);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 2 },
    matchUpId: matchUpIds[0],
    drawId,
  });
  expect(result.success).toEqual(true);
});
