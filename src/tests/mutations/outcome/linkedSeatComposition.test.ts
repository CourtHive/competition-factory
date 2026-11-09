import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { PlanArgs } from '@Mutate/matchUps/outcome/types';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';
import {
  DOUBLE_ELIMINATION,
  COMPASS,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

const observed = vi.hoisted(() => ({
  active: false,
  failure: '' as '' | 'missing' | 'own-fold' | 'second-fold' | 'child-fold',
  writes: 0,
  projections: 0,
  batches: [] as OutcomeOp[][],
  pure: [] as boolean[],
  sourceId: '',
  v1Entry: [] as string[],
  projectedEntry: [] as string[],
}));

// Capture placement state at v1's actual cascade entry, after correction removal and before either linked seat.
const positions = (draw: any) =>
  JSON.stringify(
    draw.structures.map((structure: any) => ({
      structureId: structure.structureId,
      assignments: positionAssignmentsOf(structure),
      matchUps: matchUpsOf(structure)?.map((m: any) => ({
        matchUpId: m.matchUpId,
        hasPositions: Object.hasOwn(m, 'drawPositions'),
        drawPositions: m.drawPositions,
      })),
    })),
  );

vi.mock('@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doubleExitAdvancement: (args: any) => {
      if (observed.active && args.targetData?.matchUp?.matchUpId === observed.sourceId)
        observed.v1Entry.push(positions(args.drawDefinition));
      return actual.doubleExitAdvancement(args);
    },
  };
});

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      observed.writes++;
      return actual.setMatchUpState(...args);
    },
  };
});

// Exercise failed projection after real writes to the working copy, and prove that planning never changes storage.
vi.mock('@Mutate/matchUps/outcome/plan', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    planOutcome: (args: PlanArgs) => {
      if (!observed.active) return actual.planOutcome(args);
      const before = JSON.stringify(args.tournamentRecord);
      const project = args.project;
      const result = actual.planOutcome({
        ...args,
        project: (prefix: OutcomeOp[]) => {
          observed.projections++;
          observed.batches.push(structuredClone(prefix));
          if (observed.failure === 'missing') return undefined;
          const working = project?.(prefix);
          if (!working) return undefined;
          observed.projectedEntry.push(positions(working.drawDefinition));
          const apply = working.apply;
          let folds = 0;
          working.apply = (ops: OutcomeOp[]) => {
            observed.batches.push(structuredClone(ops));
            folds++;
            const folded = apply(ops);
            const failAt = { 'own-fold': 1, 'second-fold': 2, 'child-fold': 0, missing: 0, '': 0 }[observed.failure];
            const childFailure =
              observed.failure === 'child-fold' &&
              ops.some((op) => op.op === 'assignBye' && op.announcesEvent === false);
            return folds === failAt || childFailure ? { error: 'injected projection failure' } : folded;
          };
          return working;
        },
      });
      observed.pure.push(JSON.stringify(args.tournamentRecord) === before);
      return result;
    },
  };
});

