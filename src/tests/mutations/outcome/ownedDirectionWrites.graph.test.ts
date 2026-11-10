import { getProvider, getTournamentRecords, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { playForward as prepareForward } from '@Tests/testHarness/exitPropagation/driver';
import { prepareHeldCarryCorrection } from '@Tests/testHarness/outcome/directionFixtures';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { HELD_BYE_REMOVALS } from '@Tests/testHarness/outcome/directionFixtures';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { unwindWalk } from '@Mutate/matchUps/outcome/unwindWalk';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyOutcomeOps } from '@Mutate/matchUps/outcome/ops';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';
import {
  assignmentViewFixture,
  STANDING_BYE_CAPTURES,
  NOTICE_RELAY_CARRIES,
  AWARDED_PRODUCED_RELAY,
  PRODUCED_RELAY,
  CARRIER_SENT_ON,
  STANDALONE_INDIRECT_CLEARS,
  CONVERGED_PRODUCED_RELAYS,
  STANDALONE_CARRIED_CONVERGENCES,
  TERMINAL_RELAY_CAPTURES,
  OCCUPIED_FINAL_RELAY_CAPTURES,
  INDIRECT_COMPOUND_CLEARS,
  play as prepareDirection,
  findTarget,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { USTA_COLLEGE, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { TEAM, SINGLES, DOUBLES } from '@Constants/eventConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';
import {
  replayFailure as prepareCensus,
  prepareDraw,
  randomConfig,
  generateSchedule,
} from '@Tests/testHarness/exitPropagation/sweep';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
} from '@Constants/drawDefinitionConstants';
import {
  ROUND_ROBIN,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
  CONSOLATION,
  QUALIFYING,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  MODIFY_MATCHUP,
  UPDATE_INCONTEXT_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_DRAW_DEFINITION,
} from '@Constants/topicConstants';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  RETIRED,
  DEFAULTED,
  WALKOVER,
  TO_BE_PLAYED,
  BYE,
} from '@Constants/matchUpStatusConstants';

const counter = vi.hoisted(() => ({
  active: false,
  calls: 0,
  prepare: undefined as ((params: any) => void) | undefined,
}));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (load) => {
  const actual: any = await load();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      counter.prepare?.(args[0]);
      if (counter.active) counter.calls++;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.graph.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  counter.active = false;
  counter.prepare = undefined;
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fresh(drawProfile = {}, policyDefinitions = {}, nonRandom = 1, hasLineUps = true) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const generated = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, ...drawProfile }],
    policyDefinitions,
    nonRandom,
    setState: true,
  });
  expect(generated.success).toBe(true);
  if (hasLineUps && 'eventType' in drawProfile && drawProfile.eventType === TEAM)
    expect(
      tournamentEngine.generateLineUps({ drawId: generated.drawIds![0], useDefaultEventRanking: true, attach: true })
        .success,
    ).toBe(true);
  const record = Object.values(getTournamentRecords())[0] as Tournament;
  const draw = record.events![0].drawDefinitions![0];
  return {
    drawId: generated.drawIds![0],
    record,
    matchUps: getMatchUpsMap({ drawDefinition: draw }).drawMatchUps,
  };
}

function write(
  mode: typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2,
  drawId: string,
  matchUpId: string,
  outcome: object,
  params = {},
) {
  setOutcomePipeline(mode);
  counter.calls = 0;
  counter.active = true;
  try {
    const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, ...params });
    expect(result).toMatchObject({ success: true });
    if (mode === OUTCOME_PIPELINE_V2) expect(counter.calls).toBe(0);
    const { stack: _stack, ...returned } = result;
    return returned;
  } finally {
    counter.active = false;
  }
}

const won = () => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

