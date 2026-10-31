import { awardProfileFlights } from '../../queries/scales/awardProfileExamples';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

// A flight's number is its level: award points are looked up by it (`getAwardPoints`), so reordering or deleting
// draws must never renumber a flight. Display order is `drawOrder`.

const flightNumbers = (eventId: string) =>
  tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights.map(({ flightNumber }) => flightNumber);
const drawOrders = (eventId: string) =>
  tournamentEngine.getEvent({ eventId }).event.drawDefinitions.map(({ drawOrder }) => drawOrder);

function threeFlights() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }, { drawSize: 4 }] }],
    setState: true,
  });
  const drawIds = tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights.map(({ drawId }) => drawId);
  expect(flightNumbers(eventId)).toEqual([1, 2, 3]);
  return { eventId, drawIds };
}

it('reordering draws changes display order only', () => {
  const { eventId, drawIds } = threeFlights();
  const orderedDrawIdsMap = { [drawIds[0]]: 3, [drawIds[1]]: 1, [drawIds[2]]: 2 };

  let result: any = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.success).toEqual(true);
  expect(flightNumbers(eventId)).toEqual([1, 2, 3]);

  result = tournamentEngine.refreshEventDrawOrder({ eventId });
  expect(result.success).toEqual(true);
  expect(flightNumbers(eventId)).toEqual([1, 2, 3]);
  const { event } = tournamentEngine.getEvent({ eventId });
  const orderOf = Object.fromEntries(event.drawDefinitions.map(({ drawId, drawOrder }) => [drawId, drawOrder]));
  expect(orderOf).toEqual(orderedDrawIdsMap);
});

it('deleting a flight leaves the other flights their numbers', () => {
  const { eventId, drawIds } = threeFlights();

  const result: any = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId: drawIds[0] });
  expect(result.success).toEqual(true);
  expect(flightNumbers(eventId)).toEqual([2, 3]);
  expect(drawOrders(eventId)).toEqual([1, 2]);
});

it('a draw added for an ungenerated flight keeps the flight number and takes its display order', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 24 } }],
    setState: true,
  });
  const { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 3,
    eventId,
  });
  const [first, second, third] = flightProfile.flights;

  // flight 3 is shown first
  let result: any = tournamentEngine.updateDrawIdsOrder({
    orderedDrawIdsMap: { [first.drawId]: 2, [second.drawId]: 3, [third.drawId]: 1 },
    eventId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawEntries: third.drawEntries,
    drawName: third.drawName,
    drawId: third.drawId,
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition, flight: third });
  expect(result.success).toEqual(true);

  expect(flightNumbers(eventId)).toEqual([1, 2, 3]);
  expect(drawOrders(eventId)).toEqual([1]);
});

it("a flight's points do not change when a higher flight is deleted", () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [
          { uniqueParticipants: true, drawSize: 16 },
          { uniqueParticipants: true, drawSize: 16 },
        ],
      },
    ],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);
  const [firstDrawId, secondDrawId] = tournamentEngine
    .getFlightProfile({ eventId })
    .flightProfile.flights.map(({ drawId }) => drawId);

  const policyDefinitions: any = { [POLICY_TYPE_RANKING_POINTS]: { awardProfiles: [awardProfileFlights] } };
  const drawPoints = (drawId: string) => {
    const { personPoints } = scaleEngine.getTournamentPoints({ policyDefinitions, level: 4 });
    return Object.values(personPoints as Record<string, any[]>)
      .flat()
      .filter((award) => award.drawId === drawId)
      .reduce((total, award) => total + (award.points ?? 0), 0);
  };

  const before = drawPoints(secondDrawId);
  expect(before).toBeGreaterThan(0);
  expect(drawPoints(firstDrawId)).toBeGreaterThan(before);

  const result: any = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId: firstDrawId, force: true });
  expect(result.success).toEqual(true);
  expect(drawPoints(secondDrawId)).toEqual(before);
});
