import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

// three of the four round 1 matchUps of a draw of 8 are decided
const outcomes = [1, 2, 3].map((roundPosition) => ({
  scoreString: '6-1 6-1',
  roundNumber: 1,
  winningSide: 1,
  roundPosition,
}));

function analyze(drawType: string) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 8, outcomes }],
    setState: true,
  });
  const { drawsAnalysis } = tournamentEngine.analyzeDraws();
  return drawsAnalysis.drawAnalysis[drawId];
}

it('counts matchUps without an outcome per structure, not against the draw running total', () => {
  // Main: 7 matchUps, 3 decided; Consolation: 5 matchUps, none decided — 4 + 5 without an outcome
  const analysis = analyze(FIRST_MATCH_LOSER_CONSOLATION);
  expect(analysis.matchUpsWithWinningSideCount).toEqual(3);
  expect(analysis.matchUpsNoOutcomeCount).toEqual(9);
});

it('reports the furthest decided first round position of each structure', () => {
  const analysis = analyze(FIRST_MATCH_LOSER_CONSOLATION);
  // Main decided round positions 1-3; the consolation has no decided matchUp
  expect(
    analysis.structuresData.map(({ maxWinningSideFirstRoundPosition }) => maxWinningSideFirstRoundPosition),
  ).toEqual([3, 0]);
});

it('a single structure draw: its count was already right, its position was NaN', () => {
  const analysis = analyze(SINGLE_ELIMINATION);
  expect(analysis.matchUpsWithWinningSideCount).toEqual(3);
  expect(analysis.matchUpsNoOutcomeCount).toEqual(4);
  expect(analysis.structuresData[0].maxWinningSideFirstRoundPosition).toEqual(3);
});
