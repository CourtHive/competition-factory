import { deleteNotices, setOutcomePipeline, setSchemaWriteMode, setSubscriptions } from '@Global/state/globalState';
import { addNotice, setCapturedClock, setCapturedStamps } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock, withCapturedClock } from '@Tools/clock';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { AD_HOC, ROUND_ROBIN, LUCKY_DRAW, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { BRIDGE, NATIVE, type SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
  MODIFY_MATCHUP,
} from '@Constants/topicConstants';

const writes = vi.hoisted(() => ({ count: 0, tallyFormats: [] as (string | undefined)[] }));
vi.mock('@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    updateAssignmentParticipantResults(args: any) {
      writes.tallyFormats.push(args.matchUpFormat);
      return actual.updateAssignmentParticipantResults(args);
    },
  };
});
vi.mock('@Mutate/matchUps/outcome/plan/tallyOps', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    groupTally(group: any, call: any) {
      writes.tallyFormats.push(group.matchUpFormat);
      return actual.groupTally(group, call);
    },
  };
});
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState(...args: any[]) {
      writes.count++;
      return actual.setMatchUpState(...args);
    },
  };
});
const topics = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const won = (matchUpFormat?: string) =>
  generateOutcomeFromScoreString({
    scoreString: matchUpFormat === 'SET1-S:8/TB7' ? '8-1' : '6-1 6-1',
    winningSide: 1,
    matchUpFormat,
  }).outcome;

type Recipe = {
  eventType: 'SINGLES' | 'DOUBLES' | 'TEAM';
  drawType: typeof AD_HOC | typeof ROUND_ROBIN | typeof LUCKY_DRAW;
  roundsCount: number;
  action: 'first' | 'deciding' | 'correct' | 'clear' | 'dual';
  reversed: boolean;
  drawSize?: number;
};

function prepare(recipe: Recipe) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-11-08T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  const generated = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        eventType: recipe.eventType,
        drawType: recipe.drawType,
        ...(recipe.drawType === AD_HOC ? { roundsCount: recipe.roundsCount } : {}),
        drawSize: recipe.drawSize ?? (recipe.drawType === ROUND_ROBIN ? 8 : 4),
        ...(recipe.drawType === ROUND_ROBIN ? { participantsCount: 6 } : {}),
        drawId: 'd',
        automated: true,
        ...(recipe.eventType === 'TEAM' ? { tieFormatName: DOMINANT_DUO } : {}),
      },
    ],
    policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
    nonRandom: 73,
    setState: true,
  });
  expect(generated.success, JSON.stringify(generated)).toEqual(true);
  if (recipe.eventType === 'TEAM')
    expect(
      tournamentEngine.generateLineUps({ drawId: 'd', attach: true, useDefaultEventRanking: true }).success,
    ).toEqual(true);
  const matchUp = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((m) => !m.collectionId);
  const line = recipe.eventType === 'TEAM' && recipe.action !== 'dual';
  let matchUpId = line ? matchUp.tieMatchUps[0].matchUpId : matchUp.matchUpId;
  const targetOutcome = () =>
    won(line ? matchUp.tieMatchUps.find((m) => m.matchUpId === matchUpId)?.matchUpFormat : undefined);
  if (recipe.action === 'deciding') {
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: targetOutcome() }).success).toEqual(
      true,
    );
    matchUpId = matchUp.tieMatchUps[1].matchUpId;
  }
  if (recipe.action === 'correct' || recipe.action === 'clear')
    expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: targetOutcome() }).success).toEqual(
      true,
    );
  const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  const draw = prepared.events[0].drawDefinitions[0];
  if (recipe.reversed) {
    for (const structure of draw.structures) {
      structure.matchUps?.reverse();
      for (const group of structure.structures ?? []) group.matchUps?.reverse();
    }
  }
  // A sibling which the tally's draw notice must stamp even though no result is written there.
  draw.structures.push({
    structureId: 'untouched-sibling',
    structureType: 'ITEM',
    matchUps: [],
    positionAssignments: [],
  });
  let outcome = targetOutcome();
  if (recipe.action === 'clear') outcome = { matchUpStatus: TO_BE_PLAYED };
  if (recipe.action === 'correct') outcome = { matchUpStatus: WALKOVER, winningSide: 2 };
  return { prepared, matchUpId, outcome };
}

type Context = 'engine' | 'buffered' | 'draw-only' | 'no-ledger' | 'uncaptured';

