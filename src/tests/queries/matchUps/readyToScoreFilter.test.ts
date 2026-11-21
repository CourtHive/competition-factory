import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { expect, it } from 'vitest';

it.each([SINGLES, DOUBLES, TEAM])('filters %s by the readiness computed on hydrated matchUps', (eventType) => {
  const { drawIds, eventIds } = mocksEngine.generateTournamentRecord({
    nonRandom: 412,
    drawProfiles: [{ eventType, drawSize: 8 }],
    setState: true,
  });
  const drawId = drawIds[0];
  if (eventType === TEAM) {
    expect(
      tournamentEngine.generateLineUps({
        drawId,
        eventId: eventIds[0],
        scaleAccessor: {},
        exclusiveSingles: true,
        singlesOnly: true,
        attach: true,
      }).success,
    ).toBe(true);
  }
  const ids = (items) => items.map((m) => m.matchUpId).sort();
  const hydrated = tournamentEngine.allTournamentMatchUps().matchUps;
  const expected = ids(hydrated.filter((m) => m.readyToScore));
  expect(ids(tournamentEngine.allTournamentMatchUps({ contextFilters: { readyToScore: true } }).matchUps)).toEqual(
    expected,
  );
  expect(
    ids(tournamentEngine.allTournamentMatchUps({ inContext: false, matchUpFilters: { readyToScore: true } }).matchUps),
  ).toEqual(expected);
  const { tournamentRecord } = tournamentEngine.getTournament();
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const structure = drawDefinition.structures[0];
  const groupKeys = ['upcomingMatchUps', 'pendingMatchUps', 'completedMatchUps', 'abandonedMatchUps', 'byeMatchUps'];
  const grouped = (result) => groupKeys.flatMap((key) => result[key] ?? []);
  const scoped = { tournamentRecord, event, drawDefinition, structure, inContext: true };
  const filter = { readyToScore: true };
  for (const query of [
    (matchUpFilters) => tournamentEngine.allCompetitionMatchUps({ matchUpFilters }).matchUps,
    (matchUpFilters) => tournamentEngine.allTournamentMatchUps({ matchUpFilters }).matchUps,
    (matchUpFilters) => tournamentEngine.allEventMatchUps({ ...scoped, matchUpFilters }).matchUps,
    (matchUpFilters) => tournamentEngine.getAllStructureMatchUps({ ...scoped, matchUpFilters }).matchUps,
    (matchUpFilters) => grouped(tournamentEngine.getCompetitionMatchUps({ inContext: true, matchUpFilters })),
    (matchUpFilters) => grouped(tournamentEngine.tournamentMatchUps({ inContext: true, matchUpFilters })),
    (matchUpFilters) => grouped(tournamentEngine.eventMatchUps({ ...scoped, matchUpFilters })),
    (matchUpFilters) => grouped(tournamentEngine.drawMatchUps({ ...scoped, matchUpFilters })),
    (matchUpFilters) => tournamentEngine.getAllDrawMatchUps({ ...scoped, matchUpFilters }).matchUps,
    (matchUpFilters) => tournamentEngine.allDrawMatchUps({ drawId, inContext: true, matchUpFilters }).matchUps,
    (matchUpFilters) => tournamentEngine.competitionScheduleMatchUps({ matchUpFilters }).dateMatchUps,
  ]) {
    const all = query({});
    const ready = all.filter((m) => m.readyToScore);
    expect(ready.length, query.toString()).toBeGreaterThan(0);
    expect(ready.length).toBeLessThan(all.length);
    if (eventType === TEAM) expect(ready.some((m) => m.matchUpTieId)).toBe(true);
    expect(ids(query(filter))).toEqual(ids(ready));
  }
});
