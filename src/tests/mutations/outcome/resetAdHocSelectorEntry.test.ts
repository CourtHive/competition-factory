import {
  deleteNotices,
  getTournamentRecord,
  setOutcomePipeline,
  setSchemaWriteMode,
  setSubscriptions,
} from '@Global/state/globalState';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';
import { BRIDGE, LEGACY, NATIVE, type SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { afterEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

const observed = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpStatus', async (original) => {
  const actual: any = await original();
  return {
    ...actual,
    setMatchUpStatus: (args: any) => {
      observed.calls.push(args);
      return actual.setMatchUpStatus(args);
    },
  };
});

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSchemaWriteMode(NATIVE);
  setClock();
});

type Case = {
  name: string;
  type?: string;
  schema?: SchemaWriteMode;
  manual?: boolean;
  partial?: boolean;
  ids?: 'duplicate' | 'valid-unknown' | 'unknown-valid';
};
const cases: Case[] = [
  { name: 'completed singles' },
  { name: 'partial singles', partial: true },
  { name: 'completed doubles', type: 'DOUBLES' },
  { name: 'legacy singles', schema: LEGACY },
  { name: 'bridge doubles', type: 'DOUBLES', schema: BRIDGE },
  { name: 'completed TEAM', type: 'TEAM' },
  { name: 'manual TEAM', type: 'TEAM', manual: true },
  { name: 'duplicate IDs', ids: 'duplicate' },
  { name: 'valid then unknown', ids: 'valid-unknown' },
  { name: 'unknown then valid', ids: 'unknown-valid' },
];
const topics = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];

function play(
  c: Case,
  mode: typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2 | typeof OUTCOME_PIPELINE_DIFFERENTIAL,
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSchemaWriteMode(NATIVE);
  setSubscriptions({ subscriptions: {} });
  setClock('2026-11-06T02:50:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId: 'd',
        drawSize: 8,
        drawType: 'AD_HOC',
        automated: true,
        roundsCount: 2,
        eventType: c.type ?? 'SINGLES',
        ...(c.type === 'TEAM' ? { tieFormatName: 'DOMINANT_DUO' } : {}),
      },
    ],
    completeAllMatchUps: !c.partial,
    policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
    nonRandom: 471107,
    startDate: '2026-11-06',
    endDate: '2026-11-10',
    setState: true,
  });
  const record = getTournamentRecord(tournamentEngine.getTournamentId());
  const first = record.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.roundNumber === 1);
  if (c.partial)
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: first.matchUpId,
        outcome: { matchUpStatus: IN_PROGRESS, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } },
      }).success,
    ).toBe(true);
  if (c.manual)
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: first.matchUpId,
        outcome: { winningSide: first.winningSide || 1 },
        disableAutoCalc: true,
      }).success,
    ).toBe(true);
  const selections = {
    duplicate: [first.matchUpId, first.matchUpId],
    'valid-unknown': [first.matchUpId, 'unknown'],
    'unknown-valid': ['unknown', first.matchUpId],
  };
  const ids = c.ids ? selections[c.ids] : [first.matchUpId];
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      topics.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
      ]),
    ),
  });
  const before = canonicalJson(record);
  observed.calls = [];
  setOutcomePipeline(mode);
  setSchemaWriteMode(c.schema ?? NATIVE);
  setClock('2026-11-06T02:51:00.000Z');
  const { stack: _stack, ...result } = tournamentEngine.resetAdHocMatchUps({ drawId: 'd', matchUpIds: ids });
  const requests = observed.calls.map((call) => ({
    id: call.matchUpId,
    outcome: call.outcome,
    privateRemoveScore: Object.hasOwn(call, 'removeScore'),
  }));
  return {
    before,
    after: canonicalJson(record),
    result,
    notices,
    requests,
    ids,
    firstHasWinner: !!first.winningSide,
    firstStatus: first.matchUpStatus,
  };
}

it.each(cases)('routes the outer reset through the selector with the existing public contract: $name', (c) => {
  // Entry routing is separate from v2 executor ownership: a selector may still delegate internally to v1.
  const v1 = play(c, OUTCOME_PIPELINE_V1);
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) expect(play(c, mode)).toEqual(v1);
  const attempted = c.ids === 'unknown-valid' ? ['unknown'] : v1.ids;
  expect(v1.requests.map((request) => request.id)).toEqual(attempted);
  expect(v1.requests.every((request) => !request.privateRemoveScore)).toBe(true);
  if (c.ids === 'valid-unknown' || c.ids === 'unknown-valid') {
    expect(v1.result.error).toEqual(MATCHUP_NOT_FOUND);
    expect(v1.notices).toEqual([]);
    if (c.ids === 'unknown-valid') expect(v1.after).toEqual(v1.before);
    else {
      expect(v1.after).not.toEqual(v1.before);
      expect(v1.firstHasWinner).toBe(false);
    }
  } else {
    expect(v1.result.success).toBe(true);
    expect(v1.after).not.toEqual(v1.before);
    if (c.type !== 'TEAM') {
      expect(v1.firstHasWinner).toBe(false);
      expect(v1.firstStatus).toBe(TO_BE_PLAYED);
    }
    expect(v1.notices.length).toBeGreaterThan(0);
  }
});