function observeNoticeTopics(includeDraw = false) {
  const relevant = [MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS, ...(includeDraw ? [MODIFY_DRAW_DEFINITION] : [])];
  const topics: string[] = [];
  const provider = getProvider();
  const add = provider.addNotice;
  vi.spyOn(provider, 'addNotice').mockImplementation((notice, ...args) => {
    const topic = (notice as { topic: string }).topic;
    if (counter.active && relevant.includes(topic)) topics.push(topic);
    return add(notice, ...args);
  });
  setSubscriptions({ subscriptions: Object.fromEntries(relevant.map((topic) => [topic, () => undefined])) });
  return topics;
}

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clears result and direction with exact own properties and reset sharing',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, won());
    const result = write(mode, drawId, source.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    expect(Object.keys(result)).toEqual(['success', 'connectedStructures']);
    expect(Object.hasOwn(source, 'winningSide')).toBe(true);
    expect(Object.hasOwn(source, 'matchUpFormat')).toBe(true);
    expect(Object.hasOwn(source, 'sideExitProvenance')).toBe(false);
    expect(source.score).toBe(toBePlayed.score);
    expect(source.matchUpStatusCodes).toBe(toBePlayed.matchUpStatusCodes);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(Object.hasOwn(target, 'score')).toBe(true);
    expect(target.winningSide).toBeUndefined();
    expect(target.score).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s records an unplayed double exit with the reset fixture keys',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(source.score).toBe(toBePlayed.score);
    expect(source.matchUpStatusCodes).toBe(toBePlayed.matchUpStatusCodes);
    expect(Object.hasOwn(source, 'winningSide')).toBe(true);
    expect(Object.hasOwn(source, 'sideExitProvenance')).toBe(true);
    expect(Object.hasOwn(source, 'matchUpFormat')).toBe(true);
    expect(Object.keys(source.score!)).toEqual(['scoreStringSide1', 'scoreStringSide2', 'sets']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s includes the unnamed tally modification before its named result',
  (mode) => {
    const { drawId, matchUps, record } = fresh({ drawSize: 4, drawType: ROUND_ROBIN });
    const observed: string[][] = [];
    const provider = getProvider();
    const original = provider.cycleModifiedTournamentIds!;
    vi.spyOn(provider, 'cycleModifiedTournamentIds').mockImplementation(() => {
      const ids = original();
      if (counter.active && ids?.size) observed.push([...ids]);
      return ids;
    });
    write(mode, drawId, matchUps[0].matchUpId, won());
    expect(observed.at(-1)).toEqual(['*', record.tournamentId]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the undecided dual tally with explicit undefined fields',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 4, eventType: TEAM, tieFormatName: USTA_COLLEGE });
    const dual = matchUps.find((m) => m.tieMatchUps?.length && m.roundNumber === 1 && m.roundPosition === 1)!;
    const result = write(mode, drawId, dual.tieMatchUps![0].matchUpId, { winningSide: 1 });
    expect(Object.keys(result)).toEqual(['success', 'tieMatchUpResult', 'context']);
    expect(Object.keys(result.tieMatchUpResult)).toEqual([
      'success',
      'score',
      'removeWinningSide',
      'tieFormatRemoved',
      'winningSide',
    ]);
    expect(result.tieMatchUpResult.tieFormatRemoved).toBeUndefined();
    expect(result.tieMatchUpResult.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s convergence shares the reset score while keeping its freshly derived codes distinct',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const first = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const second = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, first.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    write(mode, drawId, second.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(target.matchUpStatus).toBe(DOUBLE_WALKOVER);
    expect(target.score).toBe(toBePlayed.score);
    expect(target.matchUpStatusCodes).toEqual([]);
    expect(target.matchUpStatusCodes).not.toBe(toBePlayed.matchUpStatusCodes);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clearing a double exit shares the reset score with its unwound product',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(target.matchUpStatus).toBe('WALKOVER');
    write(mode, drawId, source.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    expect(source.score).toBe(toBePlayed.score);
    expect(target.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(target.score).toBe(toBePlayed.score);
    expect(target.score).toBe(source.score);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s writes a TEAM line finishing order before its scored-time schedule and interleaves its notices',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 4, eventType: TEAM, tieFormatName: USTA_COLLEGE });
    const dual = matchUps.find((m) => m.tieMatchUps?.length && m.roundNumber === 1 && m.roundPosition === 1)!;
    const line = dual.tieMatchUps![0];
    const buffers: { topic: string; key?: string }[][] = [];
    const provider = getProvider();
    const clear = provider.deleteNotices;
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active) buffers.push(provider.getNoticeBuffer!().map(({ topic, key }) => ({ topic, key })));
      return clear();
    });
    setSubscriptions({
      subscriptions: {
        [MODIFY_MATCHUP]: () => undefined,
        [UPDATE_INCONTEXT_MATCHUP]: () => undefined,
      },
    });
    write(mode, drawId, line.matchUpId, { winningSide: 1 });
    const keys = Object.keys(line);
    expect(keys.indexOf('orderOfFinish')).toBeGreaterThan(-1);
    expect(keys.indexOf('schedule')).toBeGreaterThan(keys.indexOf('orderOfFinish'));
    expect(buffers.at(-1)).toEqual([
      { topic: UPDATE_INCONTEXT_MATCHUP, key: line.matchUpId },
      { topic: MODIFY_MATCHUP, key: line.matchUpId },
      { topic: UPDATE_INCONTEXT_MATCHUP, key: dual.matchUpId },
      { topic: MODIFY_MATCHUP, key: dual.matchUpId },
    ]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s stores a new ad hoc matchUp stamp before its scored-time schedule',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 4, drawType: 'AD_HOC', automated: true, roundsCount: 1 });
    const source = matchUps[0];
    delete source.updatedAt;
    delete source.schedule;
    write(mode, drawId, source.matchUpId, won());
    expect(Object.keys(source).indexOf('schedule')).toBeGreaterThan(Object.keys(source).indexOf('updatedAt'));
    expect(matchUps.find((matchUp) => matchUp === source)?.schedule?.scoredTime).toBe('2026-11-08T12:00:00.000Z');
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s releasing an onward seat leaves winner-key insertion to the later reset writer',
  (mode) => {
    const { drawId, record } = fresh(
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
        ],
      },
      PRODUCED_EXIT_POLICY,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((structure) => structure.stage === MAIN)!
      .matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 2)!;
    const released = structures
      .find((structure) => structure.stage === CONSOLATION)!
      .matchUps!.find((matchUp) => matchUp.roundNumber === 3 && matchUp.roundPosition === 1)!;
    write(mode, drawId, source.matchUpId, toBePlayed);
    expect(released.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(Object.keys(released).slice(-4)).toEqual(['matchUpStatusCodes', 'score', 'matchUpFormat', 'winningSide']);
    expect(Object.hasOwn(released, 'winningSide')).toBe(true);
    expect(released.winningSide).toBeUndefined();
    expect(released.score).toBe(toBePlayed.score);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s a plain loser advanced through a BYE preserves an absent winner key',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 16, participantsCount: 13 });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((s) => s.structureName === 'East')!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
    const landing = structures
      .find((s) => s.structureName === 'West')!
      .matchUps!.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    expect(Object.hasOwn(landing, 'winningSide')).toBe(false);
    write(mode, drawId, source.matchUpId, { winningSide: 1 });
    expect(landing.drawPositions?.length).toBeGreaterThan(0);
    expect(Object.hasOwn(landing, 'winningSide')).toBe(false);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s a dual line-up notice marks its tournament before the unnamed group tally',
  (mode) => {
    const { drawId, matchUps, record } = fresh({
      drawSize: 4,
      drawType: ROUND_ROBIN,
      eventType: TEAM,
      tieFormatName: DOMINANT_DUO,
    });
    const dual = matchUps.find((m) => m.tieMatchUps?.length)!;
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTournamentIds!;
    vi.spyOn(provider, 'cycleModifiedTournamentIds').mockImplementation(() => {
      const ids = cycle();
      if (counter.active && ids?.size) observed.push([...ids]);
      return ids;
    });
    write(mode, drawId, dual.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(observed.at(-1)).toEqual([record.tournamentId, '*']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s a carry correction preserves raw notice interleaving and the landing reset key order',
  (mode) => {
    const { scenario } = prepareHeldCarryCorrection(
      { drawType: CURTIS_CONSOLATION, drawSize: 16, participantsCount: 11, eventType: 'SINGLES' },
      { name: 'default becomes walkover', previous: DEFAULTED, entered: WALKOVER },
      true,
    );
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const draw = record.events![0].drawDefinitions![0];
    const target = scenario.steps[0].target;
    const source = draw
      .structures!.find((s) => s.structureName === target.structureName)!
      .matchUps!.find((m) => m.roundNumber === target.roundNumber && m.roundPosition === target.roundPosition)!;
    const matches = getMatchUpsMap({ drawDefinition: draw }).drawMatchUps;
    const carried = matches.filter((m) =>
      Object.values(m.sideExitProvenance ?? {}).some((p) => p?.sourceMatchUpId === source.matchUpId),
    );
    const landing = carried.find((m) => m.matchUpStatus === DEFAULTED)!;
    const relay = carried.find((m) => m.matchUpStatus === 'BYE')!;
    expect(landing).toBeDefined();
    expect(relay).toBeDefined();
    const buffers: { topic: string; key?: string }[][] = [];
    const provider = getProvider();
    const clear = provider.deleteNotices;
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active) buffers.push(provider.getNoticeBuffer!().map(({ topic, key }) => ({ topic, key })));
      return clear();
    });
    setSubscriptions({
      subscriptions: { [MODIFY_MATCHUP]: () => undefined, [UPDATE_INCONTEXT_MATCHUP]: () => undefined },
    });
    write(mode, 'd', source.matchUpId, scenario.steps[0].outcome as object, scenario.steps[0].params);
    expect(buffers.at(-1)).toEqual([
      { topic: UPDATE_INCONTEXT_MATCHUP, key: source.matchUpId },
      { topic: MODIFY_MATCHUP, key: source.matchUpId },
      { topic: MODIFY_MATCHUP, key: relay.matchUpId },
      { topic: UPDATE_INCONTEXT_MATCHUP, key: landing.matchUpId },
      { topic: MODIFY_MATCHUP, key: landing.matchUpId },
    ]);
    expect(Object.keys(landing).indexOf('winningSide')).toBeGreaterThan(Object.keys(landing).indexOf('matchUpFormat'));
    expect(landing.score).toBe(toBePlayed.score);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s writes a manual dual override before ensuring its sides',
  (mode) => {
    const { drawId, matchUps } = fresh({ eventType: TEAM, tieFormatName: USTA_COLLEGE });
    const dual = matchUps.find((m) => m.tieMatchUps?.length && m.roundNumber === 1 && m.roundPosition === 1)!;
    delete dual.sides;
    write(mode, drawId, dual.matchUpId, { winningSide: 1 }, { disableAutoCalc: true });
    const keys = Object.keys(dual);
    expect(keys.indexOf('disableAutoCalc')).toBeGreaterThan(-1);
    expect(keys.indexOf('sides')).toBeGreaterThan(keys.indexOf('disableAutoCalc'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s removes the winning side explicitly when two produced defaults converge',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 16 });
    const first = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const second = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, first.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    write(mode, drawId, second.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(target.matchUpStatus).toBe(DOUBLE_DEFAULT);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s dissolves a default convergence with a separate unplayed score and retained format shape',
  (mode) => {
    const { drawId, matchUps } = fresh({ drawSize: 16 });
    const first = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const second = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
    const target = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, first.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    write(OUTCOME_PIPELINE_V1, drawId, second.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(Object.hasOwn(target, 'matchUpFormat')).toBe(false);
    write(mode, drawId, first.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(target.score).not.toBe(toBePlayed.score);
    expect(Object.keys(target.score!)).toEqual(['scoreStringSide1', 'scoreStringSide2', 'sets']);
    expect(Object.hasOwn(target, 'matchUpFormat')).toBe(false);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s re-derives an unchanged empty loser code array without retaining the reset anchor',
  (mode) => {
    const { drawId, record } = fresh({ drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures.find((s) => s.stage === MAIN)!.matchUps!.find((m) => m.roundNumber === 1)!;
    const target = structures.find((s) => s.stage === CONSOLATION)!.matchUps!.find((m) => m.roundNumber === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, { winningSide: 1 });
    target.matchUpStatusCodes = toBePlayed.matchUpStatusCodes;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(target.matchUpStatusCodes).toEqual([]);
    expect(target.matchUpStatusCodes).not.toBe(toBePlayed.matchUpStatusCodes);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s adds a carried schedule after its outcome keys and keeps its scored time',
  (mode) => {
    const { drawId, matchUps } = fresh();
    const source = matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    expect(Object.hasOwn(source, 'schedule')).toBe(false);
    write(mode, drawId, source.matchUpId, won(), { schedule: { scheduledDate: '2026-11-08' } });
    const keys = Object.keys(source);
    expect(keys.indexOf('schedule')).toBeGreaterThan(keys.indexOf('winningSide'));
    expect(source.schedule?.scheduledDate).toBe('2026-11-08');
    expect(source.schedule?.scoredTime).toBe('2026-11-08T12:00:00.000Z');
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clears quiet BYE recursion winner properties',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 16, participantsCount: 16 });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((s) => s.structureName === 'East')!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    const absent = structures.flatMap((s) =>
      (s.matchUps ?? [])
        .filter((m) => !Object.hasOwn(m, 'winningSide'))
        .map((m) => [m, `${s.structureName}|${m.roundNumber}|${m.roundPosition}`] as const),
    );
    write(mode, drawId, source.matchUpId, { matchUpStatus: TO_BE_PLAYED });
    expect(absent.filter(([m]) => Object.hasOwn(m, 'winningSide')).map(([, key]) => key)).toEqual([
      'East|2|1',
      'East|3|1',
      'East|4|1',
      'Northeast|1|1',
    ]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the side-number keys created before a carried dual ensures its sides',
  (mode) => {
    const { drawId, record } = fresh({
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      eventType: TEAM,
      tieFormatName: USTA_COLLEGE,
    });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((s) => s.stage === MAIN)!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const target = structures
      .find((s) => s.stage === CONSOLATION)!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    delete target.sides;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(target.sides).toHaveLength(2);
    for (const side of target.sides!) expect(Object.keys(side)[0]).toBe('sideNumber');
  },
);

it('a quiet withdrawal writes its own undefined winning side without an announced matchUp', () => {
  const matchUp = {
    matchUpId: 'quiet',
    matchUpStatus: BYE as typeof BYE,
    drawPositions: [1, 2],
    roundNumber: 1,
    roundPosition: 1,
  };
  const draw: any = {
    drawId: 'quiet-draw',
    structures: [
      {
        structureId: 'quiet-structure',
        structureType: 'ITEM',
        stage: MAIN,
        matchUps: [matchUp],
        positionAssignments: [
          { drawPosition: 1, bye: true },
          { drawPosition: 2, bye: true },
        ],
      },
    ],
  };
  const ops = unwindWalk({
    drawDefinition: draw,
    propagatesBye: true,
    inContextDrawMatchUps: [
      {
        ...matchUp,
        structureId: 'quiet-structure',
        drawId: 'quiet-draw',
        eventId: 'quiet-event',
        tournamentId: 'quiet-tournament',
      },
    ],
    seats: [{ structureId: 'quiet-structure', drawPosition: 1 }],
  });
  expect(ops).toBeDefined();
  expect(ops!.flat().filter((op) => op.op === 'stampUpdatedAt')).toEqual([]);
  expect(applyOutcomeOps(draw, ops!.flat())).toEqual({});
  expect(Object.hasOwn(matchUp, 'winningSide')).toBe(true);
  expect(Object.keys(matchUp).at(-1)).toBe('winningSide');
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s repeats the named line-up notice when a manual dual keeps value-equal sides',
  (mode) => {
    const { drawId, matchUps, record } = fresh({
      drawSize: 4,
      drawType: ROUND_ROBIN,
      eventType: TEAM,
      tieFormatName: DOMINANT_DUO,
    });
    const dual = matchUps.find((m) => m.tieMatchUps?.length)!;
    write(OUTCOME_PIPELINE_V1, drawId, dual.tieMatchUps![0].matchUpId, { winningSide: 1 });
    const before = structuredClone(dual.sides);
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTournamentIds!;
    vi.spyOn(provider, 'cycleModifiedTournamentIds').mockImplementation(() => {
      const ids = cycle();
      if (counter.active && ids?.size) observed.push([...ids]);
      return ids;
    });
    write(mode, drawId, dual.matchUpId, { winningSide: 1 }, { disableAutoCalc: true });
    expect(dual.sides).toEqual(before);
    expect(observed.at(-1)).toEqual([record.tournamentId, '*']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces its result before withdrawing directed positions',
  (mode) => {
    const { drawId, record } = fresh({ drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const source = record
      .events![0].drawDefinitions![0].structures!.find((s) => s.stage === MAIN)!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, { winningSide: 1 });
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const topics = cycle();
      if (counter.active && topics?.size) observed.push([...topics]);
      return topics;
    });
    setSubscriptions({ subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: () => undefined } });
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(observed.at(-1)?.slice(0, 3)).toEqual([UPDATE_INCONTEXT_MATCHUP, 'modifyDrawDefinition', MODIFY_MATCHUP]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s records an indirect winner withdrawal before the unwind score callback',
  (mode) => {
    const scenario = STANDALONE_INDIRECT_CLEARS.find(
      ([label]) => label === 'C10 standalone indirect clear: DOUBLE_DEFAULT/DOUBLE_DEFAULT/DEFAULTED/DEFAULTED',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    const id = findTarget(step.target);
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const topics = cycle();
      if (counter.active && topics?.size) observed.push([...topics]);
      return topics;
    });
    write(mode, 'd', id, step.outcome, step.params);
    expect(observed.at(-1)?.slice(0, 3)).toEqual(['modifyDrawDefinition', MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP]);
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const consolation = record.events![0].drawDefinitions![0].structures!.find(
      (structure) => structure.structureName === 'Consolation',
    )!;
    const retained = consolation.matchUps!.find((m) => m.roundNumber === 2 && m.roundPosition === 4)!;
    const released = consolation.matchUps!.find((m) => m.roundNumber === 3 && m.roundPosition === 2)!;
    expect(Object.keys(retained).indexOf('sideExitProvenance')).toBeGreaterThan(
      Object.keys(retained).indexOf('winningSide'),
    );
    expect(Object.keys(released).indexOf('winningSide')).toBeLessThan(Object.keys(released).indexOf('score'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s explicitly clears an untouched line winner when its double default undecides a dual',
  (mode) => {
    const { drawId, matchUps } = fresh({
      drawSize: 4,
      drawType: ROUND_ROBIN,
      eventType: TEAM,
      tieFormatName: DOMINANT_DUO,
    });
    const dual = matchUps.find((m) => m.tieMatchUps?.length)!;
    write(OUTCOME_PIPELINE_V1, drawId, dual.matchUpId, { winningSide: 1 });
    const line = dual.tieMatchUps![0];
    expect(Object.hasOwn(line, 'winningSide')).toBe(false);
    write(mode, drawId, line.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(line.matchUpStatus).toBe(DOUBLE_DEFAULT);
    expect(Object.hasOwn(line, 'winningSide')).toBe(true);
    expect(line.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces a BYE assignment on return before the later carried score callbacks',
  (mode) => {
    const scenario = HELD_BYE_REMOVALS.find(
      ([label]) => label === 'C21 FIRST_MATCH_LOSER_CONSOLATION 7/8 R1/2 side 1: DOUBLE_DEFAULT, policy off',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    const id = findTarget(step.target);
    const buffers: string[][] = [];
    const provider = getProvider();
    const clear = provider.deleteNotices;
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active) buffers.push(provider.getNoticeBuffer!().map(({ topic }) => topic));
      return clear();
    });
    write(mode, 'd', id, step.outcome, step.params);
    expect(buffers.at(-1)).toEqual([
      UPDATE_INCONTEXT_MATCHUP,
      MODIFY_MATCHUP,
      UPDATE_INCONTEXT_MATCHUP,
      MODIFY_MATCHUP,
      UPDATE_INCONTEXT_MATCHUP,
      MODIFY_MATCHUP,
      MODIFY_POSITION_ASSIGNMENTS,
      UPDATE_INCONTEXT_MATCHUP,
      MODIFY_MATCHUP,
      MODIFY_MATCHUP,
      UPDATE_INCONTEXT_MATCHUP,
      MODIFY_DRAW_DEFINITION,
      MODIFY_MATCHUP,
    ]);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces a fresh line before the dual withdrawal it causes',
  (mode) => {
    const { drawId, record } = fresh({
      drawSize: 8,
      participantsCount: 3,
      drawType: COMPASS,
      eventType: TEAM,
      tieFormatName: USTA_COLLEGE,
    });
    const dual = record
      .events![0].drawDefinitions![0].structures!.find((s) => s.structureName === 'East')!
      .matchUps!.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, dual.matchUpId, { winningSide: 1 });
    const line = dual.tieMatchUps!.find((m) => m.matchUpType === SINGLES)!;
    const observed: string[][] = [];
    const provider = getProvider();
    const buffers: { topic: string; key?: string }[][] = [];
    const clear = provider.deleteNotices;
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active) buffers.push(provider.getNoticeBuffer!().map(({ topic, key }) => ({ topic, key })));
      return clear();
    });
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const topics = cycle();
      if (counter.active && topics?.size) observed.push([...topics]);
      return topics;
    });
    setSubscriptions({
      subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: () => undefined, [MODIFY_MATCHUP]: () => undefined },
    });
    write(mode, drawId, line.matchUpId, won());
    expect(Object.hasOwn(dual, 'tieFormatId')).toBe(false);
    expect(observed.at(-1)?.[0]).toBe(UPDATE_INCONTEXT_MATCHUP);
    const buffer = buffers.at(-1)!;
    const lineCallback = buffer.findIndex((n) => n.topic === UPDATE_INCONTEXT_MATCHUP && n.key === line.matchUpId);
    const otherModifications = buffer.flatMap((n, index) =>
      n.topic === MODIFY_MATCHUP && n.key !== line.matchUpId && n.key !== dual.matchUpId ? [index] : [],
    );
    expect(otherModifications.length).toBeGreaterThan(0);
    expect(lineCallback).toBeGreaterThan(Math.max(...otherModifications));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clears the old loser assignment before placing the propagated BYE',
  (mode) => {
    const { drawId, record } = fresh({ drawType: FIRST_MATCH_LOSER_CONSOLATION });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((s) => s.stage === MAIN)!
      .matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, { winningSide: 1 });
    const assignment = structures
      .find((s) => s.stage === CONSOLATION)!
      .positionAssignments!.find((a) => a.participantId)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(assignment.bye).toBe(true);
    expect(assignment.participantId).toBeUndefined();
    expect(Object.keys(assignment)).toEqual(['drawPosition', 'bye', 'participantId', 'byeFromPropagation']);
  },
);

it('a BYE placement preserves existing assignment and winner property positions', () => {
  const matchUp = {
    matchUpId: 'placement',
    matchUpStatus: DEFAULTED as typeof DEFAULTED,
    winningSide: 1 as const,
    schedule: {},
    drawPositions: [1, 2],
  };
  const assignment = { drawPosition: 1, participantId: 'displaced' };
  const draw: any = {
    drawId: 'placement-draw',
    structures: [{ structureId: 'placement-structure', matchUps: [matchUp], positionAssignments: [assignment] }],
  };
  const result = applyOutcomeOps(draw, [
    {
      op: 'assignBye',
      structureId: 'placement-structure',
      matchUpId: 'placement',
      drawPosition: 1,
      byeFromPropagation: true,
    },
    { op: 'setMatchUpBye', matchUpId: 'placement' },
  ]);
  expect(result).toEqual({});
  expect(Object.keys(assignment)).toEqual(['drawPosition', 'participantId', 'bye', 'byeFromPropagation']);
  expect(Object.keys(matchUp).indexOf('winningSide')).toBeLessThan(Object.keys(matchUp).indexOf('schedule'));
  expect(matchUp.winningSide).toBeUndefined();
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s clears the prior carrier before seating the BYEs a carried convergence produces',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 16 }, {}, 4242);
    const structures = record.events![0].drawDefinitions![0].structures!;
    const east = structures.find((s) => s.structureName === 'East')!;
    const first = east.matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
    const second = east.matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 2)!;
    write(
      OUTCOME_PIPELINE_V1,
      drawId,
      first.matchUpId,
      { matchUpStatus: DEFAULTED, winningSide: 1 },
      { propagateExitStatus: true },
    );
    write(mode, drawId, second.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    for (const name of ['South', 'Southeast']) {
      const structure = structures.find((s) => s.structureName === name)!;
      const matchUp = structure.matchUps!.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
      const assignment = structure.positionAssignments!.find((a) => a.drawPosition === 1)!;
      expect(Object.keys(assignment)).toEqual(['drawPosition', 'bye', 'participantId', 'byeFromPropagation']);
      expect(Object.keys(matchUp).indexOf('winningSide')).toBeGreaterThan(Object.keys(matchUp).indexOf('schedule'));
      expect(Object.keys(matchUp).indexOf('winningSide')).toBeGreaterThan(Object.keys(matchUp).indexOf('score'));
    }
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces a recursive BYE chain from the deepest child back to its parent',
  (mode) => {
    const { sources } = assignmentViewFixture(COMPASS, SINGLES, true);
    setSubscriptions({ subscriptions: { [MODIFY_POSITION_ASSIGNMENTS]: () => undefined } });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const structures = record.events![0].drawDefinitions![0].structures!;
    const names = new Map(structures.map((structure) => [structure.structureId, structure.structureName]));
    const buffers: string[][] = [];
    const provider = getProvider();
    const clear = provider.deleteNotices;
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active)
        buffers.push(
          provider.getNoticeBuffer!().flatMap(({ topic, key }) =>
            topic === MODIFY_POSITION_ASSIGNMENTS ? [names.get(key!)!] : [],
          ),
        );
      return clear();
    });
    write(mode, 'd', sources[0].matchUpId, { matchUpStatus: DOUBLE_DEFAULT }, { allowChangePropagation: true });
    expect(buffers.at(-1)).toEqual(['Northwest', 'North']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_DIFFERENTIAL] as const)(
  '%s stamps a structure announced by a recursive withdrawal at the current call time',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 16, participantsCount: 15 }, {}, 9000230);
    const structures = record.events![0].drawDefinitions![0].structures!;
    const east = structures.find((structure) => structure.structureName === 'East')!;
    const second = east.matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 2)!;
    write(OUTCOME_PIPELINE_V1, drawId, second.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    const current = '2026-11-08T12:01:00.000Z';
    setClock(current);
    setOutcomePipeline(mode);
    const result = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: second.matchUpId,
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    });
    expect(result).toMatchObject({ success: true });
    expect(structures.find((structure) => structure.structureName === 'Northwest')!.updatedAt).toBe(current);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the own undefined qualifierRemoved field for an unlinked qualifying final',
  (mode) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    const generated = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 40 },
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
      nonRandom: 42,
    });
    const drawId = generated.drawIds![0];
    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const main = drawDefinition.structures.find((structure) => structure.stage === MAIN)!;
    const entered = new Set(event.entries.map((entry) => entry.participantId));
    const qualifyingIds = tournamentEngine
      .getParticipants()
      .participants.filter((participant) => !entered.has(participant.participantId))
      .slice(0, 4)
      .map((participant) => participant.participantId);
    expect(
      tournamentEngine.addEventEntries({
        eventId: event.eventId,
        drawId,
        entryStage: QUALIFYING,
        participantIds: qualifyingIds,
      }).success,
    ).toBe(true);
    const { structure, link } = tournamentEngine.generateQualifyingStructure({
      targetStructureId: main.structureId,
      qualifyingPositions: 2,
      drawSize: 4,
      drawId,
    });
    expect(
      tournamentEngine.attachQualifyingStructure({
        link: { ...link, source: { ...link.source, roundNumber: 2 } },
        structure,
        drawId,
      }).success,
    ).toBe(true);
    expect(tournamentEngine.automatedPositioning({ structureId: structure.structureId, drawId }).success).toBe(true);
    const source = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((matchUp) => matchUp.structureId === structure.structureId && matchUp.finishingRound === 1)!;
    write(OUTCOME_PIPELINE_V1, drawId, source.matchUpId, won());
    const result = write(mode, drawId, source.matchUpId, toBePlayed, {
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { autoRemoveQualifiers: true } },
    });
    expect(Object.keys(result)).toEqual(['success', 'connectedStructures', 'qualifierRemoved']);
    expect(Object.hasOwn(result, 'qualifierRemoved')).toBe(true);
    expect(result.qualifierRemoved).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces an own BYE seat placed by the recursion after its deeper child',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 16 });
    const structures = record.events![0].drawDefinitions![0].structures!;
    const east = structures.find((structure) => structure.structureName === 'East')!;
    const first = east.matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1)!;
    const second = east.matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 2)!;
    write(OUTCOME_PIPELINE_V1, drawId, first.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    const names = new Map(structures.map((structure) => [structure.structureId, structure.structureName]));
    const buffers: string[][] = [];
    const provider = getProvider();
    const clear = provider.deleteNotices;
    setSubscriptions({ subscriptions: { [MODIFY_POSITION_ASSIGNMENTS]: () => undefined } });
    vi.spyOn(provider, 'deleteNotices').mockImplementation(() => {
      if (counter.active)
        buffers.push(
          provider.getNoticeBuffer!().flatMap(({ topic, key }) =>
            topic === MODIFY_POSITION_ASSIGNMENTS ? [names.get(key!)!] : [],
          ),
        );
      return clear();
    });
    write(mode, drawId, second.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(buffers.at(-1)).toEqual(['Southwest', 'West', 'Northeast']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the own undefined tieFormatId from the initial empty dual tally',
  (mode) => {
    const { drawId, matchUps } = fresh({
      drawType: ROUND_ROBIN,
      eventType: TEAM,
      drawSize: 8,
      tieFormatName: DOMINANT_DUO,
    });
    const dual = matchUps.find((matchUp) => matchUp.tieMatchUps?.length && matchUp.matchUpStatus === TO_BE_PLAYED)!;
    write(OUTCOME_PIPELINE_V1, drawId, dual.matchUpId, { winningSide: 1 });
    const line = dual.tieMatchUps![0];
    write(mode, drawId, line.matchUpId, { winningSide: 1 });
    expect(Object.hasOwn(dual, 'tieFormatId')).toBe(true);
    expect(dual.tieFormatId).toBeUndefined();
    expect(dual.tieFormat).toBeDefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s gives a carried loser onward placement an own undefined winner',
  (mode) => {
    const { drawId, record } = fresh(
      { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 14 },
      {},
      20833621,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const main = structures.find((structure) => structure.structureName === 'Main')!;
    const at = (roundNumber: number, roundPosition: number) =>
      main.matchUps!.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition)!;
    const setup = [
      [1, 7, { matchUpStatus: DOUBLE_DEFAULT }],
      [1, 3, { winningSide: 1 }],
      [1, 2, { matchUpStatus: WALKOVER, winningSide: 2 }],
      [1, 6, { winningSide: 1 }],
      [1, 5, { winningSide: 1 }],
      [2, 3, { winningSide: 2 }],
      [2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      [3, 2, { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ] as const;
    for (const [round, position, outcome] of setup)
      write(OUTCOME_PIPELINE_V1, drawId, at(round, position).matchUpId, outcome, { propagateExitStatus: true });
    write(mode, drawId, at(1, 4).matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true });
    const target = structures
      .find((structure) => structure.structureName === 'Consolation')!
      .matchUps!.find((matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 2)!;
    expect(target.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s places a carrier beyond a BYE before the exit writer inserts its winner key',
  (mode) => {
    const { drawId, record } = fresh({ drawType: COMPASS, drawSize: 32, participantsCount: 30 }, {}, 20715025);
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((structure) => structure.structureName === 'East')!
      .matchUps!.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 12)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    const target = structures
      .find((structure) => structure.structureName === 'Southeast')!
      .matchUps!.find((matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(target.winningSide).toBe(1);
    expect(Object.keys(target).indexOf('winningSide')).toBeGreaterThan(
      Object.keys(target).indexOf('matchUpStatusCodes'),
    );
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s keeps the format identifier absent when the initial line tally already holds an exit status',
  (mode) => {
    const { drawId, matchUps } = fresh({
      drawType: ROUND_ROBIN,
      eventType: TEAM,
      drawSize: 8,
      tieFormatName: DOMINANT_DUO,
    });
    const dual = matchUps.find((matchUp) => matchUp.tieMatchUps?.length && matchUp.matchUpStatus === TO_BE_PLAYED)!;
    write(OUTCOME_PIPELINE_V1, drawId, dual.matchUpId, { winningSide: 1 });
    write(mode, drawId, dual.tieMatchUps![0].matchUpId, { winningSide: 1, matchUpStatus: DEFAULTED });
    expect(Object.hasOwn(dual, 'tieFormatId')).toBe(false);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the unnamed placement before a later BYE supersedes its notice',
  (mode) => {
    const { drawId, record, matchUps } = fresh(
      { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 32 },
      PRODUCED_EXIT_POLICY,
    );
    const source = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1)!;
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTournamentIds!;
    vi.spyOn(provider, 'cycleModifiedTournamentIds').mockImplementation(() => {
      const ids = cycle();
      if (counter.active && ids?.size) observed.push([...ids]);
      return ids;
    });
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    expect(observed.at(-1)).toEqual([record.tournamentId, '*']);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces the winner withdrawal before resetting the produced relay',
  (mode) => {
    const scenario = CONVERGED_PRODUCED_RELAYS.find(
      ([label]) => label === 'produced relay convergence: DOUBLE_DEFAULT/DEFAULTED/DOUBLE_DEFAULT/cleared',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    const source = findTarget(step.target);
    const observed: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const topics = cycle();
      if (counter.active && topics?.size) observed.push([...topics]);
      return topics;
    });
    setSubscriptions({
      subscriptions: { [UPDATE_INCONTEXT_MATCHUP]: () => undefined, [MODIFY_MATCHUP]: () => undefined },
    });
    write(mode, 'd', source, step.outcome, step.params);
    expect(observed.at(-1)?.[0]).toBe(MODIFY_DRAW_DEFINITION);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s normalizes the earlier BYE winner key when withdrawing a later held seat',
  (mode) => {
    const { drawId, record } = fresh(
      { drawId: 'd', drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 32, participantsCount: 27 },
      {},
      20715466,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const at = (name: string, round: number, position: number) =>
      structures
        .find((entry) => entry.structureName === name)!
        .matchUps!.find((entry) => entry.roundNumber === round && entry.roundPosition === position)!;
    const params = { propagateExitStatus: true, allowChangePropagation: true };
    write(OUTCOME_PIPELINE_V1, drawId, at('Main', 1, 6).matchUpId, { matchUpStatus: DOUBLE_DEFAULT }, params);
    write(mode, drawId, at('Main', 1, 6).matchUpId, { matchUpStatus: TO_BE_PLAYED }, params);
    const target = at('Consolation', 1, 3);
    expect(target.matchUpStatus).toBe(BYE);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s removes the winner key from a pending foreign product relayed through a BYE',
  (mode) => {
    const fixture = readFileSync(
      new URL('../../fixtures/exitPropagation/censusF2RefusalSchedules20261011.jsonl', import.meta.url),
      'utf8',
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((entry) => entry.seed === 20523724)!;
    let prepared: Tournament | undefined;
    let sourceId: string | undefined;
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    counter.prepare = (params) => {
      if (prepared || params.matchUpStatus !== TO_BE_PLAYED) return;
      const record = params.tournamentRecord as Tournament | undefined;
      const draw = record?.events
        ?.flatMap((event) => event.drawDefinitions ?? [])
        .find((entry) => entry.drawId === params.drawDefinition?.drawId);
      const structure = draw?.structures?.find((entry) => entry.structureName === 'Consolation');
      const at = (round: number, position: number) =>
        structure?.matchUps?.find((entry) => entry.roundNumber === round && entry.roundPosition === position);
      const source = at(2, 1);
      if (
        !source ||
        source.matchUpId !== params.matchUpId ||
        at(2, 2)?.matchUpStatus !== BYE ||
        at(3, 1)?.matchUpStatus !== DOUBLE_WALKOVER
      )
        return;
      prepared = structuredClone(record!);
      sourceId = source.matchUpId;
    };
    try {
      prepareCensus(fixture.config, fixture.steps, 'pending-native-witness');
    } finally {
      counter.prepare = undefined;
    }
    expect(prepared).toBeDefined();
    tournamentEngine.setState(prepared!);
    write(mode, 'pending-native-witness', sourceId!, { matchUpStatus: TO_BE_PLAYED }, { propagateExitStatus: true });
    const draw = (Object.values(getTournamentRecords())[0] as Tournament).events![0].drawDefinitions![0];
    const target = draw
      .structures!.find((entry) => entry.structureName === 'Consolation')!
      .matchUps!.find((entry) => entry.roundNumber === 3 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(WALKOVER);
    expect(Object.hasOwn(target, 'winningSide')).toBe(false);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces the loser assignment after the arrival finishes advancing',
  (mode) => {
    const { drawId, record } = fresh({ drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawSize: 16 });
    const main = record.events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Main')!;
    const at = (position: number) =>
      main.matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === position)!;
    write(
      OUTCOME_PIPELINE_V1,
      drawId,
      at(1).matchUpId,
      { matchUpStatus: DOUBLE_DEFAULT },
      { propagateExitStatus: true },
    );
    const topics = observeNoticeTopics();
    const outcome = generateOutcomeFromScoreString({
      scoreString: '6-1 6-1',
      winningSide: 1,
      matchUpFormat: 'SET3-S:6/TB7',
    }).outcome;
    write(mode, drawId, at(2).matchUpId, outcome!, { propagateExitStatus: true });
    expect(topics.at(-1)).toBe(MODIFY_POSITION_ASSIGNMENTS);
  },
);

it.each(
  ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).flatMap((mode) =>
    [3, 4].map((round) => [mode, round] as const),
  ),
)('%s removes the round %s winner key when a foreign produced relay remains', (mode, round) => {
  const scenario = CONVERGED_PRODUCED_RELAYS.find(
    ([label]) => label === 'produced relay convergence: DOUBLE_DEFAULT/DEFAULTED/DOUBLE_DEFAULT/cleared',
  )![1];
  prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
  const step = scenario.steps[0];
  write(mode, 'd', findTarget(step.target), step.outcome, step.params);
  const record = Object.values(getTournamentRecords())[0] as Tournament;
  const structure = record.events![0].drawDefinitions![0].structures!.find(
    (entry) => entry.structureName === 'Consolation',
  )!;
  const at = (round: number) =>
    structure.matchUps!.find((entry) => entry.roundNumber === round && entry.roundPosition === 1)!;
  expect(at(round).matchUpStatus).toBe(round === 3 ? DEFAULTED : TO_BE_PLAYED);
  expect(Object.hasOwn(at(round), 'winningSide')).toBe(false);
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s restores the retained carrier provenance before replaying its winner',
  (mode) => {
    const scenario = CONVERGED_PRODUCED_RELAYS.find(
      ([label]) => label === 'produced relay convergence: DOUBLE_DEFAULT/DEFAULTED/DOUBLE_DEFAULT/cleared',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const target = record
      .events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Consolation')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 2)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(target.winningSide).toBe(1);
    const keys = Object.keys(target);
    expect(keys.indexOf('matchUpFormat')).toBeLessThan(keys.indexOf('sideExitProvenance'));
    expect(keys.indexOf('winningSide')).toBeGreaterThan(keys.indexOf('sideExitProvenance'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s ensures the BYE relay team sides before recording the carried exit',
  (mode) => {
    const { drawId, record } = fresh(
      { drawType: COMPASS, drawSize: 8, participantsCount: 5, eventType: TEAM, tieFormatName: DOMINANT_DUO },
      {},
      200203,
      false,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((entry) => entry.structureName === 'East')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 2)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    const target = structures
      .find((entry) => entry.structureName === 'West')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(BYE);
    expect(target.sides).toHaveLength(2);
    expect(target.sideExitProvenance).toBeDefined();
    const keys = Object.keys(target);
    expect(keys.indexOf('sides')).toBeLessThan(keys.indexOf('sideExitProvenance'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces the BYE removal before its assignment returns',
  (mode) => {
    const { drawId } = fresh({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 15 }, {}, 59);
    prepareForward({ drawId, propagateExitStatus: true, exitOutcome: { matchUpStatus: DOUBLE_WALKOVER }, maxSteps: 6 });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const source = record
      .events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Main')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 4)!;
    expect(source.matchUpStatus).toBe(DOUBLE_WALKOVER);
    const topics: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const written = cycle();
      if (counter.active && written?.size) topics.push([...written]);
      return written;
    });
    write(mode, drawId, source.matchUpId, { ...toBePlayed, winningSide: undefined });
    expect(topics.at(-1)?.[0]).toBe(MODIFY_DRAW_DEFINITION);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the assignment before settling the carried convergence',
  (mode) => {
    const scenario = STANDALONE_CARRIED_CONVERGENCES.find(
      ([label]) =>
        label === 'C12 standalone carried convergence: DOUBLE_DEFAULT/DOUBLE_DEFAULT/DEFAULTED/DEFAULTED/1/DEFAULTED',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    const topics = observeNoticeTopics();
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    expect(topics.at(-1)).toBe(MODIFY_MATCHUP);
  },
);

it.each(
  ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).flatMap((mode) => [
    { mode, seed: 20490105, source: ['Main', 2, 3] as const, landing: ['Backdraw', 3, 2] as const },
    { mode, seed: 20496362, source: ['East', 2, 4] as const, landing: ['North', 2, 1] as const },
  ]),
)(
  '$mode retains the own undefined winner after releasing the carrier, seed $seed',
  ({ mode, seed, source: origin, landing }) => {
    const fixture = readFileSync(
      new URL('../../fixtures/exitPropagation/censusF2RefusalSchedules20261011.jsonl', import.meta.url),
      'utf8',
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((entry) => entry.seed === seed)!;
    const drawId = `released-carrier-${seed}`;
    let prepared: Tournament | undefined;
    let sourceId: string | undefined;
    counter.prepare = (params) => {
      if (prepared || params.matchUpStatus !== TO_BE_PLAYED || !params.tournamentRecord) return;
      const draw = params.drawDefinition;
      const source = draw?.structures
        ?.find((entry: any) => entry.structureName === origin[0])
        ?.matchUps?.find((entry: any) => entry.roundNumber === origin[1] && entry.roundPosition === origin[2]);
      const target = draw?.structures
        ?.find((entry: any) => entry.structureName === landing[0])
        ?.matchUps?.find((entry: any) => entry.roundNumber === landing[1] && entry.roundPosition === landing[2]);
      if (
        !source ||
        source.matchUpId !== params.matchUpId ||
        target?.matchUpStatus !== DEFAULTED ||
        target.winningSide !== 1
      )
        return;
      prepared = structuredClone(params.tournamentRecord);
      sourceId = source.matchUpId;
    };
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    try {
      prepareCensus(fixture.config, fixture.steps, drawId);
    } finally {
      counter.prepare = undefined;
    }
    expect(prepared).toBeDefined();
    tournamentEngine.setState(prepared!);
    write(mode, drawId, sourceId!, { ...toBePlayed, winningSide: undefined });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const target = record
      .events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === landing[0])!
      .matchUps!.find((entry) => entry.roundNumber === landing[1] && entry.roundPosition === landing[2])!;
    expect(target.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s finishes the deciding line assignment before carrying the losing team lineup',
  (mode) => {
    fresh({
      drawId: 'd',
      drawType: COMPASS,
      drawSize: 8,
      participantsCount: 5,
      eventType: TEAM,
      tieFormatName: USTA_COLLEGE,
    });
    const target = { structureName: 'East', roundNumber: 1, roundPosition: 3 };
    const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome!;
    for (const singlesLine of [0, 1, 2])
      write(OUTCOME_PIPELINE_V1, 'd', findTarget({ ...target, singlesLine }), outcome);
    const topics = observeNoticeTopics();
    write(mode, 'd', findTarget({ ...target, singlesLine: 3 }), outcome);
    expect(topics.at(-2)).toBe(MODIFY_POSITION_ASSIGNMENTS);
    expect(topics.at(-1)).toBe(MODIFY_MATCHUP);
  },
);

it.each(
  ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).flatMap((mode) =>
    ['first', 'last'].map((boundary) => [mode, boundary] as const),
  ),
)('%s keeps the %s terminal relay notice boundary', (mode, boundary) => {
  const scenario = TERMINAL_RELAY_CAPTURES.find(
    ([label]) => label === 'terminal direct relay: DEFAULTED/DOUBLE_DEFAULT/DOUBLE_DEFAULT/winner1',
  )![1];
  prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
  const step = scenario.steps[0];
  const topics = observeNoticeTopics(true);
  write(mode, 'd', findTarget(step.target), step.outcome, step.params);
  const actual = boundary === 'first' ? topics[0] : topics.filter((topic) => topic !== MODIFY_DRAW_DEFINITION).at(-1);
  expect(actual).toBe(boundary === 'first' ? MODIFY_DRAW_DEFINITION : MODIFY_POSITION_ASSIGNMENTS);
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s creates the onward BYE score key before resetting the produced result',
  (mode) => {
    const { drawId, record } = fresh(
      { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 13 },
      {},
      180,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const main = structures.find((entry) => entry.structureName === 'Main')!;
    for (const position of [2, 3, 4]) {
      const source = main.matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === position)!;
      write(
        OUTCOME_PIPELINE_V1,
        drawId,
        source.matchUpId,
        position === 2 ? { matchUpStatus: DOUBLE_DEFAULT } : { winningSide: 1 },
      );
    }
    const consolation = structures.find((entry) => entry.structureName === 'Consolation')!;
    const source = consolation.matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 2)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
    const target = consolation.matchUps!.find((entry) => entry.roundNumber === 4 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    const keys = Object.keys(target);
    expect(keys).toContain('score');
    expect(keys.indexOf('score')).toBeLessThan(keys.indexOf('matchUpStatusCodes'));
  },
);

it.each(
  ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).flatMap((mode) =>
    [false, true].map((custom) => [mode, custom] as const),
  ),
)('%s deletes the empty initial dual score before recreating the final tally, custom=%s', (mode, custom) => {
  const { drawId, matchUps, record } = fresh({
    drawType: ROUND_ROBIN,
    eventType: TEAM,
    drawSize: 8,
    tieFormatName: DOMINANT_DUO,
  });
  const dual = matchUps.find((entry) => entry.tieMatchUps?.length && entry.matchUpStatus === TO_BE_PLAYED)!;
  write(OUTCOME_PIPELINE_V1, drawId, dual.matchUpId, {
    matchUpStatus: RETIRED,
    winningSide: 1,
    score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
  });
  if (custom) dual.tieFormat = { ...record.events![0].tieFormat!, tieFormatName: 'retained custom dual format' };
  write(mode, drawId, dual.tieMatchUps![0].matchUpId, { winningSide: 1 });
  expect(dual.score?.scoreStringSide1).toBe('1-0');
  expect(Object.hasOwn(dual, 'tieFormatId')).toBe(!custom);
  const keys = Object.keys(dual);
  expect(keys.indexOf('score')).toBeGreaterThan(keys.indexOf(custom ? 'tieFormat' : 'tieFormatId'));
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s restamps the occupied-final carrier before replaying its result',
  (mode) => {
    const scenario = OCCUPIED_FINAL_RELAY_CAPTURES.find(
      ([label]) => label === 'occupied final relay: DEFAULTED/DOUBLE_DEFAULT/DOUBLE_DEFAULT/clear',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const target = record
      .events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Consolation')!
      .matchUps!.find((entry) => entry.roundNumber === 3 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    const keys = Object.keys(target);
    expect(keys.indexOf('matchUpFormat')).toBeLessThan(keys.indexOf('sideExitProvenance'));
    expect(keys.indexOf('winningSide')).toBeGreaterThan(keys.indexOf('sideExitProvenance'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the pending award winner key position during removal',
  (mode) => {
    const scenario = INDIRECT_COMPOUND_CLEARS.find(
      ([label]) => label === 'indirect compound clear: DOUBLE_DEFAULT/DOUBLE_DEFAULT/DOUBLE_DEFAULT',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const target = record
      .events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Main')!
      .matchUps!.find((entry) => entry.roundNumber === 3 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
    const keys = Object.keys(target);
    expect(keys.indexOf('winningSide')).toBeLessThan(keys.indexOf('matchUpStatusCodes'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the nested carrier assignment before recording its BYE relay',
  (mode) => {
    const { drawId } = fresh({ drawType: COMPASS, drawSize: 16, participantsCount: 11, eventType: DOUBLES });
    const matches = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
    const source = matches.find(
      (entry) => entry.roundNumber === 1 && entry.sides?.filter((side) => side.participantId).length === 2,
    )!;
    const played = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome!;
    for (const matchUp of matches.filter(
      (entry) =>
        entry.structureId === source.structureId &&
        entry.roundNumber === 1 &&
        entry.sides?.filter((side) => side.participantId).length === 2,
    )) {
      write(OUTCOME_PIPELINE_V1, drawId, matchUp.matchUpId, played, { propagateExitStatus: false });
    }
    write(OUTCOME_PIPELINE_V1, drawId, source.winnerMatchUpId!, played, { propagateExitStatus: false });
    const topics = observeNoticeTopics();
    write(
      mode,
      drawId,
      source.matchUpId,
      { matchUpStatus: DEFAULTED, winningSide: 1 },
      { propagateExitStatus: true, allowChangePropagation: true },
    );
    expect(topics.at(-1)).toBe(MODIFY_MATCHUP);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces the deepest result removal before withdrawing its losing seat',
  (mode) => {
    const fixture = readFileSync(
      new URL('../../fixtures/exitPropagation/censusF2RefusalSchedules20261011.jsonl', import.meta.url),
      'utf8',
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((entry) => entry.seed === 20482909)!;
    const drawId = 'deepest-removal';
    let prepared: Tournament | undefined;
    let sourceId: string | undefined;
    counter.prepare = (params) => {
      if (prepared || params.matchUpStatus !== DEFAULTED || params.winningSide !== 1) return;
      const source = params.drawDefinition?.structures
        ?.find((entry: any) => entry.structureName === 'Main')
        ?.matchUps?.find((entry: any) => entry.roundNumber === 1 && entry.roundPosition === 2);
      if (source?.matchUpId !== params.matchUpId || source?.matchUpStatus !== DOUBLE_WALKOVER) return;
      prepared = structuredClone(params.tournamentRecord);
      sourceId = source.matchUpId;
    };
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    try {
      prepareCensus(fixture.config, fixture.steps, drawId);
    } finally {
      counter.prepare = undefined;
    }
    expect(prepared).toBeDefined();
    tournamentEngine.setState(prepared!);
    const topics: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const written = cycle();
      if (counter.active && written?.size) topics.push([...written]);
      return written;
    });
    write(mode, drawId, sourceId!, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    expect(topics.at(-1)?.[0]).toBe(MODIFY_DRAW_DEFINITION);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the pending winner key on the BYE that receives a produced exit',
  (mode) => {
    const { drawId, record } = fresh({
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      drawSize: 16,
      outcomes: [
        ...[
          [1, 2],
          [3, 4],
          [5, 6],
          [7, 8],
        ].map((drawPositions) => ({
          drawPositions,
          scoreString: '6-1 6-2',
          winningSide: 1,
        })),
        { stage: CONSOLATION, scoreString: '6-1 6-2', winningSide: 1 },
      ],
    });
    const consolation = record.events![0].drawDefinitions![0].structures!.find(
      (entry) => entry.structureName === 'Consolation',
    )!;
    const source = consolation.matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 2)!;
    const target = consolation.matchUps!.find((entry) => entry.roundNumber === 2 && entry.roundPosition === 2)!;
    write(mode, drawId, source.matchUpId, { matchUpStatus: DOUBLE_WALKOVER });
    expect(target.matchUpStatus).toBe(BYE);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the standing BYE structure assignment only for the seat actually cleared',
  (mode) => {
    const scenario = STANDING_BYE_CAPTURES.find(
      ([label]) => label === 'CURTIS standing BYE: DOUBLE_DEFAULT/DOUBLE_DEFAULT/clear',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const structure = record.events![0].drawDefinitions![0].structures!.find(
      (entry) => entry.structureName === 'Consolation 2',
    )!;
    const provider = getProvider();
    const add = provider.addNotice;
    let returns = 0;
    vi.spyOn(provider, 'addNotice').mockImplementation((notice, ...args) => {
      const { topic, key } = notice as { topic: string; key?: string };
      if (counter.active && topic === MODIFY_POSITION_ASSIGNMENTS && key === structure.structureId) returns++;
      return add(notice, ...args);
    });
    setSubscriptions({ subscriptions: { [MODIFY_POSITION_ASSIGNMENTS]: () => undefined } });
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    expect(returns).toBe(1);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the carrier assignment before announcing its BYE provenance',
  (mode) => {
    const scenario = NOTICE_RELAY_CARRIES[0][1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const structure = record.events![0].drawDefinitions![0].structures!.find(
      (entry) => entry.structureName === 'Consolation',
    )!;
    const relay = structure.matchUps!.find((entry) => entry.roundNumber === 2 && entry.roundPosition === 2)!;
    const provider = getProvider();
    const add = provider.addNotice;
    const topics: string[] = [];
    vi.spyOn(provider, 'addNotice').mockImplementation((notice, ...args) => {
      const { topic, key } = notice as { topic: string; key?: string };
      if (
        counter.active &&
        ((topic === MODIFY_POSITION_ASSIGNMENTS && key === structure.structureId) ||
          (topic === MODIFY_MATCHUP && key === relay.matchUpId))
      )
        topics.push(topic);
      return add(notice, ...args);
    });
    setSubscriptions({
      subscriptions: { [MODIFY_POSITION_ASSIGNMENTS]: () => undefined, [MODIFY_MATCHUP]: () => undefined },
    });
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    expect(topics.at(-2)).toBe(MODIFY_POSITION_ASSIGNMENTS);
    expect(topics.at(-1)).toBe(MODIFY_MATCHUP);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s retains the released carrier winner key before its existing codes',
  (mode) => {
    const { drawId, record } = fresh(
      { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawSize: 16, participantsCount: 14 },
      {},
      20660398,
    );
    const structures = record.events![0].drawDefinitions![0].structures!;
    const main = structures.find((entry) => entry.structureName === 'Main')!;
    const at = (position: number) =>
      main.matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === position)!;
    for (const position of [5, 4, 6, 7])
      write(
        OUTCOME_PIPELINE_V1,
        drawId,
        at(position).matchUpId,
        position === 6 ? { matchUpStatus: DEFAULTED, winningSide: 1 } : { matchUpStatus: DOUBLE_WALKOVER },
        { propagateExitStatus: true },
      );
    write(mode, drawId, at(5).matchUpId, { winningSide: 2 }, { propagateExitStatus: true });
    const target = structures
      .find((entry) => entry.structureName === 'Consolation')!
      .matchUps!.find((entry) => entry.roundNumber === 3 && entry.roundPosition === 2)!;
    expect(target.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
    const keys = Object.keys(target);
    expect(keys.indexOf('winningSide')).toBeLessThan(keys.indexOf('matchUpStatusCodes'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s announces the earlier BYE withdrawal before a later segment supersedes its position notice',
  (mode) => {
    const { drawId, record } = fresh(
      { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 6 },
      {},
      20576342,
    );
    const main = record.events![0].drawDefinitions![0].structures!.find((entry) => entry.structureName === 'Main')!;
    const at = (round: number, position: number) =>
      main.matchUps!.find((entry) => entry.roundNumber === round && entry.roundPosition === position)!.matchUpId;
    for (const [id, outcome] of [
      [at(1, 3), { matchUpStatus: WALKOVER, winningSide: 2 }],
      [at(1, 2), { matchUpStatus: DOUBLE_DEFAULT }],
      [at(2, 2), { matchUpStatus: DOUBLE_WALKOVER }],
      [at(1, 3), { winningSide: 2 }],
    ] as const)
      write(OUTCOME_PIPELINE_V1, drawId, id, outcome, { propagateExitStatus: true });
    const topics: string[][] = [];
    const provider = getProvider();
    const cycle = provider.cycleModifiedTopics!;
    vi.spyOn(provider, 'cycleModifiedTopics').mockImplementation(() => {
      const written = cycle();
      if (counter.active && written?.size) topics.push([...written]);
      return written;
    });
    write(mode, drawId, at(2, 2), { matchUpStatus: WALKOVER, winningSide: 1 }, { propagateExitStatus: true });
    expect(topics.at(-1)?.[0]).toBe(MODIFY_DRAW_DEFINITION);
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s writes the quiet winner key when a BYE cascade visits an empty loser seat',
  (mode) => {
    const config = randomConfig(9000060);
    const drawId = 'quiet-empty-loser';
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    prepareDraw(config, drawId);
    const steps = generateSchedule(config, drawId, 30);
    let prepared: Tournament | undefined;
    let sourceId: string | undefined;
    counter.prepare = (params) => {
      if (prepared || params.winningSide !== 2 || !params.tournamentRecord) return;
      const source = params.drawDefinition?.structures
        ?.find((entry: any) => entry.structureName === 'East')
        ?.matchUps?.find((entry: any) => entry.roundNumber === 1 && entry.roundPosition === 3);
      if (source?.matchUpId !== params.matchUpId || source?.matchUpStatus !== DOUBLE_DEFAULT) return;
      prepared = structuredClone(params.tournamentRecord);
      sourceId = source.matchUpId;
    };
    try {
      prepareCensus(config, steps, drawId);
    } finally {
      counter.prepare = undefined;
    }
    expect(prepared).toBeDefined();
    tournamentEngine.setState(prepared!);
    write(mode, drawId, sourceId!, { winningSide: 2 }, { propagateExitStatus: config.propagateExitStatus });
    const record = Object.values(getTournamentRecords())[0] as Tournament;
    const target = record.events![0].drawDefinitions![0].structures!.find(
      (entry) => entry.structureName === 'Southwest',
    )!.matchUps![0];
    expect(target.matchUpStatus).toBe(TO_BE_PLAYED);
    expect(Object.hasOwn(target, 'winningSide')).toBe(true);
    expect(target.winningSide).toBeUndefined();
  },
);

it.each(
  ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).flatMap((mode) => [
    { mode, kind: 'produced', expected: MODIFY_POSITION_ASSIGNMENTS },
    { mode, kind: 'carried', expected: MODIFY_MATCHUP },
  ]),
)('$mode retains the final $kind assignment-return notice boundary', ({ mode, kind, expected }) => {
  const scenario =
    kind === 'produced'
      ? AWARDED_PRODUCED_RELAY.find(
          ([label]) =>
            label ===
            'FEED_IN_CHAMPIONSHIP 8 awarded produced relay: DOUBLE_DEFAULT beside the BYE of DOUBLE_DEFAULT, played',
        )![1]
      : CARRIER_SENT_ON.find(
          ([label]) => label.startsWith('FIRST_ROUND_LOSER_CONSOLATION 8:') && label.endsWith('given a winner'),
        )![1];
  prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
  const topics = observeNoticeTopics();
  const step = scenario.steps[0];
  write(mode, 'd', findTarget(step.target), step.outcome, step.params);
  expect(topics.at(-1)).toBe(expected);
});

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s withdraws the existing carried exit before relabeling its result and provenance',
  (mode) => {
    const { drawId, record } = fresh({ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16 }, {}, 4242);
    const structures = record.events![0].drawDefinitions![0].structures!;
    const source = structures
      .find((entry) => entry.structureName === 'Main')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 1)!;
    write(
      OUTCOME_PIPELINE_V1,
      drawId,
      source.matchUpId,
      { matchUpStatus: WALKOVER, winningSide: 1 },
      { propagateExitStatus: true },
    );
    write(mode, drawId, source.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 }, { propagateExitStatus: true });
    const target = structures
      .find((entry) => entry.structureName === 'Consolation')!
      .matchUps!.find((entry) => entry.roundNumber === 1 && entry.roundPosition === 1)!;
    expect(target.matchUpStatus).toBe(DEFAULTED);
    expect(target.winningSide).toBe(2);
    const keys = Object.keys(target);
    expect(keys.indexOf('winningSide')).toBeGreaterThan(keys.indexOf('schedule'));
    expect(keys.indexOf('sideExitProvenance')).toBeGreaterThan(keys.indexOf('winningSide'));
  },
);

it.each([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const)(
  '%s returns the backdraw assignment before announcing the linked main-draw placement',
  (mode) => {
    const scenario = PRODUCED_RELAY.find(
      ([label]) => label === 'DE 8 produced relay: DOUBLE_WALKOVER relayed beside the BYE of DOUBLE_DEFAULT, played',
    )![1];
    prepareDirection(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const topics = observeNoticeTopics();
    const step = scenario.steps[0];
    write(mode, 'd', findTarget(step.target), step.outcome, step.params);
    expect(topics.at(-1)).toBe(MODIFY_MATCHUP);
  },
);