afterEach(() => {
  observed.active = false;
  observed.failure = '';
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

type Recipe = {
  drawType: string;
  size: number;
  count: number;
  target: number;
  round?: number;
  setup?: number;
  policyOff?: boolean;
  correction?: boolean;
  walked?: boolean;
  seed?: number;
  structureName?: string;
  carried?: boolean;
  team?: boolean;
  stripTimes?: boolean;
  childEvidence?: 'paired-bye' | 'arrival' | 'unrelated';
  setupSteps?: [number, string, number?][];
  outcomeStatus?: string;
  reverseHolders?: boolean;
};

const holderRecipe: Recipe = {
  drawType: COMPASS,
  size: 32,
  count: 30,
  seed: 21063079,
  structureName: 'East',
  target: 9,
  carried: true,
  setupSteps: [
    [13, 'WALKOVER', 1],
    [14, 'WALKOVER', 1],
    [10, 'DEFAULTED', 1],
    [11, 'DEFAULTED', 1],
    [12, 'DOUBLE_WALKOVER'],
  ],
  outcomeStatus: 'DOUBLE_WALKOVER',
};
const recipes: [string, Recipe][] = [
  [
    'a carried home serves its occupied loser seat before replaying the carry',
    { drawType: OLYMPIC, size: 8, count: 8, setup: 1, target: 2, seed: 20053188, structureName: 'East', carried: true },
  ],
  [
    'a displaced TEAM carrier leaves its linked seat',
    {
      drawType: OLYMPIC,
      size: 8,
      count: 8,
      setup: 1,
      target: 2,
      seed: 20053188,
      structureName: 'East',
      carried: true,
      team: true,
    },
  ],
  [
    'the child BYE notice supersedes withdrawal without scored-time cleanup',
    {
      drawType: OLYMPIC,
      size: 8,
      count: 8,
      setup: 1,
      target: 2,
      seed: 20053188,
      structureName: 'East',
      carried: true,
      stripTimes: true,
    },
  ],
  [
    'a carried home in the larger Olympic draw retires the historical fallback',
    { drawType: OLYMPIC, size: 16, count: 16, setup: 2, target: 1, seed: 1, structureName: 'East', carried: true },
  ],
  [
    'a displaced child drops its paired BYE origin and both reason representations',
    {
      drawType: OLYMPIC,
      size: 8,
      count: 8,
      setup: 1,
      target: 2,
      seed: 20053188,
      structureName: 'East',
      carried: true,
      childEvidence: 'paired-bye',
    },
  ],
  [
    'a child BYE withdraws arrival-by-result provenance',
    {
      drawType: OLYMPIC,
      size: 8,
      count: 8,
      setup: 1,
      target: 2,
      seed: 20053188,
      structureName: 'East',
      carried: true,
      childEvidence: 'arrival',
    },
  ],
  [
    'a displaced child preserves unrelated opposite provenance',
    {
      drawType: OLYMPIC,
      size: 8,
      count: 8,
      setup: 1,
      target: 2,
      seed: 20053188,
      structureName: 'East',
      carried: true,
      childEvidence: 'unrelated',
    },
  ],
  ['two BYE chains join', { drawType: FEED_IN_CHAMPIONSHIP, size: 8, count: 8, setup: 1, target: 3 }],
  [
    'the own chain makes the second seat a BYE',
    { drawType: FIRST_MATCH_LOSER_CONSOLATION, size: 8, count: 7, target: 2 },
  ],
  ['a standing BYE makes a double BYE', { drawType: FEED_IN_CHAMPIONSHIP, size: 8, count: 7, setup: 2, target: 3 }],
  [
    'double BYE passes a fed BYE',
    { drawType: FIRST_MATCH_LOSER_CONSOLATION, size: 16, count: 13, setup: 5, target: 6, walked: true },
  ],
  [
    'produced exit precedes the unfillable BYE',
    { drawType: FIRST_MATCH_LOSER_CONSOLATION, size: 8, count: 7, target: 3, policyOff: true, seed: 9000230 },
  ],
  [
    'played result is removed before composition',
    { drawType: FEED_IN_CHAMPIONSHIP, size: 8, count: 8, target: 1, correction: true },
  ],
  [
    'a removed loser passed a structural BYE',
    { drawType: FEED_IN_CHAMPIONSHIP, size: 8, count: 7, target: 2, correction: true },
  ],
  [
    'an own double BYE changes the second seat',
    { drawType: DOUBLE_ELIMINATION, size: 8, count: 4, round: 2, target: 1, seed: 21117689 },
  ],
];

function prepare(recipe: Recipe) {
  observed.active = false;
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock('2026-11-08T10:00:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: recipe.drawType,
        drawSize: recipe.size,
        participantsCount: recipe.count,
        drawId: 'd',
        ...(recipe.team ? { eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' } : {}),
      },
    ],
    nonRandom: recipe.seed ?? 1,
    setState: true,
  });
  if (recipe.team)
    expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success).toBe(
      true,
    );
  if (recipe.policyOff)
    tournamentEngine.attachPolicies({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
    });
  const target = (position: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (m: any) =>
          m.structureName === (recipe.structureName ?? 'Main') &&
          m.roundNumber === (recipe.round ?? 1) &&
          m.roundPosition === position,
      ).matchUpId;
  if (recipe.setup) {
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: target(recipe.setup),
      outcome: recipe.carried ? { matchUpStatus: WALKOVER, winningSide: 1 } : { matchUpStatus: DOUBLE_DEFAULT },
      propagateExitStatus: recipe.carried,
    });
    expect(result.success).toBe(true);
  }
  for (const [position, matchUpStatus, winningSide] of recipe.setupSteps ?? []) {
    const result = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: target(position),
      outcome: { matchUpStatus, winningSide },
      propagateExitStatus: true,
      allowChangePropagation: true,
    });
    expect(result.success).toBe(true);
  }
  const matchUpId = target(recipe.target);
  if (recipe.correction) {
    const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    let result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome });
    expect(result.success).toBe(true);
  }
  const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  if (recipe.team) {
    const south = record.events![0].drawDefinitions![0].structures!.find(
      (structure) => structure.structureName === 'South',
    )!;
    expect(matchUpsOf(south)![0].sides?.some((side) => side.lineUp?.length)).toBe(true);
  }
  if (recipe.reverseHolders) {
    const south = record.events![0].drawDefinitions![0].structures!.find(
      (structure) => structure.structureName === 'South',
    )!;
    south.matchUps = matchUpsOf(south)!.toReversed();
  }
  if (recipe.childEvidence) addChildEvidence(record.events![0].drawDefinitions![0], matchUpId, recipe.childEvidence);
  if (recipe.stripTimes) clearScoredTimes(record);
  return {
    record,
    matchUpId,
    carried: recipe.carried,
    outcomeStatus: recipe.outcomeStatus,
  };
}

