import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants and types
import { TEAM } from '@Constants/eventConstants';

// `hydrateParticipants: false` is declared on GetMatchUpsArgs and honoured by getDrawData, but the
// all-tournament/event/draw wrappers dropped it (assessment 2026-10-16 H3).

function sidesOf(matchUps: any[] = []) {
  return matchUps.flatMap((matchUp) => matchUp.sides ?? []).filter((side) => side.participantId);
}

function getRecord() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  return { tournamentRecord, event, drawDefinition };
}

test('every all-matchUps wrapper honours hydrateParticipants: false', () => {
  const { tournamentRecord, event, drawDefinition } = getRecord();
  const wrappers = {
    allTournamentMatchUps: (params) => allTournamentMatchUps({ tournamentRecord, ...params }),
    allEventMatchUps: (params) => allEventMatchUps({ tournamentRecord, event, inContext: true, ...params }),
    allDrawMatchUps: (params) =>
      allDrawMatchUps({ tournamentRecord, event, drawDefinition, inContext: true, ...params }),
  };

  for (const [name, query] of Object.entries(wrappers)) {
    const hydrated = sidesOf(query({}).matchUps);
    const thin = sidesOf(query({ hydrateParticipants: false }).matchUps);

    expect(hydrated.length, name).toBeGreaterThan(0);
    expect(thin.length, name).toEqual(hydrated.length);
    expect(
      hydrated.every((side) => side.participant?.participantName),
      name,
    ).toEqual(true);
    // the same side shape getDrawData produces: entry context only, no participant attributes
    expect(
      thin.every((side) => side.participant?.participantName === undefined),
      name,
    ).toEqual(true);
    expect(
      thin.map((side) => side.participantId),
      name,
    ).toEqual(hydrated.map((side) => side.participantId));
  }
});

test('the wrappers and getDrawData agree on a thin side', () => {
  const { tournamentRecord, event, drawDefinition } = getRecord();
  const drawSides = sidesOf(
    getDrawData({ tournamentRecord, event, drawDefinition, hydrateParticipants: false }).structures?.flatMap(
      (structure: any) => Object.values(structure.roundMatchUps ?? {}).flat(),
    ),
  );
  const tournamentSides = sidesOf(allTournamentMatchUps({ tournamentRecord, hydrateParticipants: false }).matchUps);

  const byParticipant = (sides) => Object.fromEntries(sides.map((side) => [side.participantId, side.participant]));
  expect(byParticipant(tournamentSides)).toEqual(byParticipant(drawSides));
});

// TEAM lines are hydrated inside their dual by processTieMatchUps, which dropped the option: a thin eventData
// carried thin duals and fully hydrated lines. courthive-public re-attaches line participants by participantId.
test('TEAM lines honour hydrateParticipants: false as their duals do', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    completeAllMatchUps: true,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const linesOf = (matchUps: any[] = []) => matchUps.filter((matchUp) => matchUp.matchUpTieId);
  const nestedLinesOf = (matchUps: any[] = []) => matchUps.flatMap((matchUp) => matchUp.tieMatchUps ?? []);
  const drawMatchUps = (params) =>
    getDrawData({ tournamentRecord, event, drawDefinition, ...params }).structures?.flatMap((structure: any) =>
      Object.values(structure.roundMatchUps ?? {}).flat(),
    );

  const queries = {
    allTournamentMatchUps: (params) => linesOf(allTournamentMatchUps({ tournamentRecord, ...params }).matchUps),
    getDrawData: (params) => nestedLinesOf(drawMatchUps(params)),
  };

  for (const [name, query] of Object.entries(queries)) {
    const hydrated = sidesOf(query({}));
    const thin = sidesOf(query({ hydrateParticipants: false }));

    expect(hydrated.length, name).toBeGreaterThan(0);
    expect(
      hydrated.every((side) => side.participant?.participantName),
      name,
    ).toEqual(true);
    expect(
      thin.every((side) => side.participant?.participantName === undefined),
      name,
    ).toEqual(true);
    expect(
      thin.map((side) => side.participantId),
      name,
    ).toEqual(hydrated.map((side) => side.participantId));
  }
});
