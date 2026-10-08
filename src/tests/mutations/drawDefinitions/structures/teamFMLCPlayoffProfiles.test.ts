import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const expectedRanges = [
  { finishingPositions: [5, 6, 7, 8], finishingPositionRange: '5-8', roundNumber: 2 },
  { finishingPositions: [3, 4], finishingPositionRange: '3-4', roundNumber: 3 },
];

function generate({ completeAllMatchUps }) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, eventType: TEAM_EVENT, drawSize: 16 }],
    completeAllMatchUps,
  });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  const structureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;
  return { tournamentRecord, drawDefinition, structureId, drawId };
}

// the FIRST_MATCHUP target round of a TEAM draw holds TEAM matchUps AND their tieMatchUps;
// only the TEAM matchUps decide whether the round's losers can still be played off
it('offers 5-8 from round 2 of an unplayed TEAM FIRST_MATCH_LOSER_CONSOLATION draw', () => {
  const { tournamentRecord, structureId, drawId } = generate({ completeAllMatchUps: false });
  tournamentEngine.setState(tournamentRecord);

  const { playoffRounds, playoffRoundsRanges } = tournamentEngine.getAvailablePlayoffProfiles({ structureId, drawId });
  expect(playoffRounds).toEqual([2, 3]);
  expect(playoffRoundsRanges).toEqual(expectedRanges);
});

it('offers 5-8 from round 2 of a completed TEAM FIRST_MATCH_LOSER_CONSOLATION draw', () => {
  const { tournamentRecord, drawDefinition, structureId, drawId } = generate({ completeAllMatchUps: true });

  // a completed draw with no byes feeds nobody into consolation round 2: 4 TEAM matchUps, 12 tieMatchUps
  const consolation = drawDefinition.structures.find(({ stage }) => stage === CONSOLATION);
  const consolationR2 = consolation.matchUps.filter(({ roundNumber }) => roundNumber === 2);
  expect(consolationR2.length).toEqual(4);

  tournamentEngine.setState(structuredClone(tournamentRecord));
  let result = tournamentEngine.getAvailablePlayoffProfiles({ structureId, drawId });
  expect(result.playoffRounds).toEqual([2, 3]);
  expect(result.playoffRoundsRanges).toEqual(expectedRanges); // was 5-44: 40 matchUps counted

  // a lineUp left on the fed side populates the tieMatchUps' fed side but not the TEAM matchUp's;
  // this was the shape of the reported record, where round 2 was not offered at all
  const { lineUp } = drawDefinition.structures
    .find(({ stage }) => stage === MAIN)
    .matchUps.find(({ roundNumber }) => roundNumber === 1).sides[0];
  expect(lineUp.length).toBeGreaterThan(0);
  for (const matchUp of consolationR2) {
    matchUp.sides = [{ sideNumber: 1, lineUp }, ...matchUp.sides.filter(({ sideNumber }) => sideNumber !== 1)];
  }
  tournamentEngine.setState(tournamentRecord);
  result = tournamentEngine.getAvailablePlayoffProfiles({ structureId, drawId });
  expect(result.playoffRounds).toEqual([2, 3]);
  expect(result.playoffRoundsRanges).toEqual(expectedRanges);

  result = tournamentEngine.generateAndPopulatePlayoffStructures({ roundProfiles: [{ 2: 1 }], structureId, drawId });
  expect(result.success).toEqual(true);
});
