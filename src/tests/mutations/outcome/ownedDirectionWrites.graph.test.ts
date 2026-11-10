import { getProvider, getTournamentRecords, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
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
  STANDALONE_INDIRECT_CLEARS,
  play as prepareDirection,
  findTarget,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { ROUND_ROBIN, FIRST_MATCH_LOSER_CONSOLATION, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPASS, CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { USTA_COLLEGE, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM, SINGLES } from '@Constants/eventConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { setClock } from '@Tools/clock';
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
  DEFAULTED,
  WALKOVER,
  TO_BE_PLAYED,
  BYE,
} from '@Constants/matchUpStatusConstants';

const counter = vi.hoisted(() => ({ active: false, calls: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (load) => {
  const actual: any = await load();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
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
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fresh(drawProfile = {}, policyDefinitions = {}, nonRandom = 1) {
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
  if ('eventType' in drawProfile && drawProfile.eventType === TEAM)
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
