import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

test('changing scores after playoffs generated in team round robin with playoffs', () => {
  const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };
  const structureOptions = {
    playoffGroups: [
      { finishingPositions: [1], structureName: 'Gold Flight' },
      { finishingPositions: [2], structureName: 'Silver Flight' },
    ],
  };
  const mockProfile = {
    policyDefinitions,
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        tieFormatName: DOMINANT_DUO,
        structureOptions,
        eventType: TEAM,
        drawSize: 8,
      },
    ],
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const mainStageMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: { stages: [MAIN] },
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  expect(mainStageMatchUps.length).toEqual(12);

  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });

  mainStageMatchUps.forEach((dualMatchUp) => {
    const singlesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === SINGLES);
    singlesMatchUps.forEach((singlesMatchUp) => {
      const { matchUpId } = singlesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
    const doublesMatchUps = dualMatchUp.tieMatchUps.filter(({ matchUpType }) => matchUpType === DOUBLES);
    doublesMatchUps.forEach((doublesMatchUp) => {
      const { matchUpId } = doublesMatchUp;
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  });

  const mainStructureId = mainStageMatchUps[0].structureId;
  expect(mainStageMatchUps[0].tieFormat.tieFormatName).toEqual('Dominant Duo');

  let result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructureId,
    drawId,
  });

  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  const dualMatchUp = mainStageMatchUps[0];
  const doublesMatchUpId = dualMatchUp.tieMatchUps.find((m) => m.matchUpType === DOUBLES).matchUpId;
  const singlesMatchUpId = dualMatchUp.tieMatchUps.find((m) => m.matchUpType === SINGLES).matchUpId;

  const doublesMatchUp = matchUps.find((m) => m.matchUpId === doublesMatchUpId);
  const singlesMatchUp = matchUps.find((m) => m.matchUpId === singlesMatchUpId);

  expect(doublesMatchUp.matchUpStatus).toEqual(COMPLETED);
  expect(singlesMatchUp.matchUpStatus).toEqual(COMPLETED);

  outcome = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 2,
  }).outcome;

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: doublesMatchUp.matchUpId,
    outcome,
    drawId,
  });

  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: singlesMatchUp.matchUpId,
    outcome,
    drawId,
  });

  // no errors are thrown
  expect(result.success).toEqual(true);
});
