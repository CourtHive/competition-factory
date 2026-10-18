import { drawWithDerivedGoesTo, hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { queryGovernor } from '@Assemblies/governors';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { AD_HOC, FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A draw built outside the factory (an integrator report, 2026-10-18) stored no `winnerMatchUpId` / `loserMatchUpId`, so
 * `getEventData` returned no progression links and the bracket could not be drawn until the first scored matchUp
 * stored them. `addDrawDefinition` now stores them with the draw (CA, 2026-10-18). `getDrawData`, and through it
 * `getEventData` and `getStructureData`, derives them onto a copy of a draw already stored without them: they reach the
 * returned data and never the record (CA, 2026-10-18: "confirming that only the return data is getting the goesTo").
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

const roundMatchUps = (structure: any) => Object.values(structure?.roundMatchUps ?? {}).flat() as any[];

// a record whose one draw stores no edges, as it was before any query read it
const recordWithoutEdges = (drawType: string) => {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16, drawType }] });
  const drawDefinition = stripEdges(tournamentRecord.events[0].drawDefinitions[0]);
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);
  return { tournamentRecord, drawDefinition, eventId, drawId, before: JSON.stringify(tournamentRecord) };
};

it('getEventData returns the edges of a draw stored without them, and leaves the record as it was', () => {
  const { tournamentRecord, eventId, before } = recordWithoutEdges(SINGLE_ELIMINATION);

  for (const call of [1, 2]) {
    const result: any = queryGovernor.getEventData({ tournamentRecord, eventId });
    expect(result.success).toEqual(true);
    const matchUps = roundMatchUps(result.eventData.drawsData[0].structures[0]);
    expect(matchUps.length).toEqual(15);
    expect([call, withWinner(matchUps)]).toEqual([call, 14]); // every matchUp but the final
    expect(JSON.stringify(tournamentRecord)).toEqual(before);
  }
});

it('getDrawData returns the winner and loser edges of a draw stored without them, and leaves the record as it was', () => {
  const { tournamentRecord, drawDefinition, before } = recordWithoutEdges(FIRST_MATCH_LOSER_CONSOLATION);

  const result: any = queryGovernor.getDrawData({ tournamentRecord, drawDefinition });
  expect(result.success).toEqual(true);
  const [main, consolation] = result.structures;
  expect(withWinner(roundMatchUps(main))).toEqual(14);
  expect(withLoser(roundMatchUps(main))).toBeGreaterThan(0);
  expect(withWinner(roundMatchUps(consolation))).toBeGreaterThan(0);

  expect(JSON.stringify(tournamentRecord)).toEqual(before);
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);
});

it('getStructureData returns the edges of a structure stored without them, and leaves the record as it was', () => {
  const { tournamentRecord, drawDefinition, before } = recordWithoutEdges(SINGLE_ELIMINATION);
  const structureId = drawDefinition.structures[0].structureId;

  const result: any = queryGovernor.getStructureData({ tournamentRecord, drawDefinition, structureId });
  expect(result.success).toEqual(true);
  expect(withWinner(roundMatchUps(result.structure))).toEqual(14);
  expect(JSON.stringify(tournamentRecord)).toEqual(before);
});

it('getDrawData through the engine leaves the engine state without edges', () => {
  const { tournamentRecord, drawId } = recordWithoutEdges(SINGLE_ELIMINATION);
  tournamentEngine.setState(tournamentRecord);

  const result: any = tournamentEngine.getDrawData({ drawId });
  expect(result.success).toEqual(true);
  expect(withWinner(roundMatchUps(result.structures[0]))).toEqual(14);

  const stored = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(withWinner(storedMatchUps(stored))).toEqual(0);
});

it('a draw that owes nothing is read as it is, never copied', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }, { drawSize: 8, drawType: AD_HOC, automated: true, roundsCount: 2 }],
  });
  const [generated, adHoc] = tournamentRecord.events.map((event: any) => event.drawDefinitions[0]);
  expect(drawWithDerivedGoesTo(generated)).toBe(generated);
  expect(drawWithDerivedGoesTo(adHoc)).toBe(adHoc);

  const { drawDefinition } = recordWithoutEdges(SINGLE_ELIMINATION);
  const derived = drawWithDerivedGoesTo(drawDefinition);
  expect(derived).not.toBe(drawDefinition);
  expect(withWinner(storedMatchUps(derived))).toEqual(14);
  expect(withWinner(storedMatchUps(drawDefinition))).toEqual(0);
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
