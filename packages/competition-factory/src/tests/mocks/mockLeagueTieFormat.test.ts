import { mockLeagueTieFormat } from '@Assemblies/generators/mocks/mockLeagueTieFormat';
import { defined } from '@Tests/helpers/defined';
import { resolveTieFormat } from '@courthive/competition-catalogue';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// the value the COLLEGE_DEFAULT name built for a mock record before 8.0.0, key order included
const COLLEGE_DEFAULT_BUILD =
  '{"winCriteria":{"valueGoal":4},"collectionDefinitions":[{"collectionId":"league-1-COL-1","matchUpFormat":"SET1-S:6/TB7","collectionName":"Doubles","matchUpType":"DOUBLES","collectionValue":1,"matchUpCount":3},{"collectionId":"league-1-COL-2","matchUpFormat":"SET3-S:6/TB7","collectionName":"Singles","matchUpType":"SINGLES","matchUpCount":6,"matchUpValue":1}],"tieFormatName":"College Default"}';

/**
 * The mocks league default is a concrete tieFormat. It must stay the value the COLLEGE_DEFAULT name built, key order
 * included, or every generated league record would change; its content is the catalogue's COLLEGE_DEFAULT.
 */
describe('mockLeagueTieFormat', () => {
  it('equals the COLLEGE_DEFAULT build for a mock record, ids and key order included', () => {
    const concrete = mockLeagueTieFormat({ eventId: 'league-1', isMock: true });

    expect(JSON.stringify(concrete)).toEqual(COLLEGE_DEFAULT_BUILD);
    expect(concrete.collectionDefinitions.map(({ collectionId }) => collectionId)).toEqual([
      'league-1-COL-1',
      'league-1-COL-2',
    ]);
  });

  it("holds the catalogue's COLLEGE_DEFAULT, with UUIDs outside a mock record", () => {
    const concrete = mockLeagueTieFormat({ eventId: 'e' });
    const withoutIds = concrete.collectionDefinitions.map(({ collectionId, ...rest }) => {
      expect(typeof collectionId).toEqual('string');
      return rest;
    });

    expect({ ...concrete, collectionDefinitions: withoutIds }).toEqual(resolveTieFormat('COLLEGE_DEFAULT'));
  });

  it('hands out a fresh copy each call', () => {
    const first = mockLeagueTieFormat({ eventId: 'x', isMock: true });
    first.collectionDefinitions[0].matchUpCount = 99;

    expect(mockLeagueTieFormat({ eventId: 'x', isMock: true }).collectionDefinitions[0].matchUpCount).toEqual(3);
  });

  it('is what a league profile naming no format generates', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      leagueProfiles: [{ teamsCount: 4, leagueId: 'L1' }],
      isMock: true,
    } as any);

    const event = defined(tournamentRecord.events, 'events').find(({ eventId }) => eventId === 'L1');
    expect(defined(event, 'event').tieFormat).toEqual(mockLeagueTieFormat({ eventId: 'L1', isMock: true }));
  });
});
