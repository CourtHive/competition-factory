import { hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { queryGovernor } from '@Assemblies/governors';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A draw built outside the factory (an integrator report, 2026-10-18) stored no `winnerMatchUpId` / `loserMatchUpId`, so
 * `getEventData` returned no progression links and the bracket could not be drawn until the first scored matchUp
 * stored them. `addDrawDefinition` now stores them with the draw (CA, 2026-10-18), and `getEventData` derives them onto
 * its own copy of a draw already stored without them.
 */
const stripEdges = (drawDefinition: any) => {
  for (const structure of drawDefinition.structures)
    for (const matchUp of structure.matchUps ?? []) {
      delete matchUp.winnerMatchUpId;
      delete matchUp.loserMatchUpId;
    }
  return drawDefinition;
};

const storedMatchUps = (drawDefinition: any) => drawDefinition.structures.flatMap((s: any) => s.matchUps ?? []);
const withWinner = (matchUps: any[]) => matchUps.filter((matchUp) => matchUp.winnerMatchUpId).length;
const withLoser = (matchUps: any[]) => matchUps.filter((matchUp) => matchUp.loserMatchUpId).length;

it('getEventData returns the edges of a draw stored without them, and leaves the record as it was', () => {
  const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
  });
  const drawDefinition = stripEdges(tournamentRecord.events[0].drawDefinitions[0]);
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);

  let result: any = queryGovernor.getEventData({ tournamentRecord, eventId: eventIds[0] });
  expect(result.success).toEqual(true);
  const matchUps = result.eventData.drawsData[0].structures[0].roundMatchUps;
  const eventDataMatchUps = Object.values(matchUps).flat() as any[];
  expect(eventDataMatchUps.length).toEqual(7);
  expect(withWinner(eventDataMatchUps)).toEqual(6); // every matchUp but the final

  expect(withWinner(storedMatchUps(drawDefinition))).toEqual(0);
  result = queryGovernor.getEventData({ tournamentRecord, eventId: eventIds[0] });
  expect(withWinner(Object.values(result.eventData.drawsData[0].structures[0].roundMatchUps).flat() as any[])).toEqual(
    6,
  );
});

it('addDrawDefinition stores the winner and loser edges of a draw built without them', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ eventProfiles: [{ participantsProfile: { participantsCount: 16 } }] });
  tournamentEngine.setState(tournamentRecord);

  let result: any = tournamentEngine.generateDrawDefinition({ drawType: FIRST_MATCH_LOSER_CONSOLATION, eventId });
  expect(result.success).toEqual(true);
  const generated = storedMatchUps(result.drawDefinition);
  const expected = { winner: withWinner(generated), loser: withLoser(generated) };
  expect(expected.winner).toBeGreaterThan(0);
  expect(expected.loser).toBeGreaterThan(0);

  const drawDefinition = stripEdges(result.drawDefinition);
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);

  result = tournamentEngine.addDrawDefinition({ drawDefinition, eventId });
  expect(result.success).toEqual(true);

  const stored = tournamentEngine.getEvent({ drawId: drawDefinition.drawId }).drawDefinition;
  expect(hasStoredGoesTo({ drawDefinition: stored })).toEqual(true);
  expect(withWinner(storedMatchUps(stored))).toEqual(expected.winner);
  expect(withLoser(storedMatchUps(stored))).toEqual(expected.loser);
});

it('addDrawDefinition stores the edges of a replacement draw built without them', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = stripEdges(tournamentEngine.getEvent({ drawId }).drawDefinition);
  const result: any = tournamentEngine.addDrawDefinition({ drawDefinition, eventId, allowReplacement: true });
  expect(result.success).toEqual(true);

  const stored = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(withWinner(storedMatchUps(stored))).toEqual(6);
});
