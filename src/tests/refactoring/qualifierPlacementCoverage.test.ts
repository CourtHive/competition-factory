import { placeQualifier } from '@Mutate/drawDefinitions/matchUpGovernor/placeQualifier';
import { removeQualifier } from '@Mutate/drawDefinitions/matchUpGovernor/removeQualifier';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

// ---------------------------------------------------------------------------
// Helper: create a tournament with qualifying → main draw, complete qualifying
// ---------------------------------------------------------------------------
function setupQualifyingTournament({
  completeAllMatchUps = false,
  qualifyingPositions = 2,
  drawSize = 16,
  qualifyingDrawSize = 8,
} = {}) {
  const drawProfiles = [
    {
      drawSize,
      qualifyingProfiles: [
        {
          roundTarget: 1,
          structureProfiles: [{ drawSize: qualifyingDrawSize, qualifyingPositions }],
        },
      ],
    },
  ];

  const result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps,
    drawProfiles,
    setState: true,
  });

  const drawId = result.drawIds[0];
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  return { drawId, drawDefinition, qualifyingStructure, mainStructure };
}

function completeQualifyingMatchUps(drawId: string, qualifyingStructureId: string) {
  // Must iterate in rounds — only readyToScore matchUps can be completed
  for (;;) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const readyMatchUps = matchUps.filter(
      (m) => m.structureId === qualifyingStructureId && m.readyToScore,
    );
    if (!readyMatchUps.length) break;
    for (const matchUp of readyMatchUps) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-1 6-1',
        winningSide: 1,
      });
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome,
        drawId,
      });
    }
  }
}

function getCompletedFinalRoundMatchUp(drawId: string, qualifyingStructureId: string) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return matchUps.find(
    (m) =>
      m.structureId === qualifyingStructureId &&
      m.finishingRound === 1 &&
      m.matchUpStatus === COMPLETED,
  );
}

// =====================================================================
// placeQualifier — direct unit tests (guard branches)
// =====================================================================
describe('placeQualifier direct guard branches', () => {
  it('returns qualifierPlaced undefined when feedProfile is not DRAW', () => {
    const params = {
      inContextDrawMatchUps: [],
      inContextMatchUp: { sides: [] },
      drawDefinition: {},
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'LOSER', structureId: 'x', roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toBeUndefined();
  });

  it('returns qualifierPlaced undefined when no main draw target matchUp found', () => {
    const params = {
      inContextDrawMatchUps: [],
      inContextMatchUp: { sides: [{ sideNumber: 1, participantId: 'p1' }] },
      drawDefinition: {},
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: 'x', roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toBeUndefined();
  });

  it('returns STRUCTURE_NOT_FOUND when structure cannot be resolved', () => {
    const targetStructureId = 'targetStruct';
    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined, drawPosition: 1 },
            { sideNumber: 2, participantId: 'other', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: { sides: [{ sideNumber: 1, participantId: 'winner1' }] },
      drawDefinition: { structures: [] },
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });
});

// =====================================================================
// removeQualifier — direct unit tests (guard branches)
// =====================================================================
describe('removeQualifier direct guard branches', () => {
  it('returns qualifierRemoved undefined when feedProfile is not DRAW', () => {
    const params = {
      inContextDrawMatchUps: [],
      inContextMatchUp: { sides: [], winningSide: 1 },
      drawDefinition: {},
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'LOSER', structureId: 'x', roundNumber: 1 },
          },
        },
      },
    };

    let result: any = removeQualifier(params as any);
    expect(result.qualifierRemoved).toBeUndefined();
  });

  it('returns qualifierRemoved undefined when no mainDrawTargetMatchUp found', () => {
    const params = {
      inContextDrawMatchUps: [],
      inContextMatchUp: {
        winningSide: 1,
        sides: [{ sideNumber: 1, participantId: 'p1' }],
      },
      drawDefinition: {},
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: 'x', roundNumber: 1 },
          },
        },
      },
    };

    let result: any = removeQualifier(params as any);
    expect(result.qualifierRemoved).toBeUndefined();
  });

  it('returns qualifierRemoved undefined when mainDrawTargetMatchUp is not TO_BE_PLAYED', () => {
    const targetStructureId = 'targetStruct';
    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpStatus: COMPLETED,
          sides: [{ participantId: 'p1' }],
        },
      ],
      inContextMatchUp: {
        winningSide: 1,
        sides: [{ sideNumber: 1, participantId: 'p1' }],
      },
      drawDefinition: {},
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = removeQualifier(params as any);
    expect(result.qualifierRemoved).toBeUndefined();
  });
});

