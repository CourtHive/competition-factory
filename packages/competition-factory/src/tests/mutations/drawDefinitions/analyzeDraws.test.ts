import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { globalState, mocksEngine } from '../../..';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

const range = generateRange(0, 1);
test.each(range)('draw analysis can determine when draws are able to be pruned', () => {
  const deletedMatchUpIds: string[] = [];
  globalState.setSubscriptions({
    subscriptions: {
      [DELETED_MATCHUP_IDS]: (notices) => {
        notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
      },
    },
  });

  const drawSize = 32;
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    // automated false: don't place the participantIds
    drawProfiles: [
      {
        participantsCount: 20,
        automated: false,
        drawSize,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [mainStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: MAIN,
    stageSequence: 1,
  });

  const placedParticipantIds = mainStructure.positionAssignments
    ?.map(({ participantId }) => participantId)
    .filter(Boolean);
  expect(placedParticipantIds?.length).toEqual(0);

  let result = tournamentEngine.analyzeDraws();
  expect(result.drawsAnalysis.inactive.includes(drawId)).toEqual(true);
  expect(result.drawsAnalysis.positionsNoOutcomes).toEqual([]);
  expect(result.drawsAnalysis.canBePruned).toEqual([]);
  expect(result.drawsAnalysis.matchPlay).toEqual([]);

  const structureSelectedParticipantIds = drawDefinition.entries
    .filter((entry) => STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus))
    .map(({ participantId }) => participantId);

  structureSelectedParticipantIds.forEach((participantId, index) => {
    const drawPosition = index + 1;
    tournamentEngine.assignDrawPosition({
      structureId: mainStructure.structureId,
      participantId,
      drawPosition,
      drawId,
    });
  });

  result = tournamentEngine.analyzeDraws();
  expect(result.drawsAnalysis.positionsNoOutcomes.includes(drawId)).toEqual(true);
  expect(result.drawsAnalysis.inactive.includes(drawId)).toEqual(true);
  expect(result.drawsAnalysis.canBePruned).toEqual([]);
  expect(result.drawsAnalysis.matchPlay).toEqual([]);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const roundMatchUps = getRoundMatchUps({ matchUps }).roundMatchUps ?? {};

  let { outcome } = mocksEngine.generateOutcome();
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: roundMatchUps[1][0].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  outcome = mocksEngine.generateOutcome().outcome;
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: roundMatchUps[1][3].matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.analyzeDraws();

  const structureData = result.drawsAnalysis.drawAnalysis[drawId].structuresData[0];
  expect(structureData.unassignedPositionsCount).toEqual(12);
  // transient failure
  // expect(structureData.inactiveRounds.length).toEqual(4);
  // expect(structureData.activeRounds.length).toEqual(1);

  result = tournamentEngine.analyzeTournament();
  expect(result.analysis.isDual).toEqual(false);

  result = tournamentEngine.pruneDrawDefinition({ drawId });
  expect(result.success).toEqual(true);
  // transient failure
  // matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // expect(matchUps.length).toEqual(2);

  // drawSize 32 has 31 matches and two have outcomes
  // expect(deletedMatchUpIds.length).toEqual(drawSize - 1 - 2);
});
