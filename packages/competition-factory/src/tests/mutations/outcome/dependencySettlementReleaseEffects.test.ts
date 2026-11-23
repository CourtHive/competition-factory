import { recordedNotice, withNoticeMarks } from '@Mutate/matchUps/outcome/plan/recordedDiff';
import { withdrawnAwardRelease } from '@Mutate/matchUps/outcome/settlement/release';
import { planSettlementEffects } from '@Mutate/matchUps/outcome/settlement/effects';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { chooseRoute } from '@Mutate/matchUps/outcome/route';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import {
  getNoticeBuffer,
  getOutcomePipeline,
  setNoticeBuffer,
  setOutcomePipeline,
  setSubscriptions,
} from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { withCapturedClock, observeClockReadings } from '@Tools/clock';
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER, TO_BE_PLAYED, COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  UPDATE_INCONTEXT_MATCHUP,
  MODIFY_MATCHUP,
  MODIFY_DRAW_DEFINITION,
  MODIFY_POSITION_ASSIGNMENTS,
} from '@Constants/topicConstants';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, afterEach } from 'vitest';

const entry = getOutcomePipeline();
afterEach(() => {
  setOutcomePipeline(entry);
  setSubscriptions({ subscriptions: {} });
  setNoticeBuffer([]);
});

function occupiedCarry(drawType: string, drawSize = 8, occupied = true) {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0],
    drawDefinition = event.drawDefinitions[0];
  const context = { drawDefinition, event, tournamentRecord };
  const main = drawDefinition.structures[0].matchUps;
  const root = main.find((m) => m.roundNumber === 1 && m.roundPosition === 1);
  const paired = main.find((m) => m.roundNumber === 1 && m.roundPosition === 2);
  const played = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 }).outcome;
  for (const [matchUpId, outcome] of [
    ...(occupied ? [[paired.matchUpId, played]] : []),
    [root.matchUpId, { matchUpStatus: WALKOVER, winningSide: 1 }],
  ]) {
    expect(setMatchUpStatus({ ...context, matchUpId, outcome, propagateExitStatus: true })).toMatchObject({
      success: true,
    });
  }
  const request: OutcomeRequest = {
    matchUpId: root.matchUpId,
    matchUpStatus: TO_BE_PLAYED,
    flags: { propagateExitStatus: true, propagateRetirementAsExit: false },
  };
  return { ...context, request };
}

const subscriptions = [UPDATE_INCONTEXT_MATCHUP, MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS];

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, subscribed: true, drawSize: 8 },
  { drawType: FEED_IN_CHAMPIONSHIP, subscribed: false, drawSize: 16 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, subscribed: true, drawSize: 8 },
  { drawType: FEED_IN_CHAMPIONSHIP, subscribed: true, drawSize: 8, imported: true },
])(
  'withdraws the occupied award on $drawType $drawSize with subscriptions $subscribed',
  ({ drawType, subscribed, drawSize, imported }) => {
    const ctx = occupiedCarry(drawType, drawSize);
    if (imported) {
      const map = getMatchUpsMap(ctx);
      const source = map.drawMatchUps.find((m) => m.matchUpId === ctx.request.matchUpId)!;
      const holder = map.drawMatchUps.find((m) => m.matchUpId === source.loserMatchUpId)!;
      const onward = map.drawMatchUps.find((m) => m.matchUpId === holder.winnerMatchUpId)!;
      // An imported two-position frame can have the opposite order to a generated match. Once
      // one entrant leaves, its survivor's side is determined by its feeder.
      onward.drawPositions!.reverse();
      onward.sideStatusCodes = { 1: 'first-seat', 2: 'second-seat' };
      onward.score = undefined;
      delete onward.winningSide;
    }
    const actual = structuredClone(ctx);
    const topics = subscribed ? subscriptions : [];
    setSubscriptions({ subscriptions: Object.fromEntries(topics.map((t) => [t, () => {}])) });
    setNoticeBuffer([]);
    withCapturedClock((capturedClock) => {
      const args = {
        ...ctx,
        capturedClock,
        topics,
        priorNotices: [],
        tracksModificationMarks: true,
        disableNotifications: false,
      };
      const view = buildOutcomeView({ ...ctx, matchUpsMap: getMatchUpsMap(ctx) });
      const route = chooseRoute(ctx.request, view);
      const release = withdrawnAwardRelease(view, ctx.request, route, ctx.drawDefinition);
      expect(release).toBeDefined();
      const id = release!.onward.matchUpId;
      const original = getMatchUpsMap(ctx).drawMatchUps.find((m) => m.matchUpId === id)!;
      expect(Object.hasOwn(original, 'score')).toBe(!!imported);
      const predicted = predictSettlement(args);
      const observed = withNoticeMarks((read) =>
        withDraftWrites(() => {
          const reads: unknown[] = [],
            errors: unknown[] = [];
          const result = observeClockReadings(
            () => (reading) => reads.push(reading),
            () =>
              setMatchUpStatus({
                ...actual,
                matchUpId: ctx.request.matchUpId!,
                outcome: { matchUpStatus: TO_BE_PLAYED },
                propagateExitStatus: true,
              }),
            errors,
          );
          expect(errors).toEqual([]);
          const notices = getNoticeBuffer()!.map(recordedNotice);
          return { result, announced: [{ op: 'announceRecorded', notices, marks: read() }], readings: reads };
        }),
      );
      const actualOnward = getMatchUpsMap(actual).drawMatchUps.find((m) => m.matchUpId === id)!;
      expect(Object.hasOwn(actualOnward, 'score')).toBe(!!imported);
      if (imported) {
        expect(actualOnward.sideStatusCodes).toStrictEqual({ 1: 'second-seat', 2: 'first-seat' });
        expect(Object.hasOwn(actualOnward, 'winningSide')).toBe(false);
      }
      expect(actualOnward.drawPositions).toEqual(original.drawPositions!.filter((p) => p !== release!.position));
      expect(predicted.drawDefinition).toStrictEqual(actual.drawDefinition);
      expect(predicted.reasons, JSON.stringify(predicted.ops.filter((o) => o.op !== 'stampUpdatedAt'))).toEqual([]);
      expect(predicted.effectsComplete).toBe(true);
      expect(predicted.result).toStrictEqual(observed.result);
      expect(predicted.announced).toStrictEqual(observed.announced);
      expect(predicted.readings).toStrictEqual(observed.readings);
      const working = {
        drawDefinition: predicted.drawDefinition,
        matchUpsMap: getMatchUpsMap({ drawDefinition: predicted.drawDefinition }),
      };
      // A generic score-removing operation cannot account for the release of this position alone.
      const ops = predicted.ops.map((op) =>
        op.op === 'setMatchUpDrawPositions' && op.matchUpId === id ? { ...op, clearsScore: true as const } : op,
      );
      expect(planSettlementEffects({ ...args, view, working, route, release, ops }).announced).toBeUndefined();
    });
  },
);

