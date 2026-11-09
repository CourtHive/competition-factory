import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { predictSettleWork } from '@Mutate/matchUps/outcome/settleWork';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { DEFAULTED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

const writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      writes.count++;
      return actual.setMatchUpState(...args);
    },
  };
});
const topics = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
afterEach(() => {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function prepare(destination: string, deciding: boolean, side = 1) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock('2026-11-08T10:00:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        participantsCount: destination === 'BYE' ? 6 : 8,
        drawType: COMPASS,
        eventType: TEAM,
        drawId: 'd',
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success).toBe(
    true,
  );
  const duals = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.filter((m: any) => m.tieMatchUps && m.structureName === 'East' && m.roundNumber === 1);
  const dual = duals.find((m: any) => m.roundPosition === 2);
  if (destination === 'occupied') {
    const peer = duals.find((m: any) => m.roundPosition === 1);
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: peer.matchUpId, outcome: { winningSide: 1 } })
        .success,
    ).toBe(true);
  }
  if (deciding) {
    for (const line of dual.tieMatchUps.slice(0, 4)) {
      expect(
        tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: line.matchUpId, outcome: { winningSide: side } })
          .success,
      ).toBe(true);
    }
  }
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const current = matchUps.find((m: any) => m.matchUpId === dual.matchUpId);
  expect(current.winningSide).toBeUndefined();
  const destinationMatchUp = matchUps.find((m: any) => m.matchUpId === current.loserMatchUpId);
  expect(destinationMatchUp.structureName).toBe('West');
  const peerSeat = destinationMatchUp.sides.find((s: any) => s.sideNumber === 1);
  expect(!!peerSeat?.bye).toBe(destination === 'BYE');
  expect(!!peerSeat?.participantId).toBe(destination === 'occupied');
  return {
    deciding,
    record: structuredClone(tournamentEngine.getTournament().tournamentRecord),
    matchUpId: dual.tieMatchUps[deciding ? 4 : 0].matchUpId,
    dualId: dual.matchUpId,
  };
}

function play(mode: OutcomePipelineMode, prepared: ReturnType<typeof prepare>, status: any, side: number) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(prepared.record));
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
  setClock('2026-11-08T10:01:00.000Z');
  writes.count = 0;
  setOutcomePipeline(mode);
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    drawId: 'd',
    matchUpId: prepared.matchUpId,
    propagateExitStatus: true,
    propagateRetirementAsExit: true,
    outcome: { matchUpStatus: status, winningSide: side },
  }) as any;
  return {
    result,
    notices,
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    writes: writes.count,
  };
}

it.each(['empty', 'BYE', 'occupied'])(
  'owns line exits beside a %s loser destination, preserving delivered traces',
  (destination) => {
    for (const deciding of [false, true])
      for (const status of [WALKOVER, DEFAULTED, RETIRED])
        for (const side of [1, 2]) {
          const prepared = prepare(destination, deciding, side);
          const v1 = play('v1', prepared, status, side);
          expect(v1.result.success).toBe(true);
          const { matchUp: dual } = tournamentEngine.findMatchUp({ drawId: 'd', matchUpId: prepared.dualId });
          expect(dual.winningSide).toBe(deciding ? side : undefined);
          if (deciding) expect(dual.matchUpStatus).toBe('COMPLETED');
          expect(v1.writes).toBeGreaterThan(0);
          expect(v1.notices.length).toBeGreaterThan(0);
          const v2 = play('v2', prepared, status, side);
          expect(v2.writes).toBe(0);
          expect({ ...v2, writes: 0 }).toEqual({ ...v1, writes: 0 });
          expect(play('differential', prepared, status, side).result.success).toBe(true);
        }
  },
);

it('exempts only the positively identified own line and still evaluates every individual predicate', () => {
  const prepared = prepare('empty', false);
  const tournamentRecord = prepared.record;
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
    inContext: true,
  }).matchUps!;
  const working = createWorkingView({ inContextDrawMatchUps, tournamentRecord, drawDefinition, matchUpsMap, event });
  const predict = (target = prepared.matchUpId, another = false) =>
    predictSettleWork({
      tournamentRecord,
      drawDefinition,
      inContextDrawMatchUps,
      working,
      event,
      matchUpId: target,
      loserLinked: true,
      propagateExitStatus: true,
      ops: [
        { op: 'setMatchUpResult', matchUpId: prepared.matchUpId, matchUpStatus: WALKOVER, winningSide: 1 },
        ...(another
          ? [
              {
                op: 'setMatchUpResult' as const,
                matchUpId: prepared.dualId,
                matchUpStatus: 'DEFAULTED' as const,
                winningSide: 1 as const,
              },
            ]
          : []),
      ],
    });
  expect(predict()).toEqual([]);
  expect(predict(prepared.dualId)).toHaveLength(12);
  expect(predict('absent')).toHaveLength(12);
  expect(predict(prepared.matchUpId, true)).toHaveLength(12);
  const own = inContextDrawMatchUps.find((m) => m.matchUpId === prepared.matchUpId)!;
  const parent = own.matchUpTieId;
  delete own.matchUpTieId;
  expect(predict()).toHaveLength(12);
  own.matchUpTieId = parent;
  const collectionId = own.collectionId;
  delete own.collectionId;
  expect(predict()).toHaveLength(12);
  own.collectionId = collectionId;
  const dual = inContextDrawMatchUps.find((m) => m.matchUpId === parent)!;
  const lines = dual.tieMatchUps;
  dual.tieMatchUps = lines?.filter((line) => line.matchUpId !== own.matchUpId);
  expect(predict()).toHaveLength(12);
  dual.tieMatchUps = lines;
  const later = working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId !== prepared.dualId)!;
  later.matchUpStatus = TO_BE_PLAYED;
  later.schedule = { scoredTime: '2026-11-08T10:00:00.000Z' };
  expect(predict()).toContain('reconcileScoredTimes');
});
