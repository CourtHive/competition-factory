import { matchUpSort } from '@Functions/sorters/matchUpSort';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { fmlc32profile } from './fmlc32';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('can generate a tournament with all results completed', () => {
  const drawProfiles = [{ drawSize: 32 }];
  mocksEngine.generateTournamentRecord({ completeAllMatchUps: true, drawProfiles, setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpStatuses = instanceCount(matchUps.map((m) => m.matchUpStatus));
  expect(matchUps.length).toEqual(31);
  expect(matchUpStatuses.COMPLETED).toEqual(31);
});

it('can generate a tournament with all partial completed', () => {
  const drawProfiles = [{ drawSize: 32, completionGoal: 20 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpStatuses = instanceCount(matchUps.map((m) => m.matchUpStatus));
  expect(matchUps.length).toEqual(31);
  expect(matchUpStatuses.COMPLETED).toEqual(20);
});

it('can generate a ROUND_ROBIN draw with all results completed', () => {
  const drawProfiles = [{ drawSize: 32, drawType: ROUND_ROBIN }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpStatuses = instanceCount(matchUps.map((m) => m.matchUpStatus));
  expect(matchUps.length).toEqual(48);
  expect(matchUpStatuses.COMPLETED).toEqual(48);
  expect(matchUpStatuses.BYE).toEqual(undefined);
});

it('can generate a ROUND_ROBIN 32 draw with 31 participants with all results completed', () => {
  const drawProfiles = [{ drawSize: 32, drawType: ROUND_ROBIN, participantsCount: 31 }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUpStatuses = instanceCount(matchUps.map((m) => m.matchUpStatus));
  expect(matchUps.length).toEqual(48);
  expect(matchUpStatuses.COMPLETED).toEqual(45);
  expect(matchUpStatuses.BYE).toEqual(3);
});

it('can generate an FMLC draw with all results completed', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 17,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  let { matchUps } = tournamentEngine.allDrawMatchUps({
    matchUpFilters: { structureIds: [mainStructure.structureId] },
    drawId,
  });

  // find the roundPosition of the one first round matchUp that was COMPLETED
  const completedRoundPosition = matchUps.find(
    ({ roundNumber, matchUpStatus }) => roundNumber === 1 && matchUpStatus === COMPLETED,
  ).roundPosition;

  // The expected # of COMPLETED and BYE matchUps varies depending on where the COMPLETED first round matchUp occurs
  // this is because of the grouping of BYEs in the consolation draw
  const case24 = [9, 11, 13, 15].includes(completedRoundPosition);
  const completed = case24 ? 24 : 23;
  const bye = case24 ? 30 : 31;

  checkMatchUpsProfile({ completed, bye, profile: fmlc32profile });

  ({ matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [consolationStructure.structureId] },
    drawId,
  }));
  expect(matchUps.filter((m) => m.preFeedRound).length).toEqual(8);
  expect(matchUps.filter((m) => m.feedRound).length).toEqual(8);
});

function checkMatchUpsProfile({ completed, bye, profile }) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const sortedMatchUpsProfile = matchUps
    .sort(matchUpSort)
    .map(({ stage, stageSequence, roundNumber, roundPosition }) => [stage, stageSequence, roundNumber, roundPosition]);
  expect(sortedMatchUpsProfile).toEqual(profile);
  const matchUpStatuses = instanceCount(matchUps.map((m) => m.matchUpStatus));
  if (matchUpStatuses.COMPLETED === completed) {
    expect(matchUpStatuses.COMPLETED).toEqual(completed);
    expect(matchUpStatuses.BYE).toEqual(bye);
  } else {
    console.log({ completed, matchUpStatuses });
    const sortedMatchUpsProfile = matchUps
      .sort(matchUpSort)
      .map(({ stage, stageSequence, roundNumber, roundPosition, matchUpStatus }) => [
        stage,
        stageSequence,
        roundNumber,
        roundPosition,
        matchUpStatus,
      ]);
    console.log(sortedMatchUpsProfile);
  }
}