function clearScoredTimes(record: Tournament) {
  for (const event of record.events ?? [])
    for (const draw of event.drawDefinitions ?? [])
      for (const structure of draw.structures ?? [])
        for (const matchUp of matchUpsOf(structure) ?? []) if (matchUp.schedule) delete matchUp.schedule.scoredTime;
}

function addChildEvidence(draw: DrawDefinition, matchUpId: string, evidence: Recipe['childEvidence']) {
  const south = draw.structures!.find((structure) => structure.structureName === 'South')!;
  const child = matchUpsOf(south)![0];
  expect(child.sideExitProvenance?.[1]).toBeDefined();
  child.sideExitProvenance![2] =
    evidence === 'arrival'
      ? { previousMatchUpStatus: WALKOVER, sourceMatchUpId: matchUpId }
      : {
          matchUpStatus: 'BYE',
          previousMatchUpStatus: evidence === 'paired-bye' ? 'BYE' : 'DEFAULTED',
          sourceMatchUpId: matchUpId,
        };
  child.matchUpStatusCodes = ['W1'];
  child.sideStatusCodes = { 1: 'W1' };
}

function replay(
  mode: OutcomePipelineMode,
  prepared: ReturnType<typeof prepare>,
  failure: typeof observed.failure = '',
) {
  observed.active = false;
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared.record));
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP].map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
      ]),
    ),
  });
  setClock('2026-11-08T10:01:00.000Z');
  setOutcomePipeline(mode);
  Object.assign(observed, {
    active: true,
    failure,
    writes: 0,
    projections: 0,
    batches: [],
    pure: [],
    sourceId: prepared.matchUpId,
    v1Entry: [],
    projectedEntry: [],
  });
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    drawId: 'd',
    matchUpId: prepared.matchUpId,
    outcome: { matchUpStatus: prepared.outcomeStatus ?? DOUBLE_DEFAULT },
    allowChangePropagation: true,
    propagateExitStatus: prepared.carried,
  }) as any;
  return {
    result,
    notices,
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    writes: observed.writes,
  };
}

it.each(recipes)('%s preserves records, returns and subscribed notice order', (_label, recipe) => {
  const prepared = prepare(recipe);
  const reference = replay('v1', prepared);
  const v1Entry = [...observed.v1Entry];
  expect(reference.result.success).toBe(true);
  expect(reference.writes).toBeGreaterThan(0);
  expect(reference.notices.length).toBeGreaterThan(0);
  const owned = replay('v2', prepared);
  expect(owned).toEqual({ ...reference, writes: 0 });
  expect(observed.projections).toBe(recipe.walked ? 0 : 1);
  expect(observed.pure).toEqual([true]);
  // The generic BYE walk remains a distinct writer. Only the ordinary linked seats use this cursor.
  if (recipe.walked) expect(observed.batches).toHaveLength(0);
  else expect(observed.batches.length).toBeGreaterThanOrEqual(3);
  if (!recipe.walked) {
    expect(v1Entry).toHaveLength(1);
    expect(observed.projectedEntry).toEqual(v1Entry);
    expect(observed.batches[1].length).toBeGreaterThan(0);
    expect(observed.batches.slice(2).some((batch) => batch.length > 0)).toBe(true);
  }
  expect(replay('differential', prepared)).toEqual(reference);
});