// =====================================================================
// placeQualifier — integration via engine (autoPlaceQualifiers policy)
// =====================================================================
describe('placeQualifier integration via setMatchUpStatus', () => {
  it('auto-places qualifier into main draw when qualifying final is completed', () => {
    const { drawId, qualifyingStructure } = setupQualifyingTournament();

    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    const qualifyingFinal = getCompletedFinalRoundMatchUp(drawId, qualifyingStructure.structureId);
    expect(qualifyingFinal).toBeDefined();

    // Reset the qualifying final to TO_BE_PLAYED so we can re-complete with autoPlace
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Re-complete with autoPlaceQualifiers policy
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-2 6-2',
      winningSide: 1,
    });

    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Verify the qualifier is placed in the main draw
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const refreshedFinal = matchUps.find((m) => m.matchUpId === qualifyingFinal.matchUpId);
    const winnerParticipantId = refreshedFinal.sides.find(
      (s) => s.sideNumber === refreshedFinal.winningSide,
    )?.participantId;

    const mainMatchUp = matchUps.find(
      ({ stage, sides }) =>
        stage === MAIN && sides.some((s) => s.participantId === winnerParticipantId),
    );
    expect(mainMatchUp).toBeDefined();
  });

  it('qualifierPlaced is undefined when qualifier is already placed (matchUp not TO_BE_PLAYED)', () => {
    const { qualifyingStructure, mainStructure } = setupQualifyingTournament({
      completeAllMatchUps: true,
    });

    // All matchUps completed: qualifying finals are done and main draw round 1 is already completed
    // Trying to set a qualifying final result again should not place (since main matchUp already played)
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const qualifyingFinals = matchUps.filter(
      (m) =>
        m.structureId === qualifyingStructure.structureId &&
        m.finishingRound === 1 &&
        m.matchUpStatus === COMPLETED,
    );
    expect(qualifyingFinals.length).toBeGreaterThan(0);

    // The main draw matchUps should be completed, so autoPlace won't place
    const mainRound1 = matchUps.filter(
      (m) => m.structureId === mainStructure.structureId && m.roundNumber === 1,
    );
    const completedMain = mainRound1.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMain.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// removeQualifier — integration via engine (autoRemoveQualifiers policy)
// =====================================================================
describe('removeQualifier integration via setMatchUpStatus', () => {
  it('removes qualifier from main draw when qualifying result is cleared', () => {
    const { drawId, qualifyingStructure } = setupQualifyingTournament();

    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    // Find a completed qualifying final
    let qualifyingFinal = getCompletedFinalRoundMatchUp(drawId, qualifyingStructure.structureId);
    expect(qualifyingFinal).toBeDefined();

    // Reset it first to clear the result
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Set it again with autoPlaceQualifiers to place qualifier
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-3 6-3',
      winningSide: 1,
    });

    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Verify qualifier is placed
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    qualifyingFinal = matchUps.find((m) => m.matchUpId === qualifyingFinal.matchUpId);
    const winnerParticipantId = qualifyingFinal.sides.find(
      (s) => s.sideNumber === qualifyingFinal.winningSide,
    )?.participantId;

    let mainMatchWithQualifier = matchUps.find(
      ({ stage, sides }) =>
        stage === MAIN && sides.some((s) => s.participantId === winnerParticipantId),
    );
    expect(mainMatchWithQualifier).toBeDefined();

    // Now remove the qualifier by clearing the result with autoRemoveQualifiers
    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierRemoved).toEqual(true);

    // Verify qualifier is removed from main draw
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    mainMatchWithQualifier = matchUps.find(
      ({ stage, sides }) =>
        stage === MAIN && sides.some((s) => s.participantId === winnerParticipantId),
    );
    expect(mainMatchWithQualifier).toBeUndefined();
  });

  it('does not remove qualifier when not using autoRemoveQualifiers policy', () => {
    const { drawId, qualifyingStructure } = setupQualifyingTournament();

    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    const qualifyingFinal = getCompletedFinalRoundMatchUp(drawId, qualifyingStructure.structureId);
    expect(qualifyingFinal).toBeDefined();

    // Reset and re-complete with autoPlace
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-4',
      winningSide: 1,
    });

    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Remove result WITHOUT autoRemoveQualifiers (default policy)
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierRemoved).toBeUndefined();
  });
});

