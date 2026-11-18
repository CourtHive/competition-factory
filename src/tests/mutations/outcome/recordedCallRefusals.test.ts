import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { recordWholeCall } from '@Mutate/matchUps/outcome/plan/recordedCall';
import { applyOutcomeOps } from '@Mutate/matchUps/outcome/ops';
import { addNotice, deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants and types
import type { BuildViewArgs, RecordCopy } from '@Mutate/matchUps/outcome/types';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import type { MatchUp, Structure } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * A whole-call recording (`outcome/plan/recordedCall.ts`) is made only where v1's run on the copy is carried whole by
 * the recorded ops. Each refusal here is one the recorder makes itself, asked of it directly with a writer in v1's
 * place; whatever the writer did, the stored record is as it was. `planOutcome` asks for one where its planners abstain
 * for a reason a recording answers (`RECORDED_WHOLE`: `recordedCallReasons.test.ts`), and drops one a settle predicate
 * still finds work on: the fixtures' ownership flags hold those (`directionFixtures.ts`).
 */

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  deleteNotices();
});

function prepare(drawType?: string, eventType?: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId: 'd', drawSize: 8, ...(drawType ? { drawType } : {}), ...(eventType ? { eventType } : {}) },
    ],
    setState: true,
  });
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const request = { matchUpId: 'm', flags: {}, score: { sets: [{ setNumber: 1 }] } };
  const args = { tournamentRecord, event, drawDefinition, request } as unknown as BuildViewArgs;
  return { args, before: canonicalJson(tournamentRecord) };
}

const first = (copy: RecordCopy): MatchUp => matchUpsOf(copy.drawDefinition.structures?.[0])?.[0] as MatchUp;

type Writer = (copy: RecordCopy, args: BuildViewArgs) => unknown;
const refused: [string, Writer][] = [
  ['the call cannot be run on a copy', () => undefined],
  ['v1 returns an error', () => ({ error: { code: 'ERR', message: 'refused' } })],
  ['v1 stops its forward settle at the bound', () => ({ ...SUCCESS, warnings: [{ code: FORWARD_SETTLE_EXHAUSTED }] })],
  [
    'v1 throws',
    () => {
      throw new Error('thrown by the test');
    },
  ],
  [
    'v1 writes outside the draw',
    (copy) => {
      (copy.tournamentRecord as { notes?: string }).notes = 'outside';
      return { ...SUCCESS };
    },
  ],
  [
    'v1 adds a matchUp',
    (copy) => {
      matchUpsOf(copy.drawDefinition.structures?.[0])?.push({ matchUpId: 'added' } as MatchUp);
      return { ...SUCCESS };
    },
  ],
  [
    'v1 buffers a notice apply could not raise again',
    (copy) => {
      first(copy).notes = 'written';
      setSubscriptions({ subscriptions: { unrecordedTopic: () => undefined } });
      addNotice({ topic: 'unrecordedTopic', key: 'k', payload: { tournamentId: 't' } });
      return { ...SUCCESS };
    },
  ],
  [
    "v1 leaves a scored time on a matchUp with no score, which the plan's own cleanup would clear",
    (copy) => {
      first(copy).schedule = { scoredTime: '2026-11-16T10:00:00.000Z' };
      return { ...SUCCESS };
    },
  ],
  [
    'the result holds an object the run changed and took out of the draw',
    (copy) => {
      const range = first(copy).finishingPositionRange as { loser: number[] };
      range.loser = [9, 9];
      delete first(copy).finishingPositionRange;
      return { ...SUCCESS, context: { range } };
    },
  ],
  [
    // the event holds the draw, so it reads as changed wherever the draw is
    'the result holds an object outside the draw that does not read as its stored counterpart',
    (copy) => {
      first(copy).notes = 'written';
      return { ...SUCCESS, context: { event: copy.event } };
    },
  ],
];