function play(
  mode: OutcomePipelineMode,
  fixture: ReturnType<typeof prepare>,
  schema: SchemaWriteMode,
  context: Context = 'engine',
  request: Record<string, unknown> = {},
) {
  setSchemaWriteMode(schema);
  setOutcomePipeline(mode);
  if (context === 'engine' || context === 'buffered')
    expect(tournamentEngine.setState(structuredClone(fixture.prepared)).success).toEqual(true);
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      topics.map((topic) => [
        topic,
        (payloads: any[]) => {
          for (const payload of payloads) notices.push(`${topic} ${canonicalJson(payload)}`);
        },
      ]),
    ),
  });
  setClock('2026-11-08T00:01:00.000Z');
  if (context === 'buffered') {
    for (const topic of topics) {
      addNotice({ topic, key: 'retained-prior', payload: { prior: topic } });
      addNotice({ topic, key: 'd', payload: { drawId: 'd', prior: topic } });
    }
  }
  writes.count = 0;
  writes.tallyFormats = [];
  const params = {
    ...request,
    drawId: 'd',
    matchUpId: fixture.matchUpId,
    outcome: fixture.outcome,
  };
  let returned;
  const roots = structuredClone(fixture.prepared);
  if (context === 'engine' || context === 'buffered') {
    returned = tournamentEngine.setMatchUpStatus(params);
  } else {
    const event = roots.events[0];
    const run = () => {
      const result = setMatchUpStatus({
        ...params,
        drawDefinition: event.drawDefinitions[0],
        tournamentRecord: context === 'draw-only' ? undefined : roots,
        event: context === 'draw-only' ? undefined : event,
      });
      notifySubscribers();
      return result;
    };
    if (context === 'no-ledger') setCapturedClock(Date.parse('2026-11-08T00:01:00.000Z'));
    returned = context === 'draw-only' ? withCapturedClock(run) : run();
    setCapturedClock(undefined);
  }
  const { stack: _stack, ...result } = returned;
  return {
    result,
    notices,
    record: canonicalJson(
      context === 'engine' || context === 'buffered' ? tournamentEngine.getTournament().tournamentRecord : roots,
    ),
    writes: writes.count,
    tallyFormats: [...writes.tallyFormats],
  };
}

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSchemaWriteMode(NATIVE);
  setSubscriptions({ subscriptions: {} });
  setClock();
  setCapturedClock(undefined);
  setCapturedStamps(undefined);
});

const singles: Recipe = { eventType: 'SINGLES', drawType: AD_HOC, roundsCount: 3, action: 'first', reversed: true };

it.each(['buffered', 'draw-only', 'no-ledger', 'uncaptured'] as const)(
  'multi-round tally preserves %s context, records and delivered notices',
  (context) => {
    const fixture = prepare(singles);
    const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE, context);
    const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE, context);
    expect(v1.result.success).toEqual(true);
    expect(v2.result).toEqual(v1.result);
    expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
    expect(v2.notices).toEqual(v1.notices);
    expect(v2.writes).toEqual(['no-ledger', 'uncaptured'].includes(context) ? v1.writes : 0);
  },
);

it.each([ROUND_ROBIN, LUCKY_DRAW] as const)('%s preserves assignment writes and notices', (drawType) => {
  const fixture = prepare({ ...singles, drawType, reversed: false });
  const structure = fixture.prepared.events[0].drawDefinitions[0].structures[0];
  const selected = structure.structures?.[0] ?? structure;
  if (drawType === ROUND_ROBIN) expect(selected.positionAssignments.some((assignment) => assignment.bye)).toBe(true);
  for (const assignment of selected.positionAssignments ?? []) {
    assignment.subOrder = 71;
    assignment.marker = 'retained assignment';
  }
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE);
  expect(v1.result.success).toEqual(true);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes).toEqual(0);
  expect(v1.tallyFormats).toHaveLength(drawType === ROUND_ROBIN ? 1 : 0);
  expect(v2.tallyFormats).toEqual(v1.tallyFormats);
});

it('legacy lucky rounds retain assignments and clear stale subOrder through the tally writer', () => {
  const fixture = prepare({ ...singles, drawType: LUCKY_DRAW, drawSize: 6, reversed: false });
  const drawDefinition = fixture.prepared.events[0].drawDefinitions[0];
  drawDefinition.drawType = SINGLE_ELIMINATION;
  const structure = drawDefinition.structures[0];
  expect(isLucky({ drawDefinition, structure })).toEqual(true);
  for (const assignment of structure.positionAssignments) {
    assignment.subOrder = 71;
    assignment.marker = 'retained lucky assignment';
  }
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE);
  expect(v1.result.success).toEqual(true);
  expect(v1.tallyFormats).toHaveLength(1);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  const assignments = JSON.parse(v1.record).events[0].drawDefinitions[0].structures[0].positionAssignments;
  expect(assignments.map(({ participantId }) => participantId)).toEqual(
    structure.positionAssignments.map(({ participantId }) => participantId),
  );
  expect(assignments.every(({ marker }) => marker === 'retained lucky assignment')).toEqual(true);
  expect(assignments.some(({ subOrder }) => subOrder === undefined)).toEqual(true);
  expect(v2.writes).toEqual(0);
  expect(v2.tallyFormats).toEqual(v1.tallyFormats);
});