it.each(['missing', 'own-fold', 'second-fold'] as const)(
  'a %s projection failure falls back with no partial storage write',
  (failure) => {
    const prepared = prepare(recipes.find(([label]) => label === 'two BYE chains join')![1]);
    const reference = replay('v1', prepared);
    expect(replay('v2', prepared, failure)).toEqual(reference);
    expect(observed.projections).toBe(1);
    expect(observed.pure).toEqual([true]);
  },
);

it('a nested child fold failure leaves the live draw unchanged and falls back as one call', () => {
  const prepared = prepare(recipes.find(([label]) => label.startsWith('a carried home serves'))![1]);
  const reference = replay('v1', prepared);
  expect(replay('v2', prepared, 'child-fold')).toEqual(reference);
  expect(observed.pure).toEqual([true]);
  expect(observed.batches.some((batch) => batch.some((op) => op.op === 'setMatchUpBye'))).toBe(true);
});

it('a foreign stale origin is settled before the local carry can replay', () => {
  const prepared = prepare(recipes.find(([label]) => label.startsWith('a carried home in the larger'))![1]);
  const draw = prepared.record.events![0].drawDefinitions![0];
  const east = draw.structures!.find((structure) => structure.structureName === 'East')!;
  const matches = matchUpsOf(east)!;
  const foreign = matches.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 3)!;
  const source = matches.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 4)!;
  foreign.matchUpStatus = WALKOVER;
  foreign.winningSide = 2;
  foreign.sideExitProvenance = {
    1: { matchUpStatus: 'WALKOVER', previousMatchUpStatus: DOUBLE_DEFAULT, sourceMatchUpId: source.matchUpId },
  };
  const reference = replay('v1', prepared);
  expect(reference.result.success).toBe(true);
  const settled = JSON.parse(reference.record)
    .events[0].drawDefinitions[0].structures.flatMap((structure: any) => structure.matchUps)
    .find((entry: any) => entry.matchUpId === foreign.matchUpId);
  expect(settled.sideExitProvenance).toBeUndefined();
  expect(replay('v2', prepared)).toEqual(reference);
  expect(observed.pure).toEqual([true]);
});

it.each([false, true])(
  'an immediate carrier arrival into an exit remains a whole-call fallback (reverse stored holders: %s)',
  (reverseHolders) => {
    const prepared = prepare({ ...holderRecipe, reverseHolders });
    const south = prepared.record.events![0].drawDefinitions![0].structures!.find(
      (structure) => structure.structureName === 'South',
    )!;
    expect(matchUpsOf(south)!.filter((entry) => entry.drawPositions?.includes(5))).toHaveLength(3);
    const reference = replay('v1', prepared);
    expect(reference.result.success).toBe(true);
    expect(replay('v2', prepared)).toEqual(reference);
    expect(observed.pure).toEqual([true]);
  },
);

it('a displaced child keeps orderOfFinish through the BYE service', () => {
  const prepared = prepare(recipes.find(([label]) => label.startsWith('the child BYE notice'))![1]);
  const south = prepared.record.events![0].drawDefinitions![0].structures!.find(
    (structure) => structure.structureName === 'South',
  )!;
  const child = matchUpsOf(south)![0];
  child.orderOfFinish = 7;
  const reference = replay('v1', prepared);
  expect(reference.result.success).toBe(true);
  const settled = JSON.parse(reference.record)
    .events[0].drawDefinitions[0].structures.flatMap((structure: any) => structure.matchUps)
    .find((entry: any) => entry.matchUpId === child.matchUpId);
  expect(settled.orderOfFinish).toBe(7);
  expect(replay('v2', prepared)).toEqual({ ...reference, writes: 0 });
  expect(replay('differential', prepared)).toEqual(reference);
});
