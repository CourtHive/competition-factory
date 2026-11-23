import { scheduledSortedMatchUps } from '@Functions/sorters/scheduledSortedMatchUps';
import { MatchUp } from '@Types/tournamentTypes';
import { it, expect, describe } from 'vitest';

describe('scheduledSortedMatchUps function', () => {
  it('can accurately sort matchUps by scheduled date, time, and round order', () => {
    const schedulingProfile = [
      {
        venues: [
          {
            rounds: [
              { eventId: '1', drawId: '1', structureId: '1', roundNumber: 1, sortOrder: 2 },
              { eventId: '1', drawId: '1', structureId: '1', roundNumber: 2, sortOrder: 1 },
            ],
          },
          {
            rounds: [
              { eventId: '1', drawId: '1', structureId: '2', roundNumber: 1, sortOrder: 1 },
              { eventId: '1', drawId: '1', structureId: '2', roundNumber: 2, sortOrder: 2 },
            ],
          },
        ],
      },
    ];

    const shuffledMatchUps = [
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 2,
      },
    ] as unknown as MatchUp[];

    const sortedMatchUps = scheduledSortedMatchUps({ schedulingProfile, matchUps: shuffledMatchUps });

    expect(sortedMatchUps).toEqual([
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 2,
      },
    ]);
  });

  it('returns matchUps sorted only by date and time when no scheduling profile is provided', () => {
    const schedulingProfile = [];

    const shuffledMatchUps = [
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-02',
          scheduledTime: '09:00',
        },
        roundNumber: 1,
      },
    ] as unknown as MatchUp[];

    const sortedMatchUps = scheduledSortedMatchUps({ schedulingProfile, matchUps: shuffledMatchUps });

    expect(sortedMatchUps).toEqual([
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '11:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {
          scheduledDate: '2022-01-02',
          scheduledTime: '09:00',
        },
        roundNumber: 1,
      },
    ]);
  });

  it('handles matchUps with no scheduled date or time', () => {
    const schedulingProfile = [];

    const shuffledMatchUps = [
      {
        schedule: {},
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
    ] as unknown as MatchUp[];

    const sortedMatchUps = scheduledSortedMatchUps({ schedulingProfile, matchUps: shuffledMatchUps });

    expect(sortedMatchUps).toEqual([
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {},
        roundNumber: 1,
      },
    ]);
  });

  it('sorts matchUps correctly when multiple matchUps have the same date and time', () => {
    const schedulingProfile = [
      {
        venues: [
          {
            rounds: [
              { eventId: '1', drawId: '1', structureId: '1', roundNumber: 1, sortOrder: 1 },
              { eventId: '1', drawId: '1', structureId: '1', roundNumber: 2, sortOrder: 2 },
            ],
          },
        ],
      },
    ];

    const shuffledMatchUps = [
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
    ] as unknown as MatchUp[];

    const sortedMatchUps = scheduledSortedMatchUps({ schedulingProfile, matchUps: shuffledMatchUps });

    expect(sortedMatchUps).toEqual([
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 1,
      },
      {
        schedule: {
          scheduledDate: '2022-01-01',
          scheduledTime: '10:00',
        },
        roundNumber: 2,
      },
    ]);
  });
});