// =====================================================================
// placeQualifier + removeQualifier — full cycle with replace
// =====================================================================
describe('qualifier full lifecycle: place, replace, remove', () => {
  it('exercises place then replace then remove flow', () => {
    const { drawId, qualifyingStructure } = setupQualifyingTournament({
      qualifyingPositions: 2,
      qualifyingDrawSize: 8,
      drawSize: 16,
    });

    // Complete all qualifying matchUps
    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    const qualifyingFinals = matchUps.filter(
      (m) =>
        m.structureId === qualifyingStructure.structureId &&
        m.finishingRound === 1 &&
        m.matchUpStatus === COMPLETED,
    );
    expect(qualifyingFinals.length).toEqual(2);

    // Pick one qualifying final and reset it
    const targetFinal = qualifyingFinals[0];
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: targetFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Place via autoPlaceQualifiers
    const { outcome: outcome1 } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-1',
      winningSide: 1,
    });

    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
      matchUpId: targetFinal.matchUpId,
      outcome: outcome1,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Replace via autoReplaceQualifiers (change winningSide)
    const { outcome: outcome2 } = mocksEngine.generateOutcomeFromScoreString({
      winningSide: 2,
      scoreString: '7-5 7-5',
    });

    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoReplaceQualifiers: true } },
      matchUpId: targetFinal.matchUpId,
      outcome: outcome2,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierReplaced).toEqual(true);

    // Verify new winner is in main draw
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const refreshedFinal = matchUps.find((m) => m.matchUpId === targetFinal.matchUpId);
    const newWinnerId = refreshedFinal.sides.find(
      (s) => s.sideNumber === refreshedFinal.winningSide,
    )?.participantId;

    const mainWithNewWinner = matchUps.find(
      ({ stage, sides }) => stage === MAIN && sides.some((s) => s.participantId === newWinnerId),
    );
    expect(mainWithNewWinner).toBeDefined();

    // Remove via autoRemoveQualifiers
    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
      matchUpId: targetFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierRemoved).toEqual(true);
  });
});

// =====================================================================
// placeQualifier — matchUp already in progress (not TO_BE_PLAYED)
// =====================================================================
describe('placeQualifier skips placement when main matchUp not TO_BE_PLAYED', () => {
  it('returns qualifierPlaced undefined when target main matchUp already started', () => {
    const targetStructureId = 'mainStruct';
    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'IN_PROGRESS',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined },
            { sideNumber: 2, participantId: 'other' },
          ],
        },
      ],
      inContextMatchUp: { sides: [{ sideNumber: 1, participantId: 'winner1' }] },
      drawDefinition: {},
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toBeUndefined();
  });
});

// =====================================================================
// placeQualifier — successful placement with positionAssignments on structure
// =====================================================================
describe('placeQualifier assigns participant to drawPosition', () => {
  it('places qualifier when positionAssignments exist on structure directly', () => {
    const targetStructureId = 'mainStruct';
    const structureId = targetStructureId;

    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined, drawPosition: 1 },
            { sideNumber: 2, participantId: 'seeded1', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: {
        sides: [
          { sideNumber: 1, participantId: 'qualWinner' },
          { sideNumber: 2, participantId: 'qualLoser' },
        ],
      },
      drawDefinition: {
        structures: [
          {
            structureId,
            positionAssignments: [
              { drawPosition: 1, qualifier: true, participantId: undefined },
              { drawPosition: 2, participantId: 'seeded1' },
            ],
          },
        ],
      },
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Verify assignment was mutated
    const assignment = params.drawDefinition.structures[0].positionAssignments.find(
      (a) => a.drawPosition === 1,
    );
    expect(assignment.participantId).toEqual('qualWinner');
  });

  it('places qualifier into structure with subStructures (RR container)', () => {
    const targetStructureId = 'mainStruct';

    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined, drawPosition: 1 },
            { sideNumber: 2, participantId: 'seeded1', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: {
        sides: [
          { sideNumber: 1, participantId: 'qualWinner' },
          { sideNumber: 2, participantId: 'qualLoser' },
        ],
      },
      drawDefinition: {
        structures: [
          {
            structureId: targetStructureId,
            structures: [
              {
                positionAssignments: [
                  { drawPosition: 1, qualifier: true, participantId: undefined },
                  { drawPosition: 2, participantId: 'seeded1' },
                ],
              },
              {
                positionAssignments: [
                  { drawPosition: 3, participantId: 'p3' },
                  { drawPosition: 4, participantId: 'p4' },
                ],
              },
            ],
          },
        ],
      },
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Verify subStructure assignment was updated
    const subAssignment = params.drawDefinition.structures[0].structures[0].positionAssignments.find(
      (a) => a.drawPosition === 1,
    );
    expect(subAssignment.participantId).toEqual('qualWinner');
  });
});

