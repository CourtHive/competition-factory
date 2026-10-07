import { tournamentRelevantSchedulingIds } from '@Validators/validateSchedulingProfile';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

/**
 * With `requireCourts`, a venue that has no courts is not a scheduling venue and is left out of
 * `venueIds`. It used to be mapped to a falsy placeholder (`0`, `undefined` or `false`) in its
 * place, so `venueIds` — declared `string[]` — held values that are not venueIds at all.
 */
it('requireCourts leaves a courtless venue out of venueIds rather than holding a placeholder', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2 }, { courtsCount: 1 }],
    setState: true,
  });
  const [withCourts, courtless] = tournamentRecord.venues;
  courtless.courts = [];

  const { venueIds } = tournamentRelevantSchedulingIds({ tournamentRecord, requireCourts: true });
  expect(venueIds).toEqual([withCourts.venueId]);

  // without requireCourts every venue counts
  const all = tournamentRelevantSchedulingIds({ tournamentRecord }).venueIds;
  expect(all).toEqual([withCourts.venueId, courtless.venueId]);
});
