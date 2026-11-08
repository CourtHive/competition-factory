import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { RANKING, RATING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';
import { ELO, WTN } from '@Constants/ratingConstants';

/**
 * getEvents({ withScaleValues }) for an event with a flight whose draw is not generated yet (CA 2026-11-08, a
 * production record): TMX's events table threw "Cannot read properties of undefined (reading 'ratings')". Draw
 * buckets were made for generated draws only, so a flight without one added its entries' ratings to nothing. The
 * refactor that split the aggregation (first stable release v3.0.0) dropped the guard the old code had.
 *
 * And the ratings in that record are plain numbers (ELO 1544), which never counted: only an accessor object was read.
 */
function eventWithTwoFlights(scaleName?: string, valueOf?: (index: number) => unknown, scaleType = RATING) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 16 }, setState: true });
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'Flighted', eventType: SINGLES } });
  const eventId = event.eventId;
  const participantIds = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);
  let result: any = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toBe(true);

  // no scaleName: nobody is rated or ranked — the table must work without either
  participantIds.forEach((participantId: string, index: number) => {
    if (!scaleName || !valueOf) return;
    const scaleItem = { scaleValue: valueOf(index), scaleName, scaleType, eventType: SINGLES };
    result = tournamentEngine.setParticipantScaleItem({ participantId, scaleItem });
    expect(result.success).toBe(true);
  });

  const { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 2,
    eventId,
  });
  const [first, second] = flightProfile.flights;

  // only the second flight's draw is generated: the first is planned, as in the production record
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawEntries: second.drawEntries,
    drawId: second.drawId,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition, flight: second });
  expect(result.success).toBe(true);

  return { eventId, plannedDrawId: first.drawId as string, generatedDrawId: second.drawId as string };
}

describe('getEvents withScaleValues — a flight with no generated draw', () => {
  it('plain-number ELO ratings: no throw, and both flights carry their stats', () => {
    // 1500, 1510, … 1650
    const { eventId, plannedDrawId, generatedDrawId } = eventWithTwoFlights(ELO, (index) => 1500 + index * 10);
    const result: any = tournamentEngine.getEvents({ withScaleValues: true });
    expect(result.error).toBeUndefined();

    const scaleValues = result.eventScaleValues[eventId];
    expect(scaleValues.ratings[ELO]).toHaveLength(16);
    expect(scaleValues.ratingsStats[ELO]).toMatchObject({ min: 1500, max: 1650 });

    for (const drawId of [plannedDrawId, generatedDrawId]) {
      expect(scaleValues.draws[drawId].ratings[ELO]).toHaveLength(8);
      expect(scaleValues.draws[drawId].ratingsStats[ELO]).toBeDefined();
    }
  });

  it('accessor-object ratings (WTN), with a zero kept: the planned flight is counted too', () => {
    const { eventId, plannedDrawId } = eventWithTwoFlights(WTN, (index) => ({ wtnRating: index * 2, confidence: 80 }));
    const result: any = tournamentEngine.getEvents({ withScaleValues: true });
    expect(result.error).toBeUndefined();
    const scaleValues = result.eventScaleValues[eventId];
    // a WTN of 0 is a rating, not a missing one
    expect(scaleValues.ratings[WTN]).toHaveLength(16);
    expect(scaleValues.ratingsStats[WTN]).toMatchObject({ min: 0, max: 30 });
    expect(scaleValues.draws[plannedDrawId].ratings[WTN]).toHaveLength(8);
  });

  it('nobody rated or ranked: no throw, and every flight has an empty bucket', () => {
    const { eventId, plannedDrawId, generatedDrawId } = eventWithTwoFlights();
    const result: any = tournamentEngine.getEvents({ withScaleValues: true });
    expect(result.error).toBeUndefined();
    const empty = { ratingsStats: {}, ratings: {}, ranking: {} };
    expect(result.eventScaleValues[eventId].draws[plannedDrawId]).toEqual(empty);
    expect(result.eventScaleValues[eventId].draws[generatedDrawId]).toEqual(empty);
  });

  it('rankings only: the planned flight collects them, through the same bucket', () => {
    const { eventId, plannedDrawId } = eventWithTwoFlights('ATP', (index) => index + 1, RANKING);
    const result: any = tournamentEngine.getEvents({ withScaleValues: true });
    expect(result.error).toBeUndefined();
    expect(result.eventScaleValues[eventId].draws[plannedDrawId].ranking.ATP).toHaveLength(8);
  });
});
