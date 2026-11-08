import { getDeciderSnapshot, getDeciderTriggers } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  COMPLETED,
  DEAD_RUBBER,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
} from '@Constants/matchUpStatusConstants';
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
const score = {
  sets: [
    { side1Score: 6, side2Score: 3, setNumber: 1, winningSide: 1 },
    { side1Score: 6, side2Score: 3, setNumber: 2, winningSide: 1 },
  ],
};
afterEach(() => {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock();
});

function prepare(finalWinner: number, playDecider = false) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  setClock('2026-11-08T10:00:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId: 'd' }],
    nonRandom: 7001,
    setState: true,
  });
  const all = (): any[] => tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  for (let guard = 0; guard < 50; guard++) {
    const next = all()
      .filter((m) => m.structureName !== 'Decider' && m.matchUpStatus === TO_BE_PLAYED)
      .filter((m) => m.sides?.filter((s: any) => s.participantId).length === 2)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition)[0];
    if (!next) break;
    const winningSide = next.structureName === 'Main' && next.roundNumber === 4 ? finalWinner : 1;
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: next.matchUpId, outcome: { winningSide } }).success,
    ).toBe(true);
  }
  const final = all().find((m) => m.structureName === 'Main' && m.roundNumber === 4);
  const decider = all().find((m) => m.structureName === 'Decider');
  expect(final.winningSide).toBe(finalWinner);
  expect(decider.matchUpStatus).toBe(finalWinner === 1 ? DEAD_RUBBER : TO_BE_PLAYED);
  if (playDecider) {
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: decider.matchUpId,
        outcome: { winningSide: 1, matchUpStatus: COMPLETED, score },
      }).success,
    ).toBe(true);
  }
  return { record: structuredClone(tournamentEngine.getTournament().tournamentRecord), final, decider };
}

function replay(mode: OutcomePipelineMode, record: any, matchUpId: string, outcome: any, options: any = {}) {
  setOutcomePipeline('v1');
  setSubscriptions({ subscriptions: {} });
  tournamentEngine.setState(structuredClone(record));
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
  setOutcomePipeline(mode);
  writes.count = 0;
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    drawId: 'd',
    matchUpId,
    outcome,
    allowChangePropagation: true,
    ...options,
  }) as any;
  return {
    result,
    notices,
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    writes: writes.count,
  };
}

for (const action of ['clear-unneeded', 'play-needed']) {
  it(`owns the decider's own ${action} without triggering reconciliation`, () => {
    const prepared = prepare(action === 'clear-unneeded' ? 1 : 2);
    const outcome =
      action === 'clear-unneeded'
        ? { matchUpStatus: TO_BE_PLAYED, winningSide: undefined }
        : { matchUpStatus: COMPLETED, winningSide: 1, score };
    const reference = replay('v1', prepared.record, prepared.decider.matchUpId, outcome);
    expect(reference.result.success).toBe(true);
    expect(reference.writes).toBeGreaterThan(0);
    expect(reference.notices.length).toBeGreaterThan(0);
    const owned = replay('v2', prepared.record, prepared.decider.matchUpId, outcome);
    expect(owned).toEqual({ ...reference, writes: 0 });
    expect(replay('differential', prepared.record, prepared.decider.matchUpId, outcome)).toEqual(reference);
  });
}

for (const action of ['enable-needed', 'disable-unneeded', 'destroy-played']) {
  it(`retains actual decider work: ${action}`, () => {
    const prepared = prepare(action === 'enable-needed' ? 1 : 2, action === 'destroy-played');
    const outcome = { winningSide: action === 'enable-needed' ? 2 : 1 };
    const reference = replay('v1', prepared.record, prepared.final.matchUpId, outcome);
    expect(reference.result.success).toBe(true);
    expect(reference.writes).toBeGreaterThan(0);
    expect(replay('v2', prepared.record, prepared.final.matchUpId, outcome)).toEqual(reference);
    expect(replay('differential', prepared.record, prepared.final.matchUpId, outcome)).toEqual(reference);
    const stored = JSON.parse(reference.record)
      .events[0].drawDefinitions[0].structures.flatMap((s: any) => s.matchUps ?? [])
      .find((m: any) => m.matchUpId === prepared.decider.matchUpId);
    expect(stored.matchUpStatus).toBe(action === 'enable-needed' ? TO_BE_PLAYED : DEAD_RUBBER);
    expect(stored.winningSide).toBeUndefined();
    expect(stored.score?.sets ?? []).toEqual([]);
  });
}

