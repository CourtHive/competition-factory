import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES } from '@Constants/eventConstants';

tournamentEngine.devContext(true);

it('directs participant to FIRST_MATCH_LOSER_CONSOLATION consolation when walkover', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          matchUpStatus: WALKOVER,
          roundPosition: 2,
          scoreString: '',
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-2 6-1',
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, byeMatchUps } = tournamentEngine.drawMatchUps({ inContext: true, drawId });
  expect(completedMatchUps.length).toEqual(2);

  // target specific matchUp
  const targetMatchUp = byeMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [mainStructure, consolationStructure] = drawDefinition.structures;
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 3);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 5,
  );

  expect(mainDrawPosition.participantId).not.toBeUndefined();
  expect(consolationDrawPosition.bye).toEqual(true);
});

it('correctly places consolation bye for winner of 2nd round match who had bye', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          scoreString: '6-1 6-2',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-2 6-1',
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, byeMatchUps } = tournamentEngine.drawMatchUps({ inContext: true, drawId });
  expect(completedMatchUps.length).toEqual(2);

  // target specific matchUp
  const targetMatchUp = byeMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [mainStructure, consolationStructure] = drawDefinition.structures;
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 4);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 6,
  );

  expect(mainDrawPosition.participantId).toEqual(consolationDrawPosition.participantId);
});

it('correctly places consolation BYE for WALKOVER outcome 2nd round match with participant who had bye', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          scoreString: '6-1 6-2',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });

  // target specific matchUp
  const targetMatchUp = matchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [mainStructure, consolationStructure] = drawDefinition.structures;
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 2);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 1,
  );

  expect(mainDrawPosition.bye).toEqual(true);
  expect(consolationDrawPosition.participantId).toBeUndefined();
});

it('correctly places WALKOVER loser of 2nd round match who had bye into consolation', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          scoreString: '6-1 6-2',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ participantsProfile, drawProfiles });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, byeMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  });
  expect(completedMatchUps.length).toEqual(2);

  // target specific matchUp
  const targetMatchUp = byeMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [mainStructure, consolationStructure] = drawDefinition.structures;
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 2);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 1,
  );

  expect(mainDrawPosition.bye).toEqual(true);
  expect(consolationDrawPosition.participantId).not.toBeUndefined();
});

it('correctly places WALKOVER loser of 2nd round match who had BYE into consolation', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          matchUpStatus: WALKOVER,
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          matchUpStatus: WALKOVER,
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, participantsProfile });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, byeMatchUps } = tournamentEngine.drawMatchUps({ drawId, inContext: true });
  expect(completedMatchUps.length).toEqual(2);

  // target specific matchUp
  const targetMatchUp = byeMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const [mainStructure, consolationStructure] = drawDefinition.structures;
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 2);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 1,
  );

  expect(mainDrawPosition.bye).toEqual(true);
  expect(consolationDrawPosition.participantId).not.toBeUndefined();
});

it('correctly places DEFAULTED loser of 2nd round match who had BYE into consolation', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 16,
  };
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      eventType: SINGLES,
      drawSize: 16,
      outcomes: [
        {
          matchUpStatus: DEFAULTED,
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          matchUpStatus: DEFAULTED,
          roundPosition: 1,
          roundNumber: 2,
          winningSide: 2,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles, participantsProfile });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps, byeMatchUps } = tournamentEngine.drawMatchUps({ drawId, inContext: true });
  expect(completedMatchUps.length).toEqual(2);

  // target specific matchUp
  let targetMatchUp = byeMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 1 && roundPosition === 1 && stage === CONSOLATION && stageSequence === 1,
  );
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures[0];
  let consolationStructure = drawDefinition.structures[1];
  const mainDrawPosition = mainStructure.positionAssignments.find(({ drawPosition }) => drawPosition === 2);
  const consolationDrawPosition = consolationStructure.positionAssignments.find(
    ({ drawPosition }) => drawPosition === 1,
  );

  expect(mainDrawPosition.bye).toEqual(true);
  expect(consolationDrawPosition.participantId).not.toBeUndefined();

  // find 2nd round WALKOVER matchUp
  const matchUp = completedMatchUps.find(
    ({ roundNumber, roundPosition, stage, stageSequence }) =>
      roundNumber === 2 && roundPosition === 1 && stage === MAIN && stageSequence === 1,
  );
  expect(matchUp.matchUpStatus).toEqual(DEFAULTED);

  // remove outcome
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome: toBePlayed,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  targetMatchUp = matchUps.find(({ matchUpId }) => matchUp.matchUpId === matchUpId);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.score).toEqual({});
  expect(targetMatchUp.winningSide).toBeUndefined();

  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  consolationStructure = drawDefinition.structures[1];
  expect(consolationStructure.positionAssignments[0].bye).not.toEqual(true);
  expect(consolationStructure.positionAssignments[1].participantId).toBeUndefined();
});
