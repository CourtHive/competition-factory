import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DUPR } from '@Constants/ratingConstants';

/**
 * Every participant generated for a rating band is rated in it.
 *
 * Ratings are drawn across the rating's whole scale (DUPR 2–8, skewed high), kept when they fall in the band, and the
 * first N taken. A band in the scale's thin tail could keep fewer than N of the 2,000 draws, and the participants past
 * the last kept value got no rating at all: an entrant of "DUPR 3.0-4.49" with "Missing DUPR rating", about 7 calls in
 * 20,000 for that band, and nearly always for one further out. More values are now drawn until there are N; a call
 * that already had N draws exactly what it drew before.
 */
it.each([
  ['a band in the thin tail', { ratingMin: 2, ratingMax: 2.3 }],
  ['the band TMX’s pickleball example uses', { ratingMin: 3, ratingMax: 4.49 }],
])('rates every participant generated for %s', (_label, band) => {
  for (const nonRandom of [1, 2, 3, 4, 5]) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ category: { categoryName: `DUPR ${band.ratingMin}`, ratingType: DUPR, ...band }, drawSize: 16 }],
      nonRandom,
    });
    tournamentEngine.setState(tournamentRecord);
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: ['INDIVIDUAL'] },
      withScaleValues: true,
    });
    const event = defined(tournamentRecord.events, 'events')[0];
    const ineligible = (participants ?? [])
      .map((participant: any) => tournamentEngine.getParticipantEligibility({ participant, event }) as any)
      .filter((result) => !result.eligible)
      .map((result) => result.rejectionReasons?.map((r: any) => r.reason).join('; '));
    expect(ineligible, `seed ${nonRandom}`).toEqual([]);
  }
});
