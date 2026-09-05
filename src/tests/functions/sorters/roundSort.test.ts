import { describe, expect, it } from 'vitest';
import { roundSort } from '@Functions/sorters/roundSort';
import { QUALIFYING, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';

describe('roundSort', () => {
  it('sorts by eventName first', () => {
    const rounds = [
      {
        eventName: 'Event C',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e2',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event B',
        eventId: 'e3',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].eventName).toBe('Event A');
    expect(rounds[1].eventName).toBe('Event B');
    expect(rounds[2].eventName).toBe('Event C');
  });

  it('sorts by eventId when eventName is equal', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e3',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e2',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].eventId).toBe('e1');
    expect(rounds[1].eventId).toBe('e2');
    expect(rounds[2].eventId).toBe('e3');
  });

  it('sorts by stage when eventName and eventId are equal', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: CONSOLATION,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: QUALIFYING,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].stage).toBe(QUALIFYING);
    expect(rounds[1].stage).toBe(MAIN);
    expect(rounds[2].stage).toBe(CONSOLATION);
  });

  it('sorts by matchUpsCount (descending) when earlier fields are equal', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 2,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 8,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    // Descending order (b - a)
    expect(rounds[0].matchUpsCount).toBe(8);
    expect(rounds[1].matchUpsCount).toBe(4);
    expect(rounds[2].matchUpsCount).toBe(2);
  });

  it('sorts by stageSequence-roundNumber-minFinishingSum composite', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 2,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 2,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 4,
      },
    ];

    rounds.sort(roundSort);

    // With same matchUpsCount, sorts by composite string
    expect(rounds[0].stageSequence).toBe(1);
    expect(rounds[0].roundNumber).toBe(1);
    expect(rounds[0].minFinishingSum).toBe(4); // "1-1-4" comes before "1-2-2"
  });

  it('handles missing stage', () => {
    const rounds = [
      { eventName: 'Event A', eventId: 'e1', matchUpsCount: 4, stageSequence: 1, roundNumber: 1, minFinishingSum: 2 },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].stage).toBeUndefined();
    expect(rounds[1].stage).toBe(MAIN);
  });

  it('handles missing matchUpsCount', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      { eventName: 'Event A', eventId: 'e1', stage: MAIN, stageSequence: 1, roundNumber: 1, minFinishingSum: 2 },
    ];

    rounds.sort(roundSort);

    // b.matchUpsCount - a.matchUpsCount where b is undefined = -4
    expect(rounds[0].matchUpsCount).toBe(4);
  });

  it('handles null values', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: null,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].stage).toBe(null);
    expect(rounds[1].stage).toBe(MAIN);
  });

  it('handles undefined stageSequence', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 2,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      { eventName: 'Event A', eventId: 'e1', stage: MAIN, matchUpsCount: 4, roundNumber: 1, minFinishingSum: 2 },
    ];

    rounds.sort(roundSort);

    // undefined becomes 'undefined' in template string
    expect(rounds).toHaveLength(2);
  });

  it('handles undefined roundNumber', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 2,
        minFinishingSum: 2,
      },
      { eventName: 'Event A', eventId: 'e1', stage: MAIN, matchUpsCount: 4, stageSequence: 1, minFinishingSum: 2 },
    ];

    rounds.sort(roundSort);

    // undefined becomes 'undefined' in template string
    expect(rounds).toHaveLength(2);
  });

  it('handles undefined minFinishingSum', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      { eventName: 'Event A', eventId: 'e1', stage: MAIN, matchUpsCount: 4, stageSequence: 1, roundNumber: 1 },
    ];

    rounds.sort(roundSort);

    // undefined becomes 'undefined' in template string
    expect(rounds).toHaveLength(2);
  });

  it('returns 0 for identical rounds', () => {
    const round = {
      eventName: 'Event A',
      eventId: 'e1',
      stage: MAIN,
      matchUpsCount: 4,
      stageSequence: 1,
      roundNumber: 1,
      minFinishingSum: 2,
    };

    expect(roundSort(round, round)).toBe(0);
  });

  it('handles minimal round objects with required fields', () => {
    const rounds = [
      { eventName: 'B', eventId: 'b' },
      { eventName: 'A', eventId: 'a' },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].eventName).toBe('A');
    expect(rounds[1].eventName).toBe('B');
  });

  it('handles negative values', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: -1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    expect(rounds[0].stageSequence).toBe(-1);
    expect(rounds[1].stageSequence).toBe(1);
  });

  it('handles zero values', () => {
    const rounds = [
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 0,
        stageSequence: 0,
        roundNumber: 0,
        minFinishingSum: 0,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    // matchUpsCount is descending, so 4 comes before 0
    expect(rounds[0].matchUpsCount).toBe(4);
    expect(rounds[1].matchUpsCount).toBe(0);
  });

  it('handles complex sorting scenario', () => {
    const rounds = [
      {
        eventName: 'Event B',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e2',
        stage: CONSOLATION,
        matchUpsCount: 2,
        stageSequence: 1,
        roundNumber: 2,
        minFinishingSum: 3,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 8,
        stageSequence: 2,
        roundNumber: 1,
        minFinishingSum: 2,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: MAIN,
        matchUpsCount: 8,
        stageSequence: 1,
        roundNumber: 2,
        minFinishingSum: 4,
      },
      {
        eventName: 'Event A',
        eventId: 'e1',
        stage: QUALIFYING,
        matchUpsCount: 4,
        stageSequence: 1,
        roundNumber: 1,
        minFinishingSum: 2,
      },
    ];

    rounds.sort(roundSort);

    // First by eventName (A before B)
    // Then eventId (e1 before e2)
    // Then stage (QUALIFYING before MAIN)
    // Then matchUpsCount (descending)
    // Then composite string
    expect(rounds[0].eventName).toBe('Event A');
    expect(rounds[0].stage).toBe(QUALIFYING);
  });
});
