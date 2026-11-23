import { plannerIndexCounts, selectPlannerIndex, tracePlannerDecisions } from '@Tests/testHarness/outcomePlannerIndex';
import { deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { topicConstants } from '@Constants/topicConstants';
import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import { afterEach, expect, it } from 'vitest';

// constants and types
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  tracePlannerDecisions();
  selectPlannerIndex(false);
  setClock();
});

const drawId = 'index-test';
const invalidatingActions = new Set(['schedule', 'rollback', 'replace']);
const scored = {
  winningSide: 1,
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 1, winningSide: 1 },
    ],
  },
};

function walk(initial: Tournament, retained: boolean) {
  selectPlannerIndex(retained);
  const steps: { action: string; state: string; result: string; plans: string[]; notices: string[] }[] = [];
  const notices: string[] = [];
  const plans: string[] = [];
  tracePlannerDecisions(plans);
  setSubscriptions({
    subscriptions: Object.fromEntries(
      Object.values(topicConstants).map((topic) => [
        topic,
        (payload: unknown) => {
          notices.push(canonicalJson({ topic, payload }));
        },
      ]),
    ),
  });
  const load = () => tournamentEngine.setState(structuredClone(initial));
  expect(load().success).toBe(true);
  deleteNotices();
  const hash = () => canonicalHash(tournamentEngine.getTournament().tournamentRecord);
  const record = (action: string, fn: () => Record<string, unknown>) => {
    notices.length = 0;
    plans.length = 0;
    const before = plannerIndexCounts();
    const { stack: _stack, ...result } = fn();
    if (retained && invalidatingActions.has(action)) {
      expect(plannerIndexCounts().invalidations, action).toBeGreaterThan(before.invalidations);
    }
    if (action !== 'rollback') expect(result, action).toHaveProperty('success', true);
    steps.push({ action, state: hash(), result: canonicalJson(result), plans: [...plans], notices: [...notices] });
    return result;
  };
  const params = () => ({ drawId, matchUpId: nextPlayable(drawId).matchUpId, outcome: scored });
  const score = () => record('score', () => tournamentEngine.setMatchUpStatus(params()));
  expect(score().success).toBe(true);
  expect(score().success).toBe(true);
  const next = params();
  expect(
    record('schedule', () =>
      tournamentEngine.addMatchUpScheduleItems({
        drawId,
        matchUpId: next.matchUpId,
        schedule: { scheduledDate: initial.startDate },
      }),
    ).success,
  ).toBe(true);
  expect(
    record('exit', () =>
      tournamentEngine.setMatchUpStatus({ ...next, outcome: { winningSide: 1, matchUpStatus: WALKOVER } }),
    ).success,
  ).toBe(true);
  expect(
    record('unwind', () => tournamentEngine.setMatchUpStatus({ ...next, allowChangePropagation: true })).success,
  ).toBe(true);
  const before = hash();
  const first = params();
  const failed = record('rollback', () =>
    tournamentEngine.executionQueue(
      [
        { method: 'setMatchUpStatus', params: first },
        { method: 'setMatchUpStatus', params: { ...first, matchUpId: 'absent' } },
      ],
      true,
    ),
  );
  expect(failed.rolledBack).toBe(true);
  expect(hash()).toBe(before);
  expect(score().success).toBe(true);
  expect(record('replace', load).success).toBe(true);
  expect(score().success).toBe(true);
  expect(steps.some((step) => step.notices.length)).toBe(true);
  return steps;
}

it.skipIf(!process.env.PLANNER_INDEX_VERIFY).each([SINGLES, TEAM])(
  'compares retained and fresh plans on %s',
  (eventType) => {
    setClock('2026-10-25T00:01:00.000Z');
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 16, eventType }],
      nonRandom: 41,
      setState: true,
    });
    const fresh = walk(tournamentRecord, false);
    expect(fresh.some((step) => step.plans.length)).toBe(true);
    const retained = walk(tournamentRecord, true);
    expect(plannerIndexCounts().hits).toBeGreaterThan(0);
    for (let i = 0; i < fresh.length; i++) expect(retained[i], fresh[i].action).toEqual(fresh[i]);
  },
);
