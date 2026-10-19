import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/eventConstants';

// P56: `contextProfile.exclude` was applied inside addMatchUpContext, so every query that read a hydrated
// matchUp after that point read it without the excluded fields. A completed draw reported drawCompleted: false
// under `exclude: ['matchUpStatus']`. The exclusion is now a redaction of what the caller receives.

const exclude = ['matchUpStatus'];

function everyHydrated(value: any, visit: (matchUp: any) => void, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value.hasContext === true) visit(value);
  Object.values(value).forEach((child) => everyHydrated(child, visit, seen));
}

function hydratedCount(value: any) {
  let count = 0;
  everyHydrated(value, () => (count += 1));
  return count;
}

function completedDraw(drawType: string) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType }],
    completeAllMatchUps: true,
    setState: true,
  });
  return { tournamentRecord, drawId };
}

test.each([FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN_WITH_PLAYOFF])(
  'a completed %s draw still reports completion when matchUpStatus is excluded',
  (drawType) => {
    const { drawId } = completedDraw(drawType);
    const baseline = tournamentEngine.getDrawData({ drawId });
    expect(baseline.drawInfo.drawCompleted).toEqual(true);

    const result: any = tournamentEngine.getDrawData({ drawId, contextProfile: { exclude } });
    expect(result.drawInfo.drawCompleted).toEqual(true);
    expect(result.structures.map((s) => s.structureCompleted)).toEqual(
      baseline.structures.map((s) => s.structureCompleted),
    );
    expect(result.structures.map((s) => s.sourceStructuresComplete)).toEqual(
      baseline.structures.map((s) => s.sourceStructuresComplete),
    );

    // and the field is gone from every hydrated matchUp the caller receives
    expect(hydratedCount(result)).toBeGreaterThan(0);
    everyHydrated(result, (matchUp) => expect(matchUp.matchUpStatus).toBeUndefined());
    expect(hydratedCount(result)).toEqual(hydratedCount(baseline));
  },
);

test('a direct governor call redacts at its own boundary', () => {
  const { tournamentRecord, drawId } = completedDraw(FIRST_MATCH_LOSER_CONSOLATION);
  const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((d) => d.drawId === drawId);
  const result: any = getDrawData({ tournamentRecord, drawDefinition, contextProfile: { exclude } });
  expect(result.drawInfo.drawCompleted).toEqual(true);
  everyHydrated(result, (matchUp) => expect(matchUp.matchUpStatus).toBeUndefined());

  const matchUps = allTournamentMatchUps({ tournamentRecord, contextProfile: { exclude } }).matchUps ?? [];
  expect(matchUps.length).toBeGreaterThan(0);
  matchUps.forEach((matchUp) => expect(matchUp.matchUpStatus).toBeUndefined());
});

test('filters read the fields an excluded projection drops', () => {
  completedDraw(FIRST_MATCH_LOSER_CONSOLATION);
  const matchUpFilters = { matchUpStatuses: [COMPLETED] };
  const contextFilters = { matchUpStatuses: [COMPLETED] };
  const ids = (params) =>
    tournamentEngine
      .allTournamentMatchUps(params)
      .matchUps.map((m) => m.matchUpId)
      .sort((a, b) => a.localeCompare(b));

  const expected = ids({ matchUpFilters, contextFilters });
  expect(expected.length).toBeGreaterThan(0);
  expect(ids({ matchUpFilters, contextFilters, contextProfile: { exclude } })).toEqual(expected);
});

test('the lines of a TEAM dual are redacted with the dual, and the record is untouched', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ contextProfile: { exclude } });
  const duals = matchUps.filter((m) => m.tieMatchUps?.length);
  expect(duals.length).toBeGreaterThan(0);
  duals.forEach((dual) => {
    expect(dual.matchUpStatus).toBeUndefined();
    dual.tieMatchUps.forEach((line) => expect(line.matchUpStatus).toBeUndefined());
  });
  matchUps.forEach((matchUp) => expect(matchUp.matchUpStatus).toBeUndefined());

  const stored = tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps;
  expect(stored.length).toEqual(matchUps.length);
  stored.forEach((matchUp) => expect(matchUp.matchUpStatus).toBeDefined());

  // a caller-supplied record is read, never written
  const direct = allTournamentMatchUps({ tournamentRecord, contextProfile: { exclude } }).matchUps ?? [];
  expect(direct.length).toEqual(matchUps.length);
  tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.forEach((matchUp) =>
    expect(matchUp.matchUpStatus).toBeDefined(),
  );
});

test('inContext: false is not redacted: exclude applies to hydrated matchUps only', () => {
  completedDraw(FIRST_MATCH_LOSER_CONSOLATION);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: false, contextProfile: { exclude } });
  expect(matchUps.length).toBeGreaterThan(0);
  matchUps.forEach((matchUp) => expect(matchUp.matchUpStatus).toBeDefined());
});

test('schedule order is computed before schedule is redacted', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-17',
    setState: true,
  });
  const firstRound = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
    .matchUps.sort((a, b) => a.matchUpId.localeCompare(b.matchUpId));
  const times = ['14:00', '09:00', '11:00', '10:00'];
  firstRound.forEach(({ matchUpId, drawId }, i) => {
    const schedule = { scheduledDate: '2026-10-17', scheduledTime: times[i] };
    expect(tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule }).success).toEqual(true);
  });

  const scheduledIds = new Set(firstRound.map((m) => m.matchUpId));
  const order = (dateMatchUps) => dateMatchUps.map((m) => m.matchUpId).filter((id) => scheduledIds.has(id));
  const expected = order(tournamentEngine.competitionScheduleMatchUps().dateMatchUps);
  expect(expected).toEqual([1, 3, 2, 0].map((i) => firstRound[i].matchUpId));
  const redacted = tournamentEngine.competitionScheduleMatchUps({ contextProfile: { exclude: ['schedule'] } });
  expect(order(redacted.dateMatchUps)).toEqual(expected);
  redacted.dateMatchUps.forEach((matchUp) => expect(matchUp.schedule).toBeUndefined());
});
