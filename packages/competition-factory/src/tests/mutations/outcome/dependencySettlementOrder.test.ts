import { recordedNotice, withNoticeMarks } from '@Mutate/matchUps/outcome/plan/recordedDiff';
import { withdrawalChain } from '@Mutate/matchUps/outcome/settlement/withdrawalChain';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import {
  type Notice,
  getNoticeBuffer,
  getOutcomePipeline,
  getProvider,
  setNoticeBuffer,
  setOutcomePipeline,
  setSubscriptions,
} from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { withCapturedClock, observeClockReadings } from '@Tools/clock';
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  MODIFY_MATCHUP,
  MODIFY_DRAW_DEFINITION,
  UPDATE_INCONTEXT_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
} from '@Constants/topicConstants';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

const entry = getOutcomePipeline();
afterEach(() => {
  vi.restoreAllMocks();
  setOutcomePipeline(entry);
  setSubscriptions({ subscriptions: {} });
  setNoticeBuffer([]);
});

function directionalCarry(
  drawType: string,
  drawSize: number,
  occupied: boolean,
  status: typeof DEFAULTED | typeof WALKOVER,
) {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0],
    drawDefinition = event.drawDefinitions[0];
  const ctx = { drawDefinition, tournamentRecord, event };
  const first = drawDefinition.structures[0].matchUps.filter((m) => m.roundNumber === 1);
  const root = first.find((m) => m.roundPosition === 1);
  if (occupied) {
    const paired = first.find((m) => m.roundPosition === 2);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 });
    expect(setMatchUpStatus({ ...ctx, matchUpId: paired.matchUpId, outcome })).toMatchObject({ success: true });
  }
  expect(
    setMatchUpStatus({
      ...ctx,
      matchUpId: root.matchUpId,
      outcome: { matchUpStatus: status, winningSide: 1 },
      propagateExitStatus: true,
    }),
  ).toMatchObject({ success: true });
  const request: OutcomeRequest = {
    matchUpId: root.matchUpId,
    matchUpStatus: TO_BE_PLAYED,
    flags: { propagateExitStatus: true, propagateRetirementAsExit: false },
  };
  const view = buildOutcomeView({ ...ctx, request, matchUpsMap: getMatchUpsMap(ctx) });
  const source = view.inContextDrawMatchUps!.find((m) => m.matchUpId === root.matchUpId)!;
  return { ctx, request, view, source };
}

it.each([
  { drawType: 'COMPASS', drawSize: 16, depth: 3, occupied: false, subscribed: true, status: WALKOVER },
  { drawType: 'OLYMPIC', drawSize: 8, depth: 2, occupied: false, subscribed: true, status: DEFAULTED },
  { drawType: 'COMPASS', drawSize: 8, depth: 2, occupied: false, subscribed: false, status: WALKOVER },
] as const)(
  'withdraws $depth linked claims in order ($drawType, occupied=$occupied, subscribed=$subscribed)',
  ({ drawType, drawSize, depth, occupied, subscribed, status }) => {
    const { ctx, request, source, view } = directionalCarry(drawType, drawSize, occupied, status);
    const chain = withdrawalChain(view, ctx.drawDefinition, source);
    expect(chain).toHaveLength(depth);
    expect(chain!.every((entry) => !entry.release)).toBe(true);
    const actual = structuredClone(ctx);
    const topics = subscribed
      ? [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, UPDATE_INCONTEXT_MATCHUP, MODIFY_POSITION_ASSIGNMENTS]
      : [];
    setSubscriptions({ subscriptions: Object.fromEntries(topics.map((t) => [t, () => {}])) });
    setNoticeBuffer([]);
    withCapturedClock((capturedClock) => {
      const predicted = predictSettlement({
        ...ctx,
        request,
        capturedClock,
        topics,
        priorNotices: [],
        tracksModificationMarks: true,
        disableNotifications: false,
      });
      const provider: { addNotice(notice: Notice): unknown } = getProvider();
      const publication = vi.spyOn(provider, 'addNotice');
      const observed = withNoticeMarks((read) =>
        withDraftWrites(() => {
          const readings: unknown[] = [],
            errors: unknown[] = [];
          const result = observeClockReadings(
            () => (r) => readings.push(r),
            () =>
              setMatchUpStatus({
                ...actual,
                matchUpId: source.matchUpId,
                outcome: { matchUpStatus: TO_BE_PLAYED },
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
      if (subscribed) {
        const publications = publication.mock.calls.flatMap(([n]) =>
          n.payload?.context ? [[n.payload.context, n.payload.matchUp.matchUpId]] : [],
        );
        const winnerPosition = source.sides!.find((s) => s.sideNumber === source.winningSide)!.drawPosition;
        const ordered = [
          ['modifyMatchUpScore', source.matchUpId],
          ...chain!.map(({ holder }) => ['withdrawProducedExits', holder.matchUpId]),
          [`removeSubsequentDrawPosition-${winnerPosition}`, source.winnerMatchUpId],
        ];
        expect(publications.slice(0, ordered.length)).toStrictEqual(ordered);
        expect(publications.slice(ordered.length).map(([name]) => name)).toEqual(
          Array(depth).fill('reconcileScoredTimes'),
        );
      }
      expect(predicted.reasons).toEqual([]);
      expect(predicted.drawDefinition).toStrictEqual(actual.drawDefinition);
      expect(predicted.result).toStrictEqual(observed.result);
      expect(predicted.announced).toStrictEqual(observed.announced);
      expect(predicted.readings).toStrictEqual(observed.readings);
    });
  },
);

it('keeps a clear with an active downstream award in the separate refusal path', () => {
  const { ctx, source, request, view } = directionalCarry('OLYMPIC', 8, true, DEFAULTED);
  const chain = withdrawalChain(view, ctx.drawDefinition, source)!;
  expect(chain).toHaveLength(2);
  expect(chain[0].release).toBeDefined();
  const before = structuredClone(ctx.drawDefinition);
  const predicted = predictSettlement({ ...ctx, request });
  const result = setMatchUpStatus({
    ...ctx,
    matchUpId: source.matchUpId,
    outcome: { matchUpStatus: TO_BE_PLAYED },
    propagateExitStatus: true,
  });
  expect(result.error).toBeDefined();
  expect(predicted.result?.error).toEqual(result.error);
  expect(predicted.reasons).toEqual(['refusal-effects']);
  expect(predicted.announced).toBeUndefined();
  expect(ctx.drawDefinition).toStrictEqual(before);
});

it('requires the actual losing carrier and an unambiguous onward assignment at every hop', () => {
  const { ctx, view, source } = directionalCarry('COMPASS', 16, false, WALKOVER);
  const read = () => withdrawalChain(view, ctx.drawDefinition, source);
  const chain = read()!;
  expect(chain).toHaveLength(3);
  const second = chain[1].holder;
  const marks = second.sideExitProvenance!;
  // The linked losing participant is still assigned there. Without the mark their position
  // could still be removed by the separate inert-placement walk.
  delete second.sideExitProvenance;
  expect(read()).toBeUndefined();
  second.sideExitProvenance = marks;
  const mark = Object.values(marks)[0];
  mark.previousMatchUpStatus = DEFAULTED;
  expect(read()).toBeUndefined();
  mark.previousMatchUpStatus = WALKOVER;
  expect(read()).toHaveLength(3);
  const side = second.sides!.find((s) => s.drawPosition === chain[1].position)!;
  side.participantId = 'independent-entrant';
  expect(read()).toBeUndefined();
});
