import { planSettlementEffects } from '@Mutate/matchUps/outcome/settlement/effects';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { recordedNotice, withNoticeMarks } from '@Mutate/matchUps/outcome/plan/recordedDiff';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { chooseRoute } from '@Mutate/matchUps/outcome/route';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import {
  getNoticeBuffer,
  getNoticeState,
  getOutcomePipeline,
  setNoticeBuffer,
  setOutcomePipeline,
  setSubscriptions,
  getTopics,
} from '@Global/state/globalState';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { observeClockReadings, withCapturedClock } from '@Tools/clock';
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCHUP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED, DOUBLE_WALKOVER, COMPLETED, IN_PROGRESS, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, afterEach } from 'vitest';

const entryMode = getOutcomePipeline();
afterEach(() => {
  setOutcomePipeline(entryMode);
  setSubscriptions({ subscriptions: {} });
  setNoticeBuffer([]);
});

type Fixture = { linked?: boolean; partialScore?: boolean; tiebreak?: boolean; advance?: boolean; produced?: boolean };
function clearing({ linked, partialScore, advance, produced, tiebreak }: Fixture = {}) {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: produced ? 16 : 8,
        drawId: 'effects',
        drawType: linked || produced ? FEED_IN_CHAMPIONSHIP : SINGLE_ELIMINATION,
      },
    ],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const main = drawDefinition.structures[0].matchUps;
  const root = main.find((m) => m.roundNumber === (produced ? 2 : 1) && m.roundPosition === 1);
  const matchUpId = root.matchUpId;
  const context = { tournamentRecord, event, drawDefinition };
  const played = {
    ...mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 }).outcome,
    matchUpStatus: COMPLETED,
  };
  const outcome = linked ? played : { matchUpStatus: DOUBLE_WALKOVER };
  if (produced) {
    // Only one semifinal feeder has played. Award the empty side a walkover and follow its
    // actual losing participant to the consolation seat on its direct loser link.
    const feeder = main.find((m) => m.winnerMatchUpId === matchUpId && m.roundPosition === 1);
    expect(setMatchUpStatus({ ...context, matchUpId: feeder.matchUpId, outcome: played })).toMatchObject({
      success: true,
    });
    Object.assign(outcome, { matchUpStatus: WALKOVER, winningSide: 2 });
  }
  if (advance) {
    const paired = drawDefinition.structures[0].matchUps.find(
      (m) =>
        m.matchUpId !== matchUpId && m.winnerMatchUpId === root.winnerMatchUpId && m.roundNumber === root.roundNumber,
    );
    const played = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-3', winningSide: 1 }).outcome;
    expect(setMatchUpStatus({ ...context, matchUpId: paired.matchUpId, outcome: played })).toMatchObject({
      success: true,
    });
  }
  expect(setMatchUpStatus({ ...context, matchUpId, outcome, propagateExitStatus: produced })).toMatchObject({
    success: true,
  });
  if (advance) {
    // Older records can carry just the produced exit. The occupied winning seat and its onward
    // receiver still witness the advancement independently of the optional arrival marker.
    const awarded = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === root.winnerMatchUpId);
    expect(awarded.winningSide).toBeTruthy();
    delete awarded.sideExitProvenance[awarded.winningSide];
  }
  const request: OutcomeRequest = {
    matchUpId,
    flags: { propagateRetirementAsExit: false, propagateExitStatus: produced },
    matchUpStatus: partialScore ? IN_PROGRESS : TO_BE_PLAYED,
    ...(partialScore
      ? {
          score: {
            sets: [
              {
                setNumber: 1,
                side1Score: tiebreak ? 7 : 3,
                side2Score: tiebreak ? 6 : 2,
                ...(tiebreak ? { winningSide: 1 } : {}),
              },
            ],
          },
        }
      : {}),
  };
  return {
    ...context,
    request,
  };
}

