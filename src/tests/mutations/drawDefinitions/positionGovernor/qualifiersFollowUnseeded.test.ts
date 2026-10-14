import * as candidates from '@Query/drawDefinition/avoidance/generatePositioningCandidate';
import * as qualifiers from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';

// constants and types
import { NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS } from '@Constants/errorConditionConstants';
import { MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import type { PositionAssignment } from '@Types/tournamentTypes';

const drawTypes = ['LUCKY_DRAW', 'SINGLE_ELIMINATION'];

afterEach(() => {
  vi.restoreAllMocks();
  setRandomSource();
  setSubscriptions({ subscriptions: {} });
});

describe('anonymous qualifier placeholders follow unseeded entrants', () => {
  it.each(drawTypes)('%s gives avoidance the full open pool', (drawType) => {
    const inputs: PositionAssignment[][] = [];
    const generateCandidate = candidates.generatePositioningCandidate;
    vi.spyOn(candidates, 'generatePositioningCandidate').mockImplementation((params) => {
      inputs.push(structuredClone(params.initialPositionAssignments));
      return generateCandidate(params);
    });
    let result: any = mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 481,
      participantsProfile: { nationalityCodes: ['USA', 'CAN'] },
      policyDefinitions: {
        [POLICY_TYPE_AVOIDANCE]: {
          roundsToSeparate: 1,
          policyAttributes: [{ key: 'person.nationalityCode' }],
        },
      },
      drawProfiles: [{ drawType, drawSize: 16, participantsCount: 12, qualifiersCount: 4, seedsCount: 0 }],
    });
    expect(result.success).toBe(true);
    expect(inputs.length).toBeGreaterThan(0);
    for (const assignments of inputs) {
      expect(assignments).toHaveLength(16);
      expect(
        assignments.every((assignment) => !assignment.qualifier && !assignment.participantId && !assignment.bye),
      ).toBe(true);
    }
    const main = result.tournamentRecord.events[0].drawDefinitions[0].structures.find((s) => s.stage === 'MAIN');
    expect(main.positionAssignments.filter((a) => a.qualifier)).toHaveLength(4);
    expect(main.positionAssignments.filter((a) => a.participantId)).toHaveLength(12);
    expect(main.positionAssignments.every((a) => !(a.participantId && a.qualifier))).toBe(true);
  });

  it.each(drawTypes)('%s places every direct entrant before selecting new placeholders', (drawType) => {
    const placeQualifiers = qualifiers.positionQualifiers;
    const entrantCounts: number[] = [];
    vi.spyOn(qualifiers, 'positionQualifiers').mockImplementation((params) => {
      if (params.structure.stage === 'MAIN') {
        entrantCounts.push(params.structure.positionAssignments.filter((a) => a.participantId).length);
      }
      return placeQualifiers(params);
    });
    let result: any = mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 481,
      drawProfiles: [{ drawType, drawSize: 16, participantsCount: 12, qualifiersCount: 4, seedsCount: 0 }],
    });
    expect(result.success).toBe(true);
    expect(entrantCounts).toEqual([12]);
  });

  it.each(drawTypes)('%s shell positioning shuffles identically with an omitted or explicit draw size', (drawType) => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 1,
      drawProfiles: [
        {
          drawType,
          drawSize: 16,
          participantsCount: 12,
          automated: false,
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
        },
      ],
    });
    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures.find(
      (s) => s.stage === 'MAIN',
    ).structureId;
    const position = (drawSize?: number) => {
      tournamentEngine.setState(structuredClone(tournamentRecord));
      const result = tournamentEngine.automatedPositioning({
        drawId,
        structureId,
        nonRandom: 1,
        ...(drawSize && { drawSize }),
      });
      expect(result.success).toBe(true);
      return result.positionAssignments;
    };
    const explicit = position(16);
    const implicit = position();
    expect(implicit).toEqual(explicit);
    // This fixed seed is a control for the old omitted-size path, which left 13–16 every time.
    expect(implicit.filter((a) => a.qualifier).map((a) => a.drawPosition)).not.toEqual([13, 14, 15, 16]);
  });

  it('a two-position draw with one anonymous qualifier honours the random keys', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 1,
      drawProfiles: [
        {
          drawType: 'SINGLE_ELIMINATION',
          drawSize: 2,
          participantsCount: 1,
          seedsCount: 0,
          automated: false,
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 2, qualifyingPositions: 1 }] }],
        },
      ],
    });
    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures.find(
      (s) => s.stage === 'MAIN',
    ).structureId;
    const positions = [
      [0.9, 0.1, 0.2],
      [0.1, 0.9, 0.2],
    ].map((keys) => {
      tournamentEngine.setState(structuredClone(tournamentRecord));
      setRandomSource(() => keys.shift() ?? 0.5);
      const result = tournamentEngine.automatedPositioning({ drawId, structureId, drawSize: 2 });
      expect(result.success).toBe(true);
      return result.positionAssignments.find((a) => a.qualifier).drawPosition;
    });
    expect(positions).toEqual([2, 1]);
  });

  it('refuses insufficient space without placing direct entrants or new qualifiers', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      setState: true,
      nonRandom: 1,
      drawProfiles: [
        {
          drawSize: 8,
          participantsCount: 2,
          automated: false,
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 3 }] }],
        },
      ],
    });
    const main = tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s) => s.stage === 'MAIN');
    for (const drawPosition of [1, 2, 3, 4, 5, 6]) {
      expect(
        tournamentEngine.assignDrawPositionBye({ drawId, structureId: main.structureId, drawPosition }).success,
      ).toBe(true);
    }
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const notice = vi.fn();
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: notice } });
    const result = tournamentEngine.automatedPositioning({ drawId, structureId: main.structureId });
    expect(result.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);
    expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toBe(before);
    expect(notice).not.toHaveBeenCalled();
  });
});
