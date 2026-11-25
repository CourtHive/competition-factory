import { prepareCall, playCall, expectPlayedParity } from '@Tests/testHarness/outcome/recordedCallHarness';
import {
  getOutcomePipeline,
  getProvider,
  setOutcomePipeline,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';
import { findTarget, POLICY_OFF, won } from '@Tests/testHarness/outcome/directionFixtures';
import * as nested from '@Mutate/matchUps/outcome/plan/recordedCascade';
import * as legacy from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import * as lineUps from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import * as whole from '@Mutate/matchUps/outcome/plan/recordedCall';
import * as family from '@Mutate/matchUps/outcome/plan/teamFinalLine';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { storedRecord } from '@Tests/testHarness/outcome/objectGraph';
import { inDraftWrites } from '@Global/state/withDraftWrites';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { setClock } from '@Tools/clock';
import mocks from '@Assemblies/engines/mock';
import engine from '@Engines/syncEngine';

import { CONSOLATION, DOUBLE_ELIMINATION, LOSER, MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/matchUpTypes';
import type { Tournament } from '@Types/tournamentTypes';

const drawId = 'd';
const target = { structureName: 'Main', roundNumber: 3, roundPosition: 1 };
let previous: ReturnType<typeof getOutcomePipeline>;
beforeEach(() => {
  previous = getOutcomePipeline();
});
afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(previous);
  setClock();
});

function prepare(side: 1 | 2, policyOff = false, held = false) {
  return prepareCall(() => {
    mocks.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawType: DOUBLE_ELIMINATION,
          drawSize: 8,
          participantsCount: 2,
          eventType: TEAM,
          tieFormatName: 'USTA_COLLEGE',
        },
      ],
      nonRandom: 1,
      setState: true,
    });
    if (policyOff) expect(engine.attachPolicies({ policyDefinitions: POLICY_OFF }).success).toBe(true);
    expect(engine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true }).success).toBe(true);
    const win = { winningSide: side };
    if (held) {
      expect(engine.setMatchUpStatus({ drawId, matchUpId: findTarget(target), outcome: win }).success).toBe(true);
    } else {
      for (const singlesLine of [0, 1, 2]) {
        const matchUpId = findTarget({ ...target, singlesLine });
        expect(engine.setMatchUpStatus({ drawId, matchUpId, outcome: win }).success).toBe(true);
      }
    }
    return { drawId, matchUpId: findTarget({ ...target, singlesLine: held ? 0 : 3 }), outcome: held ? won(side) : win };
  });
}

function scoreAlias(result: ReturnType<typeof playCall>, lineId: unknown) {
  const score = result.result.tieMatchUpResult?.score;
  if (score === undefined) return 'absent';
  const main = storedRecord().events![0].drawDefinitions![0].structures!.find((s) => s.stage === MAIN)!;
  const dual = main.matchUps!.find((m) => m.tieMatchUps?.some((line) => line.matchUpId === lineId))!;
  return score === dual.score ? 'stored dual' : 'detached';
}

it.each([
  [1, false, false],
  [2, false, false],
  [1, true, false],
  [2, true, false],
  [2, false, true],
] as const)(
  'owns the fresh line through the engine (side %i, policy off %s, dual already decided %s)',
  (side, off, held) => {
    const call = prepare(side, off, held);
    const program = vi.spyOn(family, 'teamFinalLine');
    program.mockReturnValueOnce(undefined);
    const reference = playCall('v2', call);
    expect(reference.result.success).toBe(true);
    const referenceAlias = scoreAlias(reference, call.params.matchUpId);
    expect(program).toHaveBeenCalledTimes(1);
    const wholeWriter = vi.spyOn(whole, 'recordWholeCall').mockReturnValue(undefined);
    const nestedWriter = vi.spyOn(nested, 'recordDoubleExitCascade').mockReturnValue(undefined);
    const oldWriter = vi.spyOn(legacy, 'setMatchUpState');
    program.mockClear();
    const native = playCall('v2', call);
    expect(program.mock.results.map(({ value }) => !!value?.ops)).toEqual([true]);
    expect(wholeWriter).not.toHaveBeenCalled();
    expect(nestedWriter).not.toHaveBeenCalled();
    expect(oldWriter).not.toHaveBeenCalled();
    expect(scoreAlias(native, call.params.matchUpId)).toBe(referenceAlias);
    expectPlayedParity(native, reference);
    expectPlayedParity(playCall('differential', call), reference);
  },
);