it.each([
  { subscribed: true, linked: false },
  { subscribed: false, linked: false },
  { subscribed: true, linked: true },
  { subscribed: false, linked: true },
  { subscribed: true, linked: false, partialScore: true },
  { subscribed: true, linked: false, advance: true },
  { subscribed: true, linked: false, produced: true },
  { subscribed: true, linked: false, partialScore: true, tiebreak: true },
])('compares the real clear for %o', ({ subscribed, ...fixture }) => {
  const { linked, partialScore, produced } = fixture;
  const ctx = clearing(fixture);
  const actual = structuredClone(ctx);
  const topics = subscribed ? [UPDATE_INCONTEXT_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP] : [];
  setSubscriptions({ subscriptions: Object.fromEntries(topics.map((k) => [k, () => undefined])) });
  expect(getTopics().topics.sort()).toEqual([...topics].sort());
  // A superseded identity and an unrelated envelope predate the call.
  setNoticeBuffer([
    { topic: MODIFY_MATCHUP, key: ctx.request.matchUpId, payload: { originOrganisationId: 'prior-owner' } },
    { topic: 'unrelated', key: 'other', payload: {} },
  ]);
  const before = getNoticeBuffer()!;
  const provider = getNoticeState()!;
  const priorNotices = before.map((n) => recordedNotice(n) ?? { topic: n.topic, key: n.key, unmodeled: true as const });
  const input = {
    ...ctx,
    topics,
    priorNotices,
    disableNotifications: provider.disableNotifications,
    tracksModificationMarks: !!provider.modifiedTopics && !!provider.modifiedTournamentIds,
  };
  withCapturedClock((capturedClock) => {
    const args = { ...input, capturedClock };
    const matchUpsMap = getMatchUpsMap(ctx);
    const view = buildOutcomeView({ ...ctx, matchUpsMap });
    const route = chooseRoute(ctx.request, view);
    const model = predictSettlement(args);
    const working = {
      drawDefinition: model.drawDefinition,
      matchUpsMap: getMatchUpsMap({ drawDefinition: model.drawDefinition }),
    };
    const pre = JSON.stringify(ctx);
    const prediction = planSettlementEffects({ ...args, working, view, route, ops: model.ops });
    expect(JSON.stringify(ctx)).toBe(pre);
    expect(getNoticeBuffer()).toStrictEqual(before);
    const clearRoute = partialScore ? 'clear' : 'clear-score';
    expect(route).toBe(linked || produced ? 'remove-directed' : clearRoute);
    expect(prediction.reasons).toEqual([]);
    if (fixture.tiebreak) expect(prediction.result?.warnings).toMatchObject([{ setNumbers: [1] }]);
    if (produced) {
      expect(model.ops.some((op) => op.op === 'setMatchUpResult' && op.announcedAs === 'withdrawProducedExits')).toBe(
        true,
      );
    }
    const answer = withNoticeMarks((readMarks) =>
      withDraftWrites(() => {
        const reads: unknown[] = [],
          errors: unknown[] = [];
        const result = observeClockReadings(
          () => (read) => reads.push(read),
          () =>
            setMatchUpStatus({
              ...actual,
              matchUpId: actual.request.matchUpId!,
              propagateExitStatus: actual.request.flags.propagateExitStatus,
              outcome: { matchUpStatus: actual.request.matchUpStatus, score: actual.request.score },
            }),
          errors,
        );
        expect(errors).toEqual([]);
        expect(reads).toStrictEqual(prediction.readings);
        const notices = getNoticeBuffer()!
          .filter((n) => !before.includes(n))
          .map(recordedNotice);
        return { result, announced: { op: 'announceRecorded', notices, marks: readMarks() } };
      }),
    );
    expect(prediction.result).toStrictEqual(answer.result);
    expect(prediction.announced).toStrictEqual(answer.announced);
    expect(prediction.readings).toEqual([]);
    expect(
      planSettlementEffects({ ...args, capturedClock: undefined, working, view, route, ops: model.ops }).announced,
    ).toBeUndefined();
  });
});

type EffectArgs = Parameters<typeof planSettlementEffects>[0];

