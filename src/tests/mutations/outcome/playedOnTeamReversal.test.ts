import { positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setOutcomePipeline } from '@Global/state/globalState';
import { setClock } from '@Tools/clock';
import { digest, drawId, dual, fixture, side2, summary } from './teamReversalFixture';

afterEach(() => {
  setOutcomePipeline('v1');
  setClock();
});

const observer = vi.hoisted(() => ({ active: false, changedLiveScore: false }));
vi.mock('@Mutate/matchUps/score/modifyMatchUpScore', async (load) => {
  const actual = await load<typeof import('@Mutate/matchUps/score/modifyMatchUpScore')>();
  return {
    ...actual,
    modifyMatchUpScore(...args: Parameters<typeof actual.modifyMatchUpScore>) {
      if (!observer.active) return actual.modifyMatchUpScore(...args);
      const before = digest();
      const result = actual.modifyMatchUpScore(...args);
      if (digest() !== before) observer.changedLiveScore = true;
      return result;
    },
  };
});

const modes = ['v1', 'v2', 'differential'] as const;
const routes = ['direct', 'queueOff', 'queueOn'] as const;
const cells = modes.flatMap((mode) => routes.map((route) => ({ mode, route })));
type Cell = (typeof cells)[number];

function loadState({ mode }: Cell, played: boolean, competingSeat: boolean) {
  const record = fixture(played);
  const structures = record.events![0].drawDefinitions![0].structures!;
  const main = structures.find((s) => s.stage === 'MAIN')!;
  const back = structures.find((s) => s.stage === 'CONSOLATION')!;
  const team5 = positionAssignmentsOf(main)!.find((a) => a.drawPosition === 5)!.participantId!;
  const seat = positionAssignmentsOf(back)!.find((a) => a.drawPosition === 3)!;
  if (competingSeat) seat.participantId = team5;
  else delete seat.participantId;
  expect(engine.setState(record).success).toBe(true);
  setOutcomePipeline(mode);
  setClock('2026-01-01T00:01:00.000Z');
  expect(summary()).toMatchObject({
    parent: ['WALKOVER', 1],
    semifinal: played ? ['RETIRED', 2] : ['TO_BE_PLAYED', null],
    backdrawTeam5: competingSeat ? [3] : [],
  });
}

function submit({ route }: Cell) {
  const params = { drawId, matchUpId: dual(1, 3).tieMatchUps![1].matchUpId, outcome: side2() };
  return route === 'direct'
    ? engine.setMatchUpStatus(params)
    : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queueOn');
}

function expectPreflightRefusal(cell: Cell, code: string) {
  const before = digest();
  observer.changedLiveScore = false;
  observer.active = true;
  try {
    const result = submit(cell);
    expect.soft(result.error?.code).toBe(code);
  } finally {
    observer.active = false;
    expect.soft(digest(), 'entire record after the call').toBe(before);
    expect.soft(observer.changedLiveScore, 'live score write before refusal or restore').toBe(false);
  }
}

describe('F-031 played-on winner reversal', () => {
  for (const competingSeat of [false, true]) {
    it.each(cells)(
      `preserves the played retirement in $mode/$route (competing assignment ${competingSeat})`,
      (cell) => {
        loadState(cell, true, competingSeat);
        expectPreflightRefusal(cell, 'ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE');
      },
    );
  }
});

describe('F-031 independent duplicate-assignment preflight', () => {
  it.each(cells)('refuses before writing on an unplayed semifinal in $mode/$route', (cell) => {
    loadState(cell, false, true);
    expectPreflightRefusal(cell, 'ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT');
  });

  it.each(cells)('accepts a legal unplayed reversal with a free assignment in $mode/$route', (cell) => {
    loadState(cell, false, false);
    expect(submit(cell).success).toBe(true);
    expect(summary()).toMatchObject({
      line: ['COMPLETED', 2],
      parent: ['COMPLETED', 2],
      semifinal: ['TO_BE_PLAYED', null],
      semifinalSeats: [6, 8],
      backdrawTeam5: [4],
      backdrawTeam6: [],
    });
  });
});
