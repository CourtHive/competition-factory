/**
 * v4.0 Tests - createMatchUp
 */

import { describe, test, expect } from 'vitest';
import { createMatchUp } from '@Assemblies/governors/scoreGovernor';
import { MatchUp } from '@Types/scoring/types';

describe('createMatchUp', () => {
  test('should create a basic matchUp', () => {
    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
    });

    expect(matchUp).toBeDefined();
    expect(matchUp.matchUpFormat).toBe('SET3-S:6/TB7');
    expect(matchUp.matchUpStatus).toBe('TO_BE_PLAYED');
    expect(matchUp.matchUpType).toBe('SINGLES');
    expect(matchUp.sides).toHaveLength(2);
    expect(matchUp.score.sets).toHaveLength(0);
  });

  test('should create doubles matchUp', () => {
    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
      isDoubles: true,
    });

    expect(matchUp.matchUpType).toBe('DOUBLES');
  });

  test('should accept custom matchUpId', () => {
    const customId = 'custom-match-id';
    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
      matchUpId: customId,
    });

    expect(matchUp.matchUpId).toBe(customId);
  });

  test('should include participants if provided', () => {
    const participants = [
      {
        participantId: 'p1',
        participantName: 'Player 1',
        participantType: 'INDIVIDUAL' as const,
        participantRole: 'COMPETITOR' as const,
      },
      {
        participantId: 'p2',
        participantName: 'Player 2',
        participantType: 'INDIVIDUAL' as const,
        participantRole: 'COMPETITOR' as const,
      },
    ];

    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
      participants,
    });

    expect(matchUp.sides).toHaveLength(2);
    expect(matchUp.sides[0].participantId).toBe('p1');
    expect(matchUp.sides[0].participant?.participantName).toBe('Player 1');
    expect(matchUp.sides[1].participantId).toBe('p2');
  });

  test('should be JSON serializable', () => {
    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
    });

    // Should be able to stringify and parse
    const json = JSON.stringify(matchUp);
    const parsed: MatchUp = JSON.parse(json);

    expect(parsed.matchUpFormat).toBe('SET3-S:6/TB7');
    expect(parsed.matchUpStatus).toBe('TO_BE_PLAYED');
    expect(parsed.sides).toHaveLength(2);
  });

  test('should have createdAt timestamp', () => {
    const matchUp = createMatchUp({
      matchUpFormat: 'SET3-S:6/TB7',
    });

    expect(matchUp.createdAt).toBeDefined();
    expect(new Date(matchUp.createdAt!).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