it.each([
  'wrong feed',
  'finishing order gap',
  'occupied receiver',
  'stale scored time',
  'scored line',
  'qualifier seat',
  'propagated bye',
  'auto-calc flag',
] as const)('leaves %s to the existing writer', (condition) => {
  const call = prepare(1);
  const draw = call.prepared.events![0].drawDefinitions![0];
  const main = draw.structures!.find((s) => s.stage === MAIN)!;
  const back = draw.structures!.find((s) => s.stage === CONSOLATION)!;
  const dual = main.matchUps!.find((m) => m.tieMatchUps?.some((line) => line.matchUpId === call.params.matchUpId))!;
  const feeder = back.matchUps!.find((m) => m.matchUpId === dual.loserMatchUpId)!;
  if (condition === 'wrong feed') {
    const final = main.matchUps!.find((m) => m.matchUpId === dual.winnerMatchUpId)!;
    const link = draw.links!.find(
      (l) =>
        l.linkType === LOSER && l.source.structureId === main.structureId && l.source.roundNumber === final.roundNumber,
    )!;
    link.source.roundNumber = dual.roundNumber;
  } else if (condition === 'occupied receiver') {
    const held = back.positionAssignments!.find((a) => feeder.drawPositions!.includes(a.drawPosition) && !a.bye)!;
    held.participantId = main.positionAssignments!.find(
      (a) => a.drawPosition === getSideDrawPosition({ matchUp: dual, sideNumber: 2 }),
    )!.participantId;
  } else if (condition === 'scored line') {
    const line = dual.tieMatchUps!.find((m) => m.matchUpId === call.params.matchUpId)!;
    line.schedule = { ...line.schedule, scoredTime: '2026-10-24T11:00:00.000Z' };
  } else if (condition === 'qualifier seat') {
    main.positionAssignments!.find((a) => a.participantId)!.qualifier = true;
  } else if (condition === 'propagated bye') {
    back.positionAssignments!.find((a) => feeder.drawPositions!.includes(a.drawPosition) && a.bye)!.byeFromPropagation =
      true;
  } else if (condition === 'auto-calc flag') {
    Object.assign(call.params, { enableAutoCalc: true });
  } else if (condition === 'finishing order gap') {
    dual.tieMatchUps!.find((m) => m.orderOfFinish === 1)!.orderOfFinish = 99;
  } else {
    feeder.tieMatchUps![0].schedule = { scoredTime: '2026-10-24T11:00:00.000Z' };
  }
  const native = vi.spyOn(family, 'teamFinalLine');
  native.mockImplementationOnce(() => undefined);
  const baseline = playCall('v2', call);
  native.mockClear();
  const actual = playCall('v2', call);
  expect(native.mock.results.some(({ value }) => value?.ops)).toBe(false);
  expectPlayedParity(actual, baseline);
});

it('uses the original recorder when a stamp getter changes the separately held tournament', () => {
  const call = prepare(1);
  const original = getProvider();
  const planned = family.teamFinalLine;
  const planner = vi.spyOn(family, 'teamFinalLine');
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  let measuring = false;
  let edited = false;
  let stampReads = 0;
  const run = (native: boolean) => {
    measuring = false;
    edited = false;
    stampReads = 0;
    recorder.mockClear();
    planner.mockImplementationOnce((...args) => {
      measuring = true;
      return native ? planned(...args) : undefined;
    });
    const actual = playCall('v2', call);
    expect(edited).toBe(true);
    expect(recorder).toHaveBeenCalledTimes(1);
    return { actual, stampReads };
  };
  try {
    setStateProvider({
      ...original,
      getCapturedStamps() {
        if (measuring) {
          stampReads++;
          if (!edited) {
            edited = true;
            const stored = Object.values(original.getTournamentRecords())[0] as Tournament;
            const draw = stored.events![0].drawDefinitions![0];
            const dormant = draw.structures!.find((s) => s.stage === CONSOLATION)!.matchUps![0];
            dormant.schedule = { ...dormant.schedule, scoredTime: '2026-10-24T11:00:00.000Z' };
          }
        }
        return original.getCapturedStamps?.();
      },
    });
    const baseline = run(false);
    const candidate = run(true);
    expect(candidate.stampReads).toBe(baseline.stampReads);
    expectPlayedParity(candidate.actual, baseline.actual);
  } finally {
    setStateProvider(original);
  }
});

