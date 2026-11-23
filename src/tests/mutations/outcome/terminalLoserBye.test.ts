import { checkHeldByeClaims } from '@Tests/testHarness/outcome/heldByeClaimControls';
import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { generateSchedule, prepareDraw, randomConfig } from '@Tests/testHarness/exitPropagation/sweep';

// constants and types
import { BYE, COMPLETED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

function terminalRelabel() {
  return prepareCall(() => {
    const seed = 6101993;
    const drawId = 'terminal';
    const config = randomConfig(seed);
    expect(prepareDraw(config, drawId)).toBe(true);
    const steps = generateSchedule(config, drawId, 30);
    const step = 23;
    const { replay } = replayStalls({ drawId, scenario: { seed, config, steps: steps.slice(0, step) } });
    expect(replay.counts.scheduleAttempted).toBe(step);
    const { source } = seats(engine.getTournament().tournamentRecord);
    expect(source.matchUpStatus).toBe(COMPLETED);
    return { drawId, matchUpId: source.matchUpId, outcome: steps[step].outcome, propagateExitStatus: true };
  });
}

function seats(record: Tournament) {
  const structures = record.events![0].drawDefinitions![0].structures!;
  const round = (name: string, number: number, position: number) =>
    matchUpsOf(structures.find((s) => s.structureName === name)!)!.find(
      (m) => m.roundNumber === number && m.roundPosition === position,
    )!;
  return {
    source: round('East', 2, 2),
    winner: round('East', 3, 1),
    paired: round('East', 2, 1),
    terminal: round('North', 1, 1),
  };
}

it('keeps the occupied terminal position opposite a BYE supported by the paired semifinal', () => {
  const call = terminalRelabel();
  const before = seats(call.prepared);
  expect(before.terminal).toMatchObject({ matchUpStatus: BYE, drawPositions: [1, 2] });
  expect(before.paired).toMatchObject({ matchUpStatus: DEFAULTED, drawPositions: [1] });
  const { source, ...after } = seats(compareHeldClaims(call, true));
  expect(source.matchUpStatus).toBe(WALKOVER);
  expect(after).toEqual({ winner: before.winner, paired: before.paired, terminal: before.terminal });
});

it('relabels the held carry if the terminal seat itself records this source', () => {
  const call = terminalRelabel();
  const { source, terminal } = seats(call.prepared);
  terminal.sideExitProvenance = {
    2: { sourceMatchUpId: source.matchUpId, matchUpStatus: DEFAULTED, previousMatchUpStatus: DEFAULTED },
  };
  const after = seats(compareHeldClaims(call, false));
  expect(after.terminal.sideExitProvenance?.[2]).toEqual({
    sourceMatchUpId: source.matchUpId,
    matchUpStatus: WALKOVER,
    previousMatchUpStatus: WALKOVER,
  });
});

it('settles an unrelated stale scored time even when both source claims stand', () => {
  const call = terminalRelabel();
  const otherBye = (record: Tournament) =>
    matchUpsOf(
      record.events![0].drawDefinitions![0].structures!.find((structure) => structure.structureName === 'West')!,
    )!.find((m) => m.matchUpStatus === BYE)!;
  const other = otherBye(call.prepared);
  other.schedule = { ...other.schedule, scoredTime: '2026-10-24T00:00:00.000Z' };
  expect(otherBye(compareHeldClaims(call, true)).schedule?.scoredTime).toBeUndefined();
});

it('awards the terminal match when the paired seat holds an opponent', () => {
  const call = terminalRelabel();
  const { terminal } = seats(call.prepared);
  const structures = call.prepared.events![0].drawDefinitions![0].structures!;
  const opponent = structures
    .find((s) => s.structureName === 'East')!
    .positionAssignments!.find((s) => s.drawPosition === 6)!;
  const target = structures
    .find((s) => s.structureName === 'North')!
    .positionAssignments!.find((s) => s.drawPosition === 1)!;
  expect(opponent.participantId).toBeTruthy();
  target.participantId = opponent.participantId;
  delete target.bye;
  delete target.byeFromPropagation;
  terminal.matchUpStatus = 'TO_BE_PLAYED';
  expect(seats(compareHeldClaims(call, false)).terminal.matchUpStatus).toBe(WALKOVER);
});

it('requires a terminal reservation, its paired feeder and the original double exit', () => {
  checkHeldByeClaims(terminalRelabel(), {
    'the paired semifinal has an independently completed result': ({ at }) => {
      at('East', 2, 1).matchUpStatus = COMPLETED;
    },
    'the empty side carries a default from a single exit': ({ at }) => {
      at('East', 2, 1).sideExitProvenance![2].previousMatchUpStatus = DEFAULTED;
    },
    'the producer of the paired default has since been played': ({ at }) => {
      at('East', 1, 2).matchUpStatus = COMPLETED;
    },
    'a configured winner link leads out of the terminal despite the missing stored edge': ({
      structure,
      drawDefinition,
    }) => {
      drawDefinition.links!.push({
        linkType: 'WINNER',
        source: { structureId: structure('North').structureId, roundNumber: 1 },
        target: { structureId: structure('West').structureId, roundNumber: 2, feedProfile: 'TOP_DOWN' },
      });
    },
    'the opposite side of the terminal match no longer holds a BYE': ({ at }) => {
      delete at('North', 1).sides!.find((s) => s.bye)!.bye;
    },
    'the opposite position is a structural BYE instead of the paired reservation': ({ structure }) => {
      delete structure('North').positionAssignments!.find((seat) => seat.drawPosition === 1)!.byeFromPropagation;
    },
    'another match still records a carry from this source': ({ at }) => {
      at('West', 1).sideExitProvenance = {
        1: { sourceMatchUpId: at('East', 2, 2).matchUpId, matchUpStatus: WALKOVER },
      };
    },
  });
});
