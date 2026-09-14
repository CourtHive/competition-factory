import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

it('can generate and seed a qualifying structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            structureProfiles: [
              {
                qualifyingPositions: 4,
                drawSize: 8,
              },
            ],
          },
        ],
      },
    ],
    completeAllMatchUps: true,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructureId = drawDefinition.structures.find(({ stage }) => stage === MAIN).structureId;

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: mainStructureId,
    drawId,
  });

  const qualifyingDrawPositions = positionAssignments
    .filter(({ qualifier }) => qualifier)
    .map(({ drawPosition }) => drawPosition);

  // assign all qualifiers to main structure positions
  for (const drawPosition of qualifyingDrawPositions) {
    let result = tournamentEngine.positionActions({
      structureId: mainStructureId,
      drawPosition,
      drawId,
    });
    const qualifyingAction = result.validActions.find(({ type }) => type === QUALIFYING_PARTICIPANT);
    const qualifyingParticipantId = qualifyingAction.qualifyingParticipantIds[0];
    const payload = { ...qualifyingAction.payload, qualifyingParticipantId };
    result = tournamentEngine[qualifyingAction.method](payload);
    expect(result.success).toEqual(true);
  }

  // complete all remaining matchUps
  let incompleteMatchUps = tournamentEngine.allDrawMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
    drawId,
  }).matchUps;

  let safety = incompleteMatchUps.length;
  while (incompleteMatchUps.length && safety) {
    const roundProfile =
      getRoundMatchUps({
        matchUps: incompleteMatchUps,
      }).roundProfile ?? {};
    const roundNumbers: number[] = Object.keys(roundProfile).map((k) => parseInt(k));
    const minRound = Math.min(...roundNumbers);
    const matchUp = incompleteMatchUps.find(({ roundNumber }) => roundNumber === minRound);

    const { outcome } = mocksEngine.generateOutcome();
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    incompleteMatchUps = tournamentEngine.allDrawMatchUps({
      matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
      drawId,
    }).matchUps;
    safety -= 1;
  }
  expect(incompleteMatchUps.length).toEqual(0);

  const participants = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
    convertExtensions: true,
    withStatistics: true,
    withOpponents: true,
    withGroupings: true,
    withMatchUps: true,
    withSeeding: true,
    withDraws: true,
    participantFilters: {
      participantRoles: ['COMPETITOR'],
    },
  }).participants;

  const mmw = participants.find((p) => {
    const stages = p.matchUps.map((m) => m.stage);
    return stages.includes('MAIN') && stages.includes('QUALIFYING');
  });
  expect(mmw.matchUps.length >= 2).toEqual(true);

  const p = tournamentEngine.getParticipants({
    withDraws: true,
  }).participants;

  const pwd = p.find((x) => x.participantId === mmw.participantId);
  expect(mmw.draws.length).toEqual(1);
  expect(pwd.draws.length).toEqual(mmw.draws.length);
});
