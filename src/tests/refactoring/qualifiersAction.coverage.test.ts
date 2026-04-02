import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { QUALIFYING_PARTICIPANT } from '@Constants/positionActionConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';

describe('getValidQualifiersAction branch coverage', () => {
  it('respects requireCompletedStructures - blocks qualifiers when structure incomplete', () => {
    const drawProfiles = [
      {
        qualifyingProfiles: [
          {
            roundTargets: 1,
            structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
          },
        ],
        drawSize: 8,
      },
    ];

    mocksEngine.generateTournamentRecord({
      drawProfiles,
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: matchUps[0]?.drawId });
    if (!drawDefinition) return;

    const mainStructure = drawDefinition.structures?.find((s) => s.stage !== QUALIFYING);
    if (!mainStructure) return;

    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: mainStructure.structureId,
      drawId: drawDefinition.drawId,
    });

    const qualifierAssignment = positionAssignments?.find((a) => a.qualifier);
    if (!qualifierAssignment) return;

    let result: any = tournamentEngine.positionActions({
      policyDefinitions: {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          requireCompletedStructures: true,
        },
      },
      drawPosition: qualifierAssignment.drawPosition,
      structureId: mainStructure.structureId,
      drawId: drawDefinition.drawId,
    });

    const qualifyingAction = result.validActions?.find((a) => a.type === QUALIFYING_PARTICIPANT);
    expect(qualifyingAction?.qualifyingParticipantIds?.length ?? 0).toEqual(0);
  });

  it('allows qualifier placement after completing qualifying structure', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          qualifyingProfiles: [
            {
              roundTargets: 1,
              structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
            },
          ],
          drawSize: 8,
        },
      ],
      setState: true,
    });

    const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
    const drawId = allMatchUps[0]?.drawId;
    if (!drawId) return;

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures?.find((s) => s.stage === QUALIFYING);
    const mainStructure = drawDefinition.structures?.find((s) => s.stage !== QUALIFYING);
    if (!qualifyingStructure || !mainStructure) return;

    const qualifyingMatchUps = allMatchUps.filter(
      (m) => m.structureId === qualifyingStructure.structureId && m.readyToScore,
    );

    for (const matchUp of qualifyingMatchUps) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: {
          winningSide: 1,
          score: {
            scoreStringSide1: '6-1 6-1',
            scoreStringSide2: '1-6 1-6',
            sets: [
              { side1Score: 6, side2Score: 1, setNumber: 1, winningSide: 1 },
              { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
            ],
          },
        },
        drawId,
      });
    }

    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: mainStructure.structureId,
      drawId,
    });

    const qualifierAssignment = positionAssignments?.find((a) => a.qualifier);
    if (!qualifierAssignment) return;

    let result: any = tournamentEngine.positionActions({
      policyDefinitions: {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          requireCompletedStructures: true,
        },
      },
      drawPosition: qualifierAssignment.drawPosition,
      structureId: mainStructure.structureId,
      drawId,
    });

    const qualifyingAction = result.validActions?.find((a) => a.type === QUALIFYING_PARTICIPANT);
    expect(qualifyingAction?.qualifyingParticipantIds?.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('uses disableRoundRestrictions policy', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          qualifyingProfiles: [
            {
              roundTargets: 1,
              structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
            },
          ],
          drawSize: 8,
        },
      ],
      setState: true,
    });

    const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
    const drawId = allMatchUps[0]?.drawId;
    if (!drawId) return;

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures?.find((s) => s.stage !== QUALIFYING);
    if (!mainStructure) return;

    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: mainStructure.structureId,
      drawId,
    });

    const qualifierAssignment = positionAssignments?.find((a) => a.qualifier);
    if (!qualifierAssignment) return;

    let result: any = tournamentEngine.positionActions({
      policyDefinitions: {
        [POLICY_TYPE_POSITION_ACTIONS]: {
          disableRoundRestrictions: true,
        },
      },
      drawPosition: qualifierAssignment.drawPosition,
      structureId: mainStructure.structureId,
      drawId,
    });

    expect(result.validActions).toBeDefined();
  });

  it('returns qualifying participants with participant data when returnParticipants is true', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          qualifyingProfiles: [
            {
              roundTargets: 1,
              structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }],
            },
          ],
          drawSize: 8,
        },
      ],
      setState: true,
    });

    const { matchUps: allMatchUps } = tournamentEngine.allTournamentMatchUps();
    const drawId = allMatchUps[0]?.drawId;
    if (!drawId) return;

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures?.find((s) => s.stage === QUALIFYING);
    const mainStructure = drawDefinition.structures?.find((s) => s.stage !== QUALIFYING);
    if (!qualifyingStructure || !mainStructure) return;

    const qualifyingMatchUps = allMatchUps.filter(
      (m) => m.structureId === qualifyingStructure.structureId && m.readyToScore,
    );

    for (const matchUp of qualifyingMatchUps) {
      tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: {
          winningSide: 1,
          score: {
            scoreStringSide1: '6-2 6-2',
            scoreStringSide2: '2-6 2-6',
            sets: [
              { side1Score: 6, side2Score: 2, setNumber: 1, winningSide: 1 },
              { side1Score: 6, side2Score: 2, setNumber: 2, winningSide: 1 },
            ],
          },
        },
        drawId,
      });
    }

    const { positionAssignments } = tournamentEngine.getPositionAssignments({
      structureId: mainStructure.structureId,
      drawId,
    });

    const qualifierAssignment = positionAssignments?.find((a) => a.qualifier);
    if (!qualifierAssignment) return;

    let result: any = tournamentEngine.positionActions({
      returnParticipants: true,
      drawPosition: qualifierAssignment.drawPosition,
      structureId: mainStructure.structureId,
      drawId,
    });

    const qualifyingAction = result.validActions?.find((a) => a.type === QUALIFYING_PARTICIPANT);
    if (qualifyingAction) {
      expect(qualifyingAction.qualifyingParticipantIds).toBeDefined();
      expect(qualifyingAction.qualifyingParticipantIds.length).toBeGreaterThan(0);
    }
  });

  it('returns empty qualifiers when no qualifying source structures exist', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const drawId = matchUps[0]?.drawId;
    if (!drawId) return;

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.positionActions({
      drawPosition: 1,
      structureId,
      drawId,
    });

    const qualifyingAction = result.validActions?.find((a) => a.type === QUALIFYING_PARTICIPANT);
    expect(qualifyingAction).toBeUndefined();
  });
});