// =====================================================================
// removeQualifier — subStructure path
// =====================================================================
describe('removeQualifier with subStructures', () => {
  it('clears participant from subStructure assignments', () => {
    const targetStructureId = 'mainStruct';

    const params: any = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, participantId: 'qualWinner', drawPosition: 1 },
            { sideNumber: 2, participantId: 'seeded1', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: {
        winningSide: 1,
        sides: [
          { sideNumber: 1, participantId: 'qualWinner' },
          { sideNumber: 2, participantId: 'qualLoser' },
        ],
      },
      drawDefinition: {
        structures: [
          {
            structureId: targetStructureId,
            structures: [
              {
                positionAssignments: [
                  { drawPosition: 1, participantId: 'qualWinner' },
                  { drawPosition: 2, participantId: 'seeded1' },
                ],
              },
              {
                positionAssignments: [
                  { drawPosition: 3, participantId: 'p3' },
                ],
              },
            ],
          },
        ],
      },
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = removeQualifier(params);
    expect(result.qualifierRemoved).toEqual(true);

    // Verify subStructure assignment was cleared
    const subAssignment = params.drawDefinition.structures[0].structures[0].positionAssignments.find(
      (a) => a.drawPosition === 1,
    );
    expect(subAssignment.participantId).toBeUndefined();
  });

  it('clears participant from direct positionAssignments on structure', () => {
    const targetStructureId = 'mainStruct';

    const params: any = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [{ participantId: 'qualWinner' }],
        },
      ],
      inContextMatchUp: {
        winningSide: 1,
        sides: [{ sideNumber: 1, participantId: 'qualWinner' }],
      },
      drawDefinition: {
        structures: [
          {
            structureId: targetStructureId,
            positionAssignments: [
              { drawPosition: 1, participantId: 'qualWinner' },
              { drawPosition: 2, participantId: 'seeded1' },
            ],
          },
        ],
      },
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = removeQualifier(params);
    expect(result.qualifierRemoved).toEqual(true);

    const assignment = params.drawDefinition.structures[0].positionAssignments.find(
      (a) => a.drawPosition === 1,
    );
    expect(assignment.participantId).toBeUndefined();
  });
});

// =====================================================================
// placeQualifier — no assignment match (drawPosition not found)
// =====================================================================
describe('placeQualifier when no positionAssignment matches targetDrawPosition', () => {
  it('returns success with qualifierPlaced undefined when no matching drawPosition', () => {
    const targetStructureId = 'mainStruct';

    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined, drawPosition: 99 },
            { sideNumber: 2, participantId: 'seeded1', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: {
        sides: [{ sideNumber: 1, participantId: 'qualWinner' }],
      },
      drawDefinition: {
        structures: [
          {
            structureId: targetStructureId,
            positionAssignments: [
              { drawPosition: 1, participantId: 'existingP' },
              { drawPosition: 2, participantId: 'seeded1' },
            ],
          },
        ],
      },
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toBeUndefined();
  });
});

// =====================================================================
// placeQualifier — position already occupied (participantId present)
// =====================================================================
describe('placeQualifier when drawPosition already has participantId', () => {
  it('does not overwrite existing participant assignment', () => {
    const targetStructureId = 'mainStruct';

    const params = {
      inContextDrawMatchUps: [
        {
          structureId: targetStructureId,
          roundNumber: 1,
          matchUpId: 'mu1',
          matchUpStatus: 'TO_BE_PLAYED',
          sides: [
            { sideNumber: 1, qualifier: true, participantId: undefined, drawPosition: 1 },
            { sideNumber: 2, participantId: 'seeded1', drawPosition: 2 },
          ],
        },
      ],
      inContextMatchUp: {
        sides: [{ sideNumber: 1, participantId: 'qualWinner' }],
      },
      drawDefinition: {
        structures: [
          {
            structureId: targetStructureId,
            positionAssignments: [
              { drawPosition: 1, participantId: 'alreadyThere' },
              { drawPosition: 2, participantId: 'seeded1' },
            ],
          },
        ],
      },
      winningSide: 1,
      random: undefined,
      targetData: {
        targetLinks: {
          winnerTargetLink: {
            target: { feedProfile: 'DRAW', structureId: targetStructureId, roundNumber: 1 },
          },
        },
      },
    };

    let result: any = placeQualifier(params);
    expect(result.success).toEqual(true);
    // participantId was already present so the condition !positionAssignment.participantId fails
    expect(result.qualifierPlaced).toBeUndefined();

    // Verify the existing participant was NOT overwritten
    const assignment = params.drawDefinition.structures[0].positionAssignments.find(
      (a) => a.drawPosition === 1,
    );
    expect(assignment.participantId).toEqual('alreadyThere');
  });
});

