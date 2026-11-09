import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import type { PlanArgs } from '@Mutate/matchUps/outcome/types';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import {
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
} from '@Constants/drawDefinitionConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

const observed = vi.hoisted(() => ({
  active: false,
  failure: '' as '' | 'missing' | 'own-fold' | 'second-fold',
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
            const failAt = { 'own-fold': 1, 'second-fold': 2, missing: 0, '': 0 }[observed.failure];
            return folds === failAt ? { error: 'injected projection failure' } : folded;
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
};

const recipes: [string, Recipe][] = [
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
    drawProfiles: [{ drawType: recipe.drawType, drawSize: recipe.size, participantsCount: recipe.count, drawId: 'd' }],
    nonRandom: recipe.seed ?? 1,
    setState: true,
  });
  if (recipe.policyOff)
    tournamentEngine.attachPolicies({
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } },
    });
  const target = (position: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (m: any) => m.structureName === 'Main' && m.roundNumber === (recipe.round ?? 1) && m.roundPosition === position,
      ).matchUpId;
  if (recipe.setup) {
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: target(recipe.setup),
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
    });
    expect(result.success).toBe(true);
  }
  const matchUpId = target(recipe.target);
  if (recipe.correction) {
    const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    let result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome });
    expect(result.success).toBe(true);
  }
  return { record: structuredClone(tournamentEngine.getTournament().tournamentRecord), matchUpId };
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
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    allowChangePropagation: true,
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
  expect(observed.batches).toHaveLength(recipe.walked ? 0 : 3);
  if (!recipe.walked) {
    expect(v1Entry).toHaveLength(1);
    expect(observed.projectedEntry).toEqual(v1Entry);
    expect(observed.batches[1].length).toBeGreaterThan(0);
    expect(observed.batches[2].length).toBeGreaterThan(0);
  }
  expect(replay('differential', prepared)).toEqual(reference);
});

it.each(['missing', 'own-fold', 'second-fold'] as const)(
  'a %s projection failure falls back with no partial storage write',
  (failure) => {
    const prepared = prepare(recipes[0][1]);
    const reference = replay('v1', prepared);
    expect(replay('v2', prepared, failure)).toEqual(reference);
    expect(observed.projections).toBe(1);
    expect(observed.pure).toEqual([true]);
  },
);
