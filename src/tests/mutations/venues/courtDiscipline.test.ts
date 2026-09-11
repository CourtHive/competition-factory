import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { PICKLEBALL, TENNIS } from '@Constants/disciplineConstants';
import { NO_VALID_ATTRIBUTES } from '@Constants/errorConditionConstants';

/**
 * `Court.discipline` — which sport a court IS.
 *
 * Added so a dedicated pickleball court is distinguishable from a tennis court by DATA rather
 * than by a naming convention. The facility registry's court load would otherwise have to encode
 * it in the court name ("Pickleball 1"), which is unqueryable and lost on a rename.
 *
 * The `modifyCourt` case is the one that matters. `modifyCourt` derives its whitelist from
 * `Object.keys(courtTemplate())`, and an attribute missing from that template is **silently
 * dropped** rather than rejected — so a type-and-schema-only change would type-check, pass a
 * round-trip test through `addCourt`, and still lose the value on every modification. Deleting
 * `discipline: undefined` from courtTemplate must redden "modifyCourt persists discipline".
 */

function setupVenueWithCourt(court: any = { courtName: 'Court 1' }) {
  tournamentEngine.reset();
  let result: any = tournamentEngine.newTournamentRecord({
    startDate: '2024-01-01',
    endDate: '2024-01-07',
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addVenue({ venue: { venueName: 'Test Venue' } });
  expect(result.success).toEqual(true);
  const venueId = result.venue.venueId;

  result = tournamentEngine.addCourt({ venueId, court });
  expect(result.success).toEqual(true);

  return { venueId, courtId: result.court.courtId };
}

function findCourt(venueId: string, courtId: string) {
  const { venue } = tournamentEngine.findVenue({ venueId });
  return venue.courts.find((c: any) => c.courtId === courtId);
}

it('addCourt persists discipline', () => {
  const { venueId, courtId } = setupVenueWithCourt({ courtName: 'Pickleball 1', discipline: PICKLEBALL });

  expect(findCourt(venueId, courtId).discipline).toEqual(PICKLEBALL);
});

it('modifyCourt persists discipline', () => {
  const { venueId, courtId } = setupVenueWithCourt();

  // Absent, not defaulted: a court nobody has declared a discipline for is not evidence that it
  // is a tennis court.
  expect(findCourt(venueId, courtId).discipline).toBeUndefined();

  const result: any = tournamentEngine.modifyCourt({ courtId, modifications: { discipline: TENNIS } });
  expect(result.success).toEqual(true);
  expect(findCourt(venueId, courtId).discipline).toEqual(TENNIS);

  // And it can be corrected, not merely set once.
  tournamentEngine.modifyCourt({ courtId, modifications: { discipline: PICKLEBALL } });
  expect(findCourt(venueId, courtId).discipline).toEqual(PICKLEBALL);
});

it('accepts a discipline outside the known vocabulary', () => {
  // The vocabulary is deliberately OPEN (DISCIPLINE_EXTENSIBILITY.md) — a new sport must not need
  // a factory release. This guards the openness, which an enum-shaped schema change would break.
  const { venueId, courtId } = setupVenueWithCourt({ courtName: 'Court 1', discipline: 'SQUASH' });

  expect(findCourt(venueId, courtId).discipline).toEqual('SQUASH');
});

it('does not treat discipline as the only modifiable attribute', () => {
  // Guards against a whitelist edit that adds `discipline` by REPLACING the template rather than
  // extending it — the other attributes must still be modifiable.
  const { venueId, courtId } = setupVenueWithCourt();

  const result: any = tournamentEngine.modifyCourt({
    courtId,
    modifications: { discipline: PICKLEBALL, courtName: 'Pickleball 1' },
  });
  expect(result.success).toEqual(true);

  const court = findCourt(venueId, courtId);
  expect(court.discipline).toEqual(PICKLEBALL);
  expect(court.courtName).toEqual('Pickleball 1');
});

it('rejects a modification containing no valid attributes', () => {
  // Falsifies the "everything is now valid" reading of the whitelist change: an unknown
  // attribute must still be refused, so `discipline` was added to the whitelist rather than the
  // whitelist being bypassed.
  const { courtId } = setupVenueWithCourt();

  const result: any = tournamentEngine.modifyCourt({ courtId, modifications: { notACourtAttribute: true } });
  expect(result.error).toEqual(NO_VALID_ATTRIBUTES);
});