it('leaves a scored onward holder or an unrelated second relay outside the withdrawal proof', () => {
  const ctx = occupiedCarry(FEED_IN_CHAMPIONSHIP);
  const view = buildOutcomeView({ ...ctx, matchUpsMap: getMatchUpsMap(ctx) });
  const route = chooseRoute(ctx.request, view);
  const read = () => withdrawnAwardRelease(view, ctx.request, route, ctx.drawDefinition);
  const release = read()!;
  expect(release).toBeDefined();
  release.onward.matchUpStatus = COMPLETED;
  expect(read()).toBeUndefined();
  release.onward.matchUpStatus = TO_BE_PLAYED;
  view.inContextDrawMatchUps!.push({ ...release.onward, matchUpId: 'second-onward-holder' });
  expect(read()).toBeUndefined();
});

it.each([false, true])(
  'orders the removal, score and redirected placements on winner reversal (occupied award %s)',
  (occupied) => {
    const ctx = occupiedCarry(FEED_IN_CHAMPIONSHIP, 8, occupied);
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 6-1', winningSide: 2 }).outcome;
    const request: OutcomeRequest = {
      matchUpId: ctx.request.matchUpId,
      winningSide: 2,
      score: outcome.score,
      flags: ctx.request.flags,
    };
    const actual = structuredClone(ctx);
    setSubscriptions({ subscriptions: Object.fromEntries(subscriptions.map((t) => [t, () => {}])) });
    setNoticeBuffer([]);
    withCapturedClock((capturedClock) => {
      const predicted = predictSettlement({
        ...ctx,
        request,
        capturedClock,
        topics: subscriptions,
        priorNotices: [],
        tracksModificationMarks: true,
        disableNotifications: false,
      });
      const observed = withNoticeMarks((read) =>
        withDraftWrites(() => {
          const readings: unknown[] = [],
            errors: unknown[] = [];
          const result = observeClockReadings(
            () => (r) => readings.push(r),
            () =>
              setMatchUpStatus({
                ...actual,
                matchUpId: request.matchUpId!,
                outcome: { winningSide: 2, score: outcome.score },
                propagateExitStatus: true,
              }),
            errors,
          );
          expect(errors).toEqual([]);
          return {
            result,
            readings,
            announced: [{ op: 'announceRecorded', notices: getNoticeBuffer()!.map(recordedNotice), marks: read() }],
          };
        }),
      );
      expect(predicted.drawDefinition).toStrictEqual(actual.drawDefinition);
      expect(predicted.reasons).toEqual([]);
      expect(predicted.result).toStrictEqual(observed.result);
      expect(predicted.readings).toStrictEqual(observed.readings);
      expect(predicted.announced).toStrictEqual(observed.announced);
    });
  },
);
