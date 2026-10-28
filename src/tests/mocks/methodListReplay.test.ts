import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { differences } from './recordDifferences';

/**
 * A generated scenario's method list replays to the same record (CA 2026-10-29). `generateTournamentRecord` with
 * `recordMethods` returns the engine calls a client would make to build what it built; replayed through a fresh
 * engine they must produce the same record, apart from the times each write stamps. A write scenario generation
 * makes WITHOUT logging it shows up here as the first difference.
 */

function replay(methods) {
  const [header, ...rest] = methods;
  expect(header.method).toEqual('newTournamentRecord');
  tournamentEngine.reset();
  let result: any = tournamentEngine.newTournamentRecord(header.params);
  expect(result.success).toEqual(true);
  result = rest.length ? tournamentEngine.executionQueue(rest) : { success: true };
  expect(result.error ?? result.success).toEqual(true);
  return tournamentEngine.getTournament().tournamentRecord;
}

const scenarios: [string, Record<string, unknown>][] = [
  ['participants only', { participantsProfile: { participantsCount: 8 } }],
  ['an elimination draw', { drawProfiles: [{ drawSize: 8 }] }],
  [
    'seeded, with byes, completed',
    { drawProfiles: [{ drawSize: 16, participantsCount: 13, seedsCount: 4 }], completeAllMatchUps: true },
  ],
  [
    'defined outcomes',
    {
      drawProfiles: [
        { drawSize: 8, outcomes: [{ roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 2 }] },
      ],
    },
  ],
  ['a completion goal', { drawProfiles: [{ drawSize: 16, completionGoal: 9 }] }],
  [
    'a round robin with playoff, completed',
    { drawProfiles: [{ drawSize: 16, drawType: 'ROUND_ROBIN_WITH_PLAYOFF' }], completeAllMatchUps: true },
  ],
  [
    'a feed-in championship, completed',
    { drawProfiles: [{ drawSize: 16, drawType: 'FEED_IN_CHAMPIONSHIP' }], completeAllMatchUps: true },
  ],
  ['doubles, completed', { drawProfiles: [{ drawSize: 8, eventType: 'DOUBLES' }], completeAllMatchUps: true }],
  ['a team event, completed', { drawProfiles: [{ drawSize: 4, eventType: 'TEAM' }], completeAllMatchUps: true }],
  ['flights', { eventProfiles: [{ drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }] }], completeAllMatchUps: true }],
  [
    'mixed doubles',
    { drawProfiles: [{ drawSize: 8, eventType: 'DOUBLES', gender: 'MIXED' }], completeAllMatchUps: true },
  ],
  ['hybrid', { drawProfiles: [{ drawSize: 8, eventType: 'HYBRID' }] }],
  [
    'teams from participant attributes',
    { participantsProfile: { participantsCount: 16, teamKey: { personAttribute: 'nationalityCode' } } },
  ],
  [
    'alternates',
    { drawProfiles: [{ drawSize: 8, participantsCount: 8, alternatesCount: 3, tournamentAlternates: 2 }] },
  ],
  [
    'event and draw extensions, event timeItems',
    {
      drawProfiles: [
        {
          drawSize: 4,
          eventExtensions: [{ name: 'e', value: 1 }],
          drawExtensions: [{ name: 'd', value: 2 }],
          timeItems: [{ itemType: 'SCHEDULE.DATE', itemValue: '2026-06-01' }],
        },
      ],
    },
  ],
  [
    'a team tieFormat by name',
    { drawProfiles: [{ drawSize: 4, eventType: 'TEAM', tieFormatName: 'COLLEGE_D3' }], completeAllMatchUps: true },
  ],
  [
    'double elimination, completed',
    { drawProfiles: [{ drawSize: 8, drawType: 'DOUBLE_ELIMINATION' }], completeAllMatchUps: true },
  ],
  ['a lucky draw, completed', { drawProfiles: [{ drawSize: 12, drawType: 'LUCKY_DRAW' }], completeAllMatchUps: true }],
  ['compass, completed', { drawProfiles: [{ drawSize: 16, drawType: 'COMPASS' }], completeAllMatchUps: true }],
  ['a league', { leagueProfiles: [{ teamsCount: 4, gender: 'MALE' }] }],
  [
    'policies',
    { drawProfiles: [{ drawSize: 8 }], policyDefinitions: { scoring: { requireParticipantsForScoring: false } } },
  ],
  [
    'tournament extensions',
    { drawProfiles: [{ drawSize: 4 }], tournamentExtensions: [{ name: 'note', value: { a: 1 } }] },
  ],
  ['published', { drawProfiles: [{ drawSize: 8, publish: true }] }],
  ['venues', { drawProfiles: [{ drawSize: 8 }], venueProfiles: [{ courtsCount: 4 }] }],
  [
    'auto-scheduled, anchored, called and checked in',
    {
      venueProfiles: [{ venueId: 'v1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [{ drawId: 'd1', drawSize: 16 }],
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      schedulingProfile: [
        {
          scheduleDate: '2026-06-01',
          venues: [
            {
              venueId: 'v1',
              rounds: [
                { drawId: 'd1', roundNumber: 1 },
                { drawId: 'd1', roundNumber: 2 },
              ],
            },
          ],
        },
      ],
      scenarioProfile: {
        anchor: '2026-06-01T09:00',
        assignCourts: true,
        called: { withinMinutes: 30 },
        checkedIn: { withinMinutes: 60 },
      },
      autoSchedule: true,
      completeAllMatchUps: true,
    },
  ],
  [
    'iterative AD_HOC',
    { drawProfiles: [{ drawSize: 8, drawType: 'AD_HOC', automated: true, roundsCount: 3 }], completeAllMatchUps: true },
  ],
  [
    'qualifying',
    {
      drawProfiles: [
        { drawSize: 16, qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }] },
      ],
    },
  ],
  [
    'a category with ratings',
    { drawProfiles: [{ drawSize: 8, category: { ratingType: 'WTN' } }], completeAllMatchUps: true },
  ],
];

describe('a generated scenario replays from its method list', () => {
  test.each(scenarios)('%s', (_, profile) => {
    const generated: any = mocksEngine.generateTournamentRecord({ ...profile, nonRandom: 1, recordMethods: true });
    expect(generated.success).toEqual(true);
    expect(generated.methods.length).toBeGreaterThan(0);

    const replayed = replay(generated.methods);
    expect(differences(generated.tournamentRecord, replayed)).toEqual([]);
  });

  test('a generation that does not ask returns no list', () => {
    const generated: any = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    expect(generated.methods).toBeUndefined();
  });
});