it('invalid tally preserves the score and rebuilt assignment prefix through v1', () => {
  const fixture = prepare(singles);
  const structure = fixture.prepared.events[0].drawDefinitions[0].structures[0];
  const other = structure.matchUps.find((matchUp) => matchUp.matchUpId !== fixture.matchUpId);
  other.matchUpId = 3;
  structure.positionAssignments = (structure.positionAssignments ?? []).map((assignment) => ({
    ...assignment,
    marker: 'obsolete assignment annotation',
  }));
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE, 'draw-only');
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE, 'draw-only');
  expect(v1.result.error).toBeDefined();
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes, JSON.stringify(v1.result)).toEqual(v1.writes);
  const written = JSON.parse(v1.record).events[0].drawDefinitions[0].structures[0];
  expect(written.positionAssignments).not.toEqual(structure.positionAssignments);
  expect(written.matchUps.find((matchUp) => matchUp.matchUpId === fixture.matchUpId).winningSide).toEqual(1);
});

it('multi-round tally reads root policy while the call supplies another policy and format', () => {
  const fixture = prepare(singles);
  fixture.prepared.appliedPolicies.roundRobinTally = { outcomePoints: { win: 11, draw: 5, loss: 2 } };
  const request = {
    policyDefinitions: { roundRobinTally: { outcomePoints: { win: 71, draw: 0, loss: -1 } } },
    matchUpFormat: 'SET1-S:TB10',
  };
  fixture.outcome = generateOutcomeFromScoreString({
    matchUpFormat: request.matchUpFormat,
    scoreString: '10-7',
    winningSide: 1,
  }).outcome;
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE, 'engine', request);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE, 'engine', request);
  expect(v1.result.success).toEqual(true);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes).toEqual(0);
  expect(v1.tallyFormats).toEqual([request.matchUpFormat]);
  expect(v2.tallyFormats).toEqual(v1.tallyFormats);
});

it('an ad hoc TEAM line uses its tiebreak-only format inside the dual tally', () => {
  const fixture = prepare({ ...singles, eventType: 'TEAM' });
  const event = fixture.prepared.events[0];
  event.tieFormat.collectionDefinitions[0].matchUpFormat = 'SET1-S:TB10';
  fixture.outcome = generateOutcomeFromScoreString({
    matchUpFormat: 'SET1-S:TB10',
    scoreString: '10-7',
    winningSide: 1,
  }).outcome;
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE);
  expect(v1.result.success).toEqual(true);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes).toEqual(0);
  expect(v1.tallyFormats).toEqual(['SET1-S:T100']);
  expect(v2.tallyFormats).toEqual(v1.tallyFormats);
});

it('an unplayed ad hoc reset rebuilds assignments and writes the empty tally', () => {
  const fixture = prepare(singles);
  fixture.outcome = { matchUpStatus: TO_BE_PLAYED };
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE);
  expect(v1.result.success).toEqual(true);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes).toEqual(0);
});

it('a TEAM tally excludes a stored singles match in the same ad hoc scope', () => {
  const fixture = prepare({ ...singles, eventType: 'TEAM' });
  const structure = fixture.prepared.events[0].drawDefinitions[0].structures[0];
  const dual = structure.matchUps[0];
  structure.matchUps.push({
    ...structuredClone(dual),
    matchUpId: 'stored-singles',
    matchUpType: 'SINGLES',
    tieMatchUps: undefined,
    tieFormat: undefined,
  });
  const v1 = play(OUTCOME_PIPELINE_V1, fixture, NATIVE);
  const v2 = play(OUTCOME_PIPELINE_V2, fixture, NATIVE);
  expect(v1.result.success).toEqual(true);
  expect(v2.result).toEqual(v1.result);
  expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
  expect(v2.notices).toEqual(v1.notices);
  expect(v2.writes).toEqual(0);
});

const recipes: Recipe[] = (['SINGLES', 'DOUBLES', 'TEAM'] as const).flatMap((eventType) =>
  [1, 3].flatMap((roundsCount) =>
    (eventType === 'TEAM' ? (['first', 'deciding', 'dual'] as const) : (['first', 'correct', 'clear'] as const)).map(
      (action): Recipe => ({
        eventType,
        roundsCount,
        action,
        drawType: AD_HOC,
        reversed: roundsCount === 3,
      }),
    ),
  ),
);
describe.each([NATIVE, BRIDGE] as const)('uniform tally writer %s', (schema) => {
  it.each(recipes)('$eventType $roundsCount rounds $action', (recipe) => {
    setSchemaWriteMode(schema);
    const fixture = prepare(recipe);
    const v1 = play(OUTCOME_PIPELINE_V1, fixture, schema);
    const v2 = play(OUTCOME_PIPELINE_V2, fixture, schema);
    expect(v1.result.success, JSON.stringify(v1.result)).toEqual(true);
    expect(v1.writes).toBeGreaterThan(0);
    expect(v1.notices.length).toBeGreaterThan(0);
    expect(v2.result).toEqual(v1.result);
    expect(JSON.parse(v2.record)).toEqual(JSON.parse(v1.record));
    expect(v2.notices).toEqual(v1.notices);
    const owned = schema === NATIVE && !['correct', 'clear'].includes(recipe.action);
    expect(v2.writes).toEqual(owned ? 0 : v1.writes);
  });
});