function capturedFrame(fixture?: Fixture) {
  const ctx = clearing(fixture);
  const capturedClock = Date.UTC(2026, 0, 2);
  const args = {
    ...ctx,
    capturedClock,
    topics: [MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP],
    priorNotices: [],
    disableNotifications: false,
    tracksModificationMarks: true,
  };
  const matchUpsMap = getMatchUpsMap(ctx);
  const view = buildOutcomeView({ ...ctx, matchUpsMap });
  const route = chooseRoute(ctx.request, view);
  const model = predictSettlement(args);
  const projectedDraw = structuredClone(model.drawDefinition);
  const input: EffectArgs = {
    ...args,
    view,
    route,
    ops: model.ops,
    working: {
      drawDefinition: projectedDraw,
      matchUpsMap: getMatchUpsMap({ drawDefinition: projectedDraw }),
    },
  };
  const matches = view.inContextDrawMatchUps!;
  const find = (id?: string) => matches.find((m) => m.matchUpId === id)!;
  const projected = (id: string) => input.working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === id)!;
  const root = find(args.request.matchUpId);
  const winner = find(root.winnerMatchUpId),
    loser = find(root.loserMatchUpId);
  const terminal = find(winner?.winnerMatchUpId);
  expect(planSettlementEffects(input).reasons).toEqual([]);
  return { input, matches, root, winner, loser, terminal, projected };
}

function abstains(frame: ReturnType<typeof capturedFrame>, reason = 'unmodeled settlement emission order') {
  const answer = planSettlementEffects(frame.input);
  expect(answer).toStrictEqual({ reasons: [reason] });
}

it('keeps opaque prior notices unless this call would replace their exact subscribed identity', () => {
  const f = capturedFrame();
  const announced = planSettlementEffects(f.input).announced!;
  const n = announced.notices.find((n) => n.topic === MODIFY_MATCHUP)!;
  f.input.priorNotices = [{ topic: n.topic, key: n.key, unmodeled: true }];
  abstains(f, 'unknown superseded notice identity');
  f.input.priorNotices = [{ topic: n.topic, key: n.key + '-other', unmodeled: true }];
  expect(planSettlementEffects(f.input).announced).toStrictEqual(announced);
  f.input.priorNotices = [{ topic: n.topic, key: n.key, unmodeled: true }];
  f.input.disableNotifications = true;
  expect(planSettlementEffects(f.input).announced?.notices).toEqual([]);
});

it('abstains on a winner request, extra writer, or missing captured root even if the supplied score overlay is unchanged', () => {
  const f = capturedFrame();
  const req = f.input.request;
  f.input.request = { ...req, winningSide: 1 };
  abstains(f);
  f.input.request = { ...req, carries: { notes: 'court change' } };
  abstains(f);
  f.input.request = { ...req, matchUpId: 'missing-root' };
  abstains(f);
  f.input.request = { ...req };
  f.input.route = 'winner';
  abstains(f);
  f.input.route = 'clear-score';
  f.root.matchUpStatus = COMPLETED;
  abstains(f);
});

it('requires an ordinary, previously awarded singles root for a directed removal', () => {
  const f = capturedFrame({ linked: true });
  f.input.request = { ...f.input.request, score: { sets: [{ side1Score: 1, side2Score: 0 }] } };
  abstains(f);
  delete f.input.request.score;
  delete f.root.winningSide;
  abstains(f);
});

it('leaves an unplanned write or cleanup outside the certified path incomplete', () => {
  const f = capturedFrame();
  f.input.ops.push({ op: 'clearMatchUpScoredTime', matchUpId: 'uncertified' });
  abstains(f);
  f.input.ops.pop();
  f.input.ops.push({ op: 'setMatchUpDrawPositions', matchUpId: f.root.matchUpId, drawPositions: [] });
  abstains(f);
  const linked = capturedFrame({ linked: true });
  linked.input.ops.push({ op: 'clearMatchUpScoredTime', matchUpId: 'missing-entity' });
  abstains(linked);
  linked.input.ops.pop();
  linked.input.ops.push({ op: 'setMatchUpDrawPositions', matchUpId: linked.loser.matchUpId, drawPositions: [] });
  abstains(linked);
});

