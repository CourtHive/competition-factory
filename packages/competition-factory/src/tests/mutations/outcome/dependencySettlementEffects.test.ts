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
import { observeClockReadings, withCapturedClock } from '@Tools/clock';
import { FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED, DOUBLE_WALKOVER, COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, afterEach } from 'vitest';

const entryMode = getOutcomePipeline();
afterEach(() => {
  setOutcomePipeline(entryMode);
  setSubscriptions({ subscriptions: {} });
  setNoticeBuffer([]);
});

function clearing(linked = false, partialScore = false, advance = false) {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawId: 'effects', drawType: linked ? FEED_IN_CHAMPIONSHIP : SINGLE_ELIMINATION }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const root = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 1);
  const matchUpId = root.matchUpId;
  const context = { tournamentRecord, event, drawDefinition };
  const outcome = linked
    ? {
        ...mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 }).outcome,
        matchUpStatus: COMPLETED,
      }
    : { matchUpStatus: DOUBLE_WALKOVER };
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
  expect(setMatchUpStatus({ ...context, matchUpId, outcome })).toMatchObject({ success: true });
  if (advance) {
    // Older records can carry just the produced exit. The occupied winning seat and its onward
    // receiver still witness the advancement independently of the optional arrival marker.
    const awarded = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === root.winnerMatchUpId);
    expect(awarded.winningSide).toBeTruthy();
    delete awarded.sideExitProvenance[awarded.winningSide];
  }
  const request: OutcomeRequest = {
    matchUpId,
    flags: { propagateRetirementAsExit: false },
    matchUpStatus: partialScore ? IN_PROGRESS : TO_BE_PLAYED,
    ...(partialScore ? { score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } } : {}),
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
])('compares the real clear for %o', ({ subscribed, linked, partialScore, advance }) => {
  const ctx = clearing(linked, partialScore, advance);
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
    expect(route).toBe(linked ? 'remove-directed' : clearRoute);
    expect(prediction.reasons).toEqual([]);
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
