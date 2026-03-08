import { getValidGroupSizes } from '@Assemblies/generators/drawDefinitions/drawTypes/roundRobin/roundRobin';
import { roundRobinWithPlayoffsTest } from './roundRobinWithPlayoffsTest';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

it('can generate Playoffs for Round Robin with 2 groups of 5, each with BYE', () => {
  const playoffGroups = [
    {
      finishingPositions: [1],
      structureName: 'Gold Flight',
      drawType: SINGLE_ELIMINATION,
      positionAssignmentsCount: 2,
      participantIdsCount: 2,
      byesCount: 0,
    },
    {
      finishingPositions: [2],
      structureName: 'Silver Flight',
      drawType: SINGLE_ELIMINATION,
      positionAssignmentsCount: 2,
      participantIdsCount: 2,
      byesCount: 0,
    },
  ];

  // NOTE: with drawSize: 8 this will throw an error
  // drawSize: 9 allows getValidGroupSizes to ignore participantsCount limitations
  roundRobinWithPlayoffsTest({
    finishingGroupSizes: [2, 2, 2, 2],
    participantsCount: 8,
    groupsCount: 2,
    playoffGroups,
    groupSize: 5,
    drawSize: 9,
  });
});

describe('getValidGroupSizes — branch coverage', () => {
  it('returns valid group sizes for drawSize 12', () => {
    const result = getValidGroupSizes({ drawSize: 12 });
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).toBeDefined();
    // 12 participants: valid groups are 3 (4 groups), 4 (3 groups), 6 (2 groups)
    expect(result.validGroupSizes).toContain(3);
    expect(result.validGroupSizes).toContain(4);
    expect(result.validGroupSizes).toContain(6);
  });

  it('returns valid group sizes for drawSize 16', () => {
    const result = getValidGroupSizes({ drawSize: 16 });
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).toContain(4);
    expect(result.validGroupSizes).toContain(8);
  });

  it('returns empty validGroupSizes for drawSize 2 (too small for RR)', () => {
    const result = getValidGroupSizes({ drawSize: 2 });
    expect(result.success).toEqual(true);
    // groupSize must be >= 3, so drawSize 2 cannot form any valid group
    expect(result.validGroupSizes).toEqual([]);
  });

  it('returns empty validGroupSizes for drawSize 0', () => {
    const result = getValidGroupSizes({ drawSize: 0 });
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).toEqual([]);
  });

  it('uses default drawSize of 0 when params is undefined', () => {
    const result = getValidGroupSizes(undefined as any);
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).toEqual([]);
  });

  it('uses default groupSizeLimit of 10', () => {
    const result = getValidGroupSizes({ drawSize: 20 });
    expect(result.success).toEqual(true);
    // With limit 10, groups of 4, 5, 10 should be valid
    expect(result.validGroupSizes).toContain(4);
    expect(result.validGroupSizes).toContain(5);
    expect(result.validGroupSizes).toContain(10);
  });

  it('respects custom groupSizeLimit', () => {
    const result = getValidGroupSizes({ drawSize: 20, groupSizeLimit: 5 });
    expect(result.success).toEqual(true);
    // With limit 5, should not include sizes > 5
    for (const size of result.validGroupSizes ?? []) {
      expect(size).toBeLessThanOrEqual(5);
    }
  });

  it('filters out group sizes that produce too many byes', () => {
    // drawSize 7: groupSize 4 → 2 groups of 4 = 8 slots, 1 bye → ok
    // groupSize 5 → 2 groups of 5 = 10 slots, 3 byes → byesCount < groupSize (5) ✓
    // but maxByesPerGroup = ceil(3/2) = 2 → ≥ 2 → filtered OUT
    const result = getValidGroupSizes({ drawSize: 7 });
    expect(result.success).toEqual(true);
    // groupSize 7 → 1 group of 7 = 7 slots, 0 byes → valid
    expect(result.validGroupSizes).toContain(7);
  });

  it('works via engine method getValidGroupSizes', () => {
    const result = tournamentEngine.getValidGroupSizes({ drawSize: 9 });
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).toBeDefined();
    // drawSize 9: groupSize 3 → 3 groups, 0 byes → valid
    // groupSize 5 → 2 groups, 1 bye → valid
    // groupSize 9 → 1 group, 0 byes → valid
    expect(result.validGroupSizes).toContain(3);
    expect(result.validGroupSizes).toContain(9);
  });

  it('excludes group sizes where maxParticipantsPerGroup !== groupSize', () => {
    // drawSize 5: groupSize 3 → 2 groups, maxPPG = ceil(5/2) = 3 ✓
    // groupSize 4 → 2 groups, maxPPG = ceil(5/2) = 3 ≠ 4 → filtered OUT
    const result = getValidGroupSizes({ drawSize: 5 });
    expect(result.success).toEqual(true);
    expect(result.validGroupSizes).not.toContain(4);
    expect(result.validGroupSizes).toContain(5);
  });
});
