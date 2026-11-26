import { modifyVenue } from '@Mutate/venues/modifyVenue';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, expectTypeOf, it } from 'vitest';

// types
import type { ResultType } from '@Types/factoryTypes';

// A caller reads `success` from the result, as it did when the result was untyped.
it('declares a ResultType result, so a caller can read success', () => {
  expectTypeOf(modifyVenue).returns.toEqualTypeOf<ResultType>();
  expectTypeOf<ReturnType<typeof tournamentEngine.modifyVenue>>().toHaveProperty('success');

  const {
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ venueProfiles: [{ courtsCount: 2 }] });
  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.modifyVenue({ venueId, modifications: { venueName: 'Renamed' } });
  expect(result.success).toBe(true);
  expect(tournamentEngine.findVenue({ venueId }).venue?.venueName).toBe('Renamed');
});