it('requires a quiet terminal release to agree with the standing award, entrant and projected vacancy', () => {
  const f = capturedFrame({ advance: true });
  const seat = f.winner.sides!.find((s) => s.sideNumber === f.winner.winningSide)!;
  const entrant = seat.participantId!;
  delete seat.participantId;
  abstains(f);
  seat.participantId = entrant;
  f.terminal.matchUpStatus = IN_PROGRESS;
  abstains(f);
  f.terminal.matchUpStatus = TO_BE_PLAYED;
  f.projected(f.terminal.matchUpId).drawPositions = [seat.drawPosition];
  abstains(f);
});

it('requires the paired feeder to have a standing winner and the release to have one unique onward holder', () => {
  const f = capturedFrame({ advance: true });
  const pair = f.matches.find((m) => m.matchUpId !== f.root.matchUpId && m.winnerMatchUpId === f.winner.matchUpId)!;
  const saved = pair.winningSide;
  delete pair.winningSide;
  abstains(f);
  pair.winningSide = saved;
  f.matches.push({ ...f.terminal, matchUpId: 'another-onward-holder' });
  abstains(f);
});

it('abstains when the supposed quiet winner receiver has a BYE, an active result or an unverified origin', () => {
  const f = capturedFrame();
  f.winner.sides![0].bye = true;
  abstains(f);
  delete f.winner.sides![0].bye;
  const status = f.winner.matchUpStatus;
  f.winner.matchUpStatus = COMPLETED;
  abstains(f);
  f.winner.matchUpStatus = status;
  Object.values(f.winner.sideExitProvenance!)[0].sourceMatchUpId = 'unresolved-origin';
  abstains(f);
});

it('retains an independently sourced terminal exit while refusing an unsupported name on the same position', () => {
  const f = capturedFrame();
  const other = f.matches.find(
    (m) =>
      m.structureId === f.root.structureId &&
      m.winnerMatchUpId === f.terminal.matchUpId &&
      m.matchUpId !== f.winner.matchUpId,
  )!;
  other.matchUpStatus = DOUBLE_WALKOVER;
  f.terminal.matchUpStatus = WALKOVER;
  f.terminal.sideExitProvenance = {
    2: { sourceMatchUpId: other.matchUpId, matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER },
  };
  f.input.ops = f.input.ops.filter((op) => !('matchUpId' in op && op.matchUpId === f.terminal.matchUpId));
  const e = planSettlementEffects(f.input);
  expect(e.reasons).toEqual([]);
  expect(e.announced!.notices.filter((n) => n.topic === MODIFY_MATCHUP).map((n) => n.key)).not.toContain(
    f.terminal.matchUpId,
  );
  other.matchUpStatus = IN_PROGRESS;
  abstains(f);
});

it('refuses a linked loser whose standing exit names a different prior status or whose award has a second live dependency', () => {
  const f = capturedFrame({ produced: true });
  const mark = Object.values(f.loser.sideExitProvenance!)[0];
  const previous = mark.previousMatchUpStatus;
  mark.previousMatchUpStatus = COMPLETED;
  abstains(f);
  mark.previousMatchUpStatus = previous;
  f.terminal.sideExitProvenance = { 1: { ...mark, sourceMatchUpId: f.loser.matchUpId } };
  abstains(f);
  delete f.terminal.sideExitProvenance;
  f.loser.sideExitProvenance![2] = { ...mark };
  abstains(f);
});

it('abstains when a directed winner remains further on or a released loser is still recorded at another match', () => {
  const f = capturedFrame({ linked: true });
  f.terminal.drawPositions = [...f.winner.drawPositions!];
  abstains(f);
  delete f.terminal.drawPositions;
  f.loser.winningSide = 1;
  abstains(f);
  delete f.loser.winningSide;
  f.matches.push({ ...f.loser, matchUpId: 'other-loser-holder' });
  abstains(f);
});

it('requires the projected match to exist for an envelope and accounts for newly unplayable scheduled holders', () => {
  const f = capturedFrame();
  const stored = f.projected(f.root.matchUpId);
  const projected = f.input.working.matchUpsMap.drawMatchUps;
  const i = projected.indexOf(stored);
  projected.splice(i, 1);
  abstains(f, 'unresolved notice entity');
  projected.splice(i, 0, stored);
  const other = projected.find((m) => m.matchUpId !== f.root.matchUpId && m.matchUpStatus === TO_BE_PLAYED)!;
  Object.assign(other, { matchUpStatus: 'BYE', schedule: { scheduledTime: '14:00' } });
  abstains(f, 'scheduled holder newly unplayable');
});