it.each(refused)('is not made where %s', (_label, writer) => {
  const { args, before } = prepare();
  const writeOnCopy = (copy: RecordCopy) => writer(copy, args) as ReturnType<NonNullable<BuildViewArgs['writeOnCopy']>>;
  expect(recordWholeCall({ ...args, writeOnCopy })).toBeUndefined();
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});

it('is not made with no writer', () => {
  const { args } = prepare();
  expect(recordWholeCall(args)).toBeUndefined();
});

it("carries a round robin group's own fields, the group named as any structure is", () => {
  const { args, before } = prepare(ROUND_ROBIN);
  const groupOf = (draw: RecordCopy['drawDefinition']) => structuresOf(draw.structures?.[0])?.[1] as Structure;
  const writeOnCopy = (copy: RecordCopy) => {
    groupOf(copy.drawDefinition).structureName = 'renamed';
    return { ...SUCCESS };
  };
  const recorded = recordWholeCall({ ...args, writeOnCopy });
  const { structureId } = groupOf(args.drawDefinition as RecordCopy['drawDefinition']);
  expect(recorded?.ops).toMatchObject([{ op: 'replaceStructureState', structureId }, { op: 'announceRecorded' }]);
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);

  // folded, the group is found inside its container and takes the recorded fields; nothing else changes
  const folded = structuredClone(args.drawDefinition) as RecordCopy['drawDefinition'];
  const expected = structuredClone(folded);
  groupOf(expected).structureName = 'renamed';
  expect(applyOutcomeOps(folded, recorded?.ops ?? []).error).toBeUndefined();
  expect(folded).toEqual(expected);
});

it('is not made where v1 adds a round robin group', () => {
  const { args, before } = prepare(ROUND_ROBIN);
  const writeOnCopy = (copy: RecordCopy) => {
    structuresOf(copy.drawDefinition.structures?.[0])?.push({ structureId: 'added' } as Structure);
    return { ...SUCCESS };
  };
  expect(recordWholeCall({ ...args, writeOnCopy })).toBeUndefined();
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});

it("carries a TEAM dual's own fields and each line's by an op of its own, the dual keeping its lines", () => {
  const { args, before } = prepare(undefined, TEAM);
  const writeOnCopy = (copy: RecordCopy) => {
    const dual = first(copy);
    dual.notes = 'the dual';
    (dual.tieMatchUps?.[1] as MatchUp).notes = 'its second line';
    return { ...SUCCESS };
  };
  const recorded = recordWholeCall({ ...args, writeOnCopy });
  const dual = first(args as unknown as RecordCopy);
  const line = dual.tieMatchUps?.[1] as MatchUp;
  expect(recorded?.ops).toMatchObject([
    { op: 'replaceMatchUp', matchUpId: dual.matchUpId, matchUp: { notes: 'the dual' } },
    { op: 'replaceMatchUp', matchUpId: line.matchUpId, matchUp: { notes: 'its second line' } },
    { op: 'announceRecorded' },
  ]);
  // a dual's op says nothing of its lines: a line is written, and stamps, by its own
  const [ofDual] = recorded?.ops ?? [];
  expect(ofDual.op === 'replaceMatchUp' && 'tieMatchUps' in ofDual.matchUp).toEqual(false);
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);

  // folded, the dual keeps the lines it holds, the very objects, and each takes what its op carries
  const folded = structuredClone(args.drawDefinition) as RecordCopy['drawDefinition'];
  const lines = [...(first({ drawDefinition: folded } as RecordCopy).tieMatchUps ?? [])];
  expect(applyOutcomeOps(folded, recorded?.ops ?? []).error).toBeUndefined();
  const written = first({ drawDefinition: folded } as RecordCopy);
  expect(written.notes).toEqual('the dual');
  expect(written.tieMatchUps?.length).toEqual(lines.length);
  expect(written.tieMatchUps?.every((held, at) => held === lines[at])).toEqual(true);
  expect(written.tieMatchUps?.map((held) => held.notes)).toEqual(
    lines.map((_line, at) => (at === 1 ? 'its second line' : undefined)),
  );
});