it('preserves an independent live edit on pre-stamped parents during detached delivery', () => {
  const call = prepare(2, false, true);
  const original = getProvider();
  const planned = family.teamFinalLine;
  const planner = vi.spyOn(family, 'teamFinalLine');
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  const parents = () => {
    const stored = Object.values(original.getTournamentRecords())[0] as Tournament;
    const draw = stored.events![0].drawDefinitions![0];
    return [draw, draw.structures!.find((s) => s.stage === MAIN)!];
  };
  let measuring = false;
  let seeded = false;
  let edited = false;
  const run = (native: boolean) => {
    measuring = seeded = edited = false;
    recorder.mockClear();
    planner.mockImplementationOnce((...args) => {
      measuring = true;
      return native ? planned(...args) : undefined;
    });
    const actual = playCall('v2', call);
    expect([seeded, edited]).toEqual([true, true]);
    expect(recorder).toHaveBeenCalledTimes(native ? 0 : 1);
    expect(parents().map((p) => p.notes)).toEqual(['independent edit', 'independent edit']);
    return actual;
  };
  try {
    setStateProvider({
      ...original,
      getCapturedStamps() {
        const stamps = original.getCapturedStamps?.();
        if (measuring && !seeded && stamps) {
          seeded = true;
          for (const parent of parents()) stamps.add(parent);
        }
        return stamps;
      },
      addNotice(notice, settings) {
        if (measuring && !edited && inDraftWrites()) {
          edited = true;
          for (const parent of parents()) parent.notes = 'independent edit';
        }
        return original.addNotice(notice, settings);
      },
    });
    const baseline = run(false);
    expectPlayedParity(run(true), baseline);
  } finally {
    setStateProvider(original);
  }
});

it('restores the caller-owned score extension before falling back on a changed request', () => {
  const call = prepare(1);
  const planned = family.teamFinalLine;
  const planner = vi.spyOn(family, 'teamFinalLine');
  const original = getProvider();
  const borrowed = { revision: 1 };
  call.params.outcome = { winningSide: 1, score: { extensions: [{ name: 'client observation', value: borrowed }] } };
  let measuring = false;
  let edited = false;
  const run = (native: boolean) => {
    measuring = edited = false;
    planner.mockImplementationOnce((...args) => {
      measuring = true;
      return native ? planned(...args) : undefined;
    });
    const actual = playCall('v2', call, true);
    expect(edited).toBe(true);
    expect(borrowed.revision).toBe(1);
    return actual;
  };
  try {
    setStateProvider({
      ...original,
      addNotice(notice, settings) {
        if (measuring && !edited && inDraftWrites()) {
          edited = true;
          borrowed.revision = 2;
        }
        return original.addNotice(notice, settings);
      },
    });
    const baseline = run(false);
    const actual = run(true);
    expect(planner.mock.results.at(-1)?.value?.ops).toBeUndefined();
    expectPlayedParity(actual, baseline);
  } finally {
    setStateProvider(original);
  }
});

it('leaves an unusual request value to the recorder, which samples the stamp ledger itself', () => {
  const call = prepare(1);
  call.params.outcome = { winningSide: 1, score: { extensions: [{ name: 'client clock', value: new Date(0) }] } };
  const native = vi.spyOn(family, 'teamFinalLine');
  native.mockImplementationOnce(() => undefined);
  const baseline = playCall('v2', call);
  native.mockClear();
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  const actual = playCall('v2', call);
  expect(native.mock.results.map(({ value }) => value)).toEqual([undefined]);
  expect(recorder.mock.calls.map((args) => args[1])).toEqual([undefined]);
  expectPlayedParity(actual, baseline);
});

it('abstains to the existing writer when a detached phase throws', () => {
  const call = prepare(2);
  const native = vi.spyOn(family, 'teamFinalLine');
  native.mockImplementationOnce(() => undefined);
  const baseline = playCall('v2', call);
  native.mockClear();
  const recorder = vi.spyOn(whole, 'recordWholeCall');
  vi.spyOn(lineUps, 'ensureSideLineUps').mockImplementationOnce(() => {
    throw new Error('detached phase');
  });
  const actual = playCall('v2', call);
  expect(native.mock.results.map(({ value }) => value)).toEqual([{ abstain: 'cascade' }]);
  expect(recorder).not.toHaveBeenCalled();
  expectPlayedParity(actual, baseline);
});