it('uses the explicit cleanup notice after score emission for a newly unscored holder', () => {
  const f = capturedFrame();
  f.input.ops.push({ op: 'clearMatchUpScoredTime', matchUpId: f.winner.matchUpId });
  const e = planSettlementEffects(f.input);
  expect(e.reasons).toEqual([]);
  expect(e.announced!.notices.at(-1)).toMatchObject({
    topic: MODIFY_MATCHUP,
    key: f.winner.matchUpId,
    context: 'reconcileScoredTimes',
    eventId: f.input.event!.eventId,
  });
});

it('requires the occupied intermediate to be sourced and its terminal to have no further stored destination', () => {
  const f = capturedFrame({ advance: true });
  const marks = f.winner.sideExitProvenance;
  delete f.winner.sideExitProvenance;
  abstains(f);
  f.winner.sideExitProvenance = marks;
  f.matches.push({ ...f.terminal, matchUpId: 'next-round', roundNumber: f.terminal.roundNumber! + 1 });
  abstains(f);
});

it('abstains on a repeated identity even when the source is an otherwise eligible double exit', () => {
  const f = capturedFrame();
  f.terminal.matchUpId = f.root.matchUpId;
  abstains(f);
});

it('requires the direct loser and its independent origins to exist in the captured structure', () => {
  const f = capturedFrame({ linked: true });
  const after = f.input.working.matchUpsMap.drawMatchUps;
  after.splice(after.indexOf(f.projected(f.loser.matchUpId)), 1);
  abstains(f);
  const carry = capturedFrame({ produced: true });
  const link = structuredClone(carry.input.drawDefinition.links![0]);
  link.source.structureId = carry.loser.structureId;
  Reflect.deleteProperty(link.source, 'roundNumber');
  carry.input.drawDefinition.links!.push(link);
  abstains(carry);
});

it('abstains on an invalid source link for either kind of withdrawal', () => {
  for (const linked of [false, true]) {
    const f = capturedFrame({ linked });
    const link = structuredClone(capturedFrame({ linked: true }).input.drawDefinition.links![0]);
    link.source.structureId = f.root.structureId;
    Reflect.deleteProperty(link.source, 'roundNumber');
    f.input.drawDefinition.links = [link];
    abstains(f);
    const { drawDefinition, event, tournamentRecord, request } = f.input;
    const before = structuredClone(drawDefinition);
    const observed = setMatchUpStatus({
      drawDefinition,
      event,
      tournamentRecord: tournamentRecord!,
      matchUpId: request.matchUpId!,
      outcome: { matchUpStatus: request.matchUpStatus },
    });
    expect(observed).toMatchObject({ error: { code: INVALID_VALUES.code } });
    expect(drawDefinition).toStrictEqual(before);
    expect(predictSettlement(f.input).effectsComplete).toBe(false);
  }
});

it('requires additional BYE-removal evidence if a first-match loser link serves an entrant with a prior BYE', () => {
  const f = capturedFrame({ produced: true });
  const link = f.input.drawDefinition.links!.find(
    (l) =>
      l.source.structureId === f.root.structureId &&
      l.source.roundNumber === f.root.roundNumber &&
      l.linkType === 'LOSER',
  )!;
  link.linkCondition = FIRST_MATCHUP;
  expect(planSettlementEffects(f.input).reasons).toEqual([]);
  const losing = f.root.sides!.find((s) => s.sideNumber !== f.root.winningSide)!;
  const earlier = f.matches.find(
    (m) =>
      m.structureId === f.root.structureId &&
      (m.roundNumber ?? 0) < f.root.roundNumber! &&
      m.drawPositions?.includes(losing.drawPosition),
  )!;
  earlier.matchUpStatus = 'BYE';
  delete earlier.winningSide;
  abstains(f);
});