it('is not made where v1 replaces the list a dual holds its lines in', () => {
  const { args, before } = prepare(undefined, TEAM);
  const writeOnCopy = (copy: RecordCopy) => {
    const dual = first(copy);
    dual.tieMatchUps = [...(dual.tieMatchUps ?? [])];
    return { ...SUCCESS };
  };
  expect(recordWholeCall({ ...args, writeOnCopy })).toBeUndefined();
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});

/**
 * v1 on the copy returns objects of the copy where on the stored record it returns the stored ones. The recorded call
 * returns what v1 returns on the stored record: each object of the copy the result holds is the stored object it was
 * copied from, in the objects the run itself made.
 */
it("returns the stored objects where v1's result holds objects of the copy", () => {
  const { args, before } = prepare();
  const made = { sets: [] as unknown[] };
  const context: Record<string, unknown> = {};
  const writeOnCopy = (copy: RecordCopy) => {
    const matchUp = first(copy);
    // written by the run, and still in the draw
    matchUp.notes = 'written';
    // made by the run, stored and returned: one object in the record and in the result
    matchUp.score = made as MatchUp['score'];
    Object.assign(context, {
      matchUp,
      // not written by the run
      range: matchUp.finishingPositionRange,
      // outside the draw
      participant: copy.tournamentRecord?.participants?.[0],
      // an object the run made, holding one of the copy
      about: { structure: copy.drawDefinition.structures?.[0] },
      score: matchUp.score,
    });
    return { ...SUCCESS, context };
  };
  const recorded = recordWholeCall({ ...args, writeOnCopy });
  const storedDraw = args.drawDefinition as RecordCopy['drawDefinition'];
  const storedMatchUp = first({ drawDefinition: storedDraw } as RecordCopy);
  const about = context.about;
  // the result is the object v1 returned, and the objects the run made are themselves
  expect(recorded?.written.context).toBe(context);
  expect(context.about).toBe(about);
  expect(context.score).toBe(made);
  // the objects of the copy are the stored ones
  expect(context.matchUp).toBe(storedMatchUp);
  expect(context.range).toBe(storedMatchUp.finishingPositionRange);
  expect(context.participant).toBe(args.tournamentRecord?.participants?.[0]);
  expect(context.participant).toBeDefined();
  expect((context.about as { structure: unknown }).structure).toBe(storedDraw.structures?.[0]);
  // nothing is written until the ops are applied: then the stored matchUp is what the result holds, written
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
  expect(applyOutcomeOps(storedDraw, recorded?.ops ?? [], undefined, { bindResultInputs: true }).error).toBeUndefined();
  expect(context.matchUp).toBe(first({ drawDefinition: storedDraw } as RecordCopy));
  expect(storedMatchUp.notes).toEqual('written');
  expect(storedMatchUp.score).toBe(made);
});

it("puts the call's own parameters back where v1 wrote into them, and is not made", () => {
  const { args } = prepare();
  const score = args.request.score;
  const sets = score?.sets;
  const writeOnCopy = () => {
    (args.request.score as { sets?: unknown[] }).sets?.push({ setNumber: 2 });
    return { ...SUCCESS };
  };
  expect(recordWholeCall({ ...args, writeOnCopy })).toBeUndefined();
  expect(args.request.score).toBe(score);
  expect(args.request.score?.sets).toBe(sets);
  expect(args.request.score?.sets).toEqual([{ setNumber: 1 }]);
});

it('returns what v1 changed in the draw as recorded ops, with what it returned, and leaves the stored record', () => {
  const { args, before } = prepare();
  const written = { ...SUCCESS, warnings: [{ code: 'KEPT' }] };
  const writeOnCopy = (copy: RecordCopy) => {
    first(copy).notes = 'written';
    return written;
  };
  const recorded = recordWholeCall({ ...args, writeOnCopy });
  expect(recorded?.written).toBe(written);
  expect(recorded?.ops.map((op) => op.op)).toEqual(['replaceMatchUp', 'announceRecorded']);
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});
