import { mockLeagueTieFormat } from '@Assemblies/generators/mocks/mockLeagueTieFormat';
import tieFormatDefaults from '@Helpers/tieFormats/tieFormatDefaults';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';

/**
 * The mocks league default is a concrete tieFormat, not the catalogue name COLLEGE_DEFAULT. It must stay the value
 * that name built, key order included, or every generated league record would change.
 */
describe('mockLeagueTieFormat', () => {
  it('equals the COLLEGE_DEFAULT build for a mock record, ids and key order included', () => {
    const event = { eventId: 'league-1' };
    const fromCatalogue = tieFormatDefaults({ namedFormat: COLLEGE_DEFAULT, isMock: true, event });
    const concrete = mockLeagueTieFormat({ eventId: 'league-1', isMock: true });

    expect(JSON.stringify(concrete)).toEqual(JSON.stringify(fromCatalogue));
    expect(concrete.collectionDefinitions.map(({ collectionId }) => collectionId)).toEqual([
      'league-1-COL-1',
      'league-1-COL-2',
    ]);
  });

  it('equals the COLLEGE_DEFAULT build apart from its UUIDs outside a mock record', () => {
    const withoutIds = (tieFormat) => ({
      ...tieFormat,
      collectionDefinitions: tieFormat.collectionDefinitions.map(({ collectionId, ...rest }) => {
        expect(typeof collectionId).toEqual('string');
        return rest;
      }),
    });
    const fromCatalogue = tieFormatDefaults({ namedFormat: COLLEGE_DEFAULT, event: { eventId: 'e' } });
    const concrete = mockLeagueTieFormat({ eventId: 'e' });

    expect(JSON.stringify(withoutIds(concrete))).toEqual(JSON.stringify(withoutIds(fromCatalogue)));
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

    const event = tournamentRecord.events.find(({ eventId }) => eventId === 'L1');
    expect(event.tieFormat).toEqual(mockLeagueTieFormat({ eventId: 'L1', isMock: true }));
  });
});