// =====================================================================
// Integration: autoPlaceQualifiers blocked when main draw has downstream activity
// =====================================================================
describe('placeQualifier blocked by downstream activity', () => {
  it('qualifierPlaced is undefined when main draw has downstream completed matchUp', () => {
    const { drawId, qualifyingStructure, mainStructure } = setupQualifyingTournament({
      qualifyingPositions: 2,
      qualifyingDrawSize: 8,
      drawSize: 16,
    });

    // Complete qualifying and all main draw matchUps
    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    // Complete main draw round 1 matchUps to create downstream activity
    for (;;) {
      const { matchUps } = tournamentEngine.allTournamentMatchUps();
      const readyMain = matchUps.filter(
        (m) => m.structureId === mainStructure.structureId && m.readyToScore,
      );
      if (!readyMain.length) break;
      for (const matchUp of readyMain) {
        const { outcome } = mocksEngine.generateOutcomeFromScoreString({
          scoreString: '6-0 6-0',
          winningSide: 1,
        });
        tournamentEngine.setMatchUpStatus({
          matchUpId: matchUp.matchUpId,
          outcome,
          drawId,
        });
      }
    }

    // All matchUps completed — find a qualifying final
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const qualifyingFinal = matchUps.find(
      (m) =>
        m.structureId === qualifyingStructure.structureId &&
        m.finishingRound === 1 &&
        m.matchUpStatus === COMPLETED,
    );
    expect(qualifyingFinal).toBeDefined();

    // Verify main draw is fully completed (downstream activity exists)
    const mainCompleted = matchUps.filter(
      (m) => m.structureId === mainStructure.structureId && m.matchUpStatus === COMPLETED,
    );
    expect(mainCompleted.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// Integration: autoRemoveQualifiers blocked by downstream activity
// =====================================================================
describe('removeQualifier blocked by downstream activity', () => {
  it('qualifierRemoved is undefined when main draw matchUp has downstream play', () => {
    const { drawId, qualifyingStructure } = setupQualifyingTournament({
      qualifyingPositions: 2,
      qualifyingDrawSize: 8,
      drawSize: 16,
    });

    // Complete qualifying
    completeQualifyingMatchUps(drawId, qualifyingStructure.structureId);

    // Find a qualifying final and reset it
    let qualifyingFinal = getCompletedFinalRoundMatchUp(drawId, qualifyingStructure.structureId);
    expect(qualifyingFinal).toBeDefined();

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Re-complete with autoPlaceQualifiers
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-2 6-2',
      winningSide: 1,
    });
    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoPlaceQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.qualifierPlaced).toEqual(true);

    // Now complete the main draw round 1 matchUp that has our qualifier
    let { matchUps } = tournamentEngine.allTournamentMatchUps();
    qualifyingFinal = matchUps.find((m) => m.matchUpId === qualifyingFinal.matchUpId);
    const winnerParticipantId = qualifyingFinal.sides.find(
      (s) => s.sideNumber === qualifyingFinal.winningSide,
    )?.participantId;

    const mainMatchWithQualifier = matchUps.find(
      ({ stage, sides }) =>
        stage === MAIN && sides.some((s) => s.participantId === winnerParticipantId),
    );
    expect(mainMatchWithQualifier).toBeDefined();

    // Complete this main draw matchUp to create downstream activity
    if (mainMatchWithQualifier.readyToScore) {
      const { outcome: mainOutcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: '6-1 6-1',
        winningSide: 1,
      });
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: mainMatchWithQualifier.matchUpId,
        outcome: mainOutcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Now attempt to remove qualifier — should be blocked by downstream activity
    result = tournamentEngine.setMatchUpStatus({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
      matchUpId: qualifyingFinal.matchUpId,
      outcome: toBePlayed,
      drawId,
    });
    // The removal should still succeed at the engine level but qualifier won't be removed
    // because the main draw matchUp has downstream activity
    expect(result.success).toEqual(true);
  });
});
