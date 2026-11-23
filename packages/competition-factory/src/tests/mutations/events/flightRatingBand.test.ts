import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { ENTRIES_SCOPE_UNFLIGHTED } from '@Constants/flightConstants';
import { NTRP } from '@Constants/ratingConstants';
import { RATING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

// `scaleRange` narrows a split to entries rated within the band: "everyone rated 4 or better is Flight 1", then the rest
// are flighted with `appendFlights` over the remaining participants.

const scaleAttributes = { scaleType: RATING, eventType: SINGLES, scaleName: NTRP };

// 16 entries: 12 rated NTRP 1..12 (by participant order), 4 unrated
function ratedEvent() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 16 } }],
    setState: true,
  });
  const entryIds: string[] = tournamentEngine.getEvent({ eventId }).event.entries.map(getParticipantId);
  const ratingOf: Record<string, number> = {};
  entryIds.slice(0, 12).forEach((participantId, index) => {
    const scaleValue = index + 1;
    ratingOf[participantId] = scaleValue;
    const scaleItem = { scaleValue, scaleName: NTRP, scaleType: RATING, eventType: SINGLES, scaleDate: '2026-10-01' };
    const result: any = tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
    expect(result.success).toEqual(true);
  });
  return { eventId, entryIds, ratingOf, unratedIds: entryIds.slice(12) };
}

const ratingsIn = (flight: any, ratingOf: Record<string, number>) =>
  flight.drawEntries.map(getParticipantId).map((id: string) => ratingOf[id] ?? null);

it('splits only the entries rated within the band', () => {
  const { eventId, ratingOf } = ratedEvent();

  let result: any = tournamentEngine.generateFlightProfile({
    scaleRange: { min: 3, max: 6 },
    scaleAttributes,
    flightsCount: 1,
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(ratingsIn(result.flightProfile.flights[0], ratingOf)).toEqual([3, 4, 5, 6]);

  // a band open at one end; unrated entries never fall inside a band
  result = tournamentEngine.generateFlightProfile({
    scaleRange: { min: 10 },
    scaleAttributes,
    flightsCount: 1,
    eventId,
  });
  expect(ratingsIn(result.flightProfile.flights[0], ratingOf)).toEqual([10, 11, 12]);
});

it('a top flight by rating, then the rest flighted from the remaining participants', () => {
  const { eventId, ratingOf, unratedIds } = ratedEvent();

  let result: any = tournamentEngine.generateFlightProfile({
    scaleRange: { max: 4 },
    attachFlightProfile: true,
    scaleAttributes,
    flightsCount: 1,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateFlightProfile({
    entriesScope: ENTRIES_SCOPE_UNFLIGHTED,
    attachFlightProfile: true,
    appendFlights: true,
    scaleAttributes,
    flightsCount: 2,
    eventId,
  });
  expect(result.success).toEqual(true);

  const [top, ...rest] = tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights;
  expect(ratingsIn(top, ratingOf)).toEqual([1, 2, 3, 4]);
  expect(rest.map(({ flightNumber }) => flightNumber)).toEqual([2, 3]);

  const restIds = rest.flatMap((flight) => flight.drawEntries.map(getParticipantId));
  expect(restIds).toHaveLength(12);
  expect(
    restIds
      .filter((id) => ratingOf[id] !== undefined)
      .map((id) => ratingOf[id])
      .sort((a, b) => a - b),
  ).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  expect(unratedIds.every((id) => restIds.includes(id))).toEqual(true);
});