it('selects a foreign cascade with unchanged final winner, but preserves a mutation of the decider', () => {
  const prepared = prepare(1);
  const draw = prepared.record.events[0].drawDefinitions[0];
  const finalsBefore = getDeciderFinals(draw);
  const deciderSnapshotBefore = getDeciderSnapshot(draw);
  const decider = draw.structures
    .flatMap((s: any) => s.matchUps ?? [])
    .find((m: any) => m.matchUpId === prepared.decider.matchUpId);
  decider.matchUpStatus = TO_BE_PLAYED;
  const args = { drawDefinition: draw, finalsBefore, deciderSnapshotBefore };
  expect(getDeciderTriggers({ ...args, mutatedMatchUpId: 'foreign-source' })).toEqual([
    { matchUpId: prepared.final.matchUpId, winningSideBefore: 1, deciderChanged: true },
  ]);
  expect(getDeciderTriggers({ ...args, mutatedMatchUpId: decider.matchUpId })).toEqual([]);
  expect(getDeciderTriggers({ ...args, finalsBefore: new Map(), mutatedMatchUpId: 'foreign-source' })).toEqual([]);
});

it('keeps stored final order and selects changed winners independently of the mutated decider', () => {
  const prepared = prepare(1);
  const draw = prepared.record.events[0].drawDefinitions[0];
  const structure = draw.structures.find((s: any) =>
    s.matchUps?.some((m: any) => m.matchUpId === prepared.final.matchUpId),
  );
  const final = structure.matchUps.find((m: any) => m.matchUpId === prepared.final.matchUpId);
  const peer = { ...structuredClone(final), matchUpId: 'second-final' };
  structure.matchUps.unshift(peer);
  const finalsBefore = getDeciderFinals(draw);
  const deciderSnapshotBefore = getDeciderSnapshot(draw);
  final.winningSide = 2;
  peer.winningSide = 2;
  expect(
    getDeciderTriggers({
      drawDefinition: draw,
      finalsBefore,
      deciderSnapshotBefore,
      mutatedMatchUpId: prepared.decider.matchUpId,
    }),
  ).toEqual([
    { matchUpId: peer.matchUpId, winningSideBefore: 1, deciderChanged: false },
    { matchUpId: final.matchUpId, winningSideBefore: 1, deciderChanged: false },
  ]);
});

for (const allowChangePropagation of [false, true]) {
  it(`preserves foreign-cascade notices with an unchanged final winner, propagation ${allowChangePropagation}`, () => {
    setOutcomePipeline('v1');
    setSubscriptions({ subscriptions: {} });
    setClock('2026-11-08T10:00:00.000Z');
    expect(
      prepareDraw(
        { drawType: DOUBLE_ELIMINATION, propagateExitStatus: true, participantsCount: 5, seed: 20012480, drawSize: 8 },
        'd',
      ),
    ).toBe(true);
    const at = (key: string): any => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return tournamentEngine
        .allDrawMatchUps({ drawId: 'd', inContext: true })
        .matchUps.find(
          (m: any) =>
            m.structureName === structureName &&
            m.roundNumber === Number(roundNumber) &&
            m.roundPosition === Number(roundPosition),
        );
    };
    const lead: [string, any][] = [
      ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|2', { winningSide: 1 }],
      ['Main|2|1', { winningSide: 2 }],
      ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ];
    for (const [key, outcome] of lead)
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: at(key).matchUpId,
          outcome,
          propagateExitStatus: true,
        }).success,
      ).toBe(true);
    const final = at('Main|4|1');
    const decider = at('Decider|1|1');
    expect(final.winningSide).toBe(2);
    expect(decider.matchUpStatus).toBe(DEAD_RUBBER);
    const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const matchUpId = at('Backdraw|3|1').matchUpId;
    const outcome = { matchUpStatus: DOUBLE_WALKOVER };
    const options = { propagateExitStatus: true, allowChangePropagation };
    const reference = replay('v1', record, matchUpId, outcome, options);
    expect(reference.result.success).toBe(true);
    expect(reference.writes).toBeGreaterThan(0);
    expect(reference.notices.length).toBeGreaterThan(0);
    const stored = JSON.parse(reference.record).events[0].drawDefinitions[0].structures.flatMap(
      (s: any) => s.matchUps ?? [],
    );
    expect(stored.find((m: any) => m.matchUpId === final.matchUpId).winningSide).toBe(2);
    expect(stored.find((m: any) => m.matchUpId === decider.matchUpId).matchUpStatus).toBe(DEAD_RUBBER);
    expect(replay('v2', record, matchUpId, outcome, options)).toEqual(reference);
    expect(replay('differential', record, matchUpId, outcome, options)).toEqual(reference);
  });
}
