import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { recordWholeCall } from '@Mutate/matchUps/outcome/plan/recordedCall';
import { addNotice, deleteNotices, setSubscriptions } from '@Global/state/globalState';
import { matchUpsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants and types
import type { BuildViewArgs, OutcomeView, RecordCopy } from '@Mutate/matchUps/outcome/types';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

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

const plain = { isTeam: false } as OutcomeView;

function prepare(drawType?: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize: 8, ...(drawType ? { drawType } : {}) }],
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
    'the result holds an object of the copy',
    (copy) => {
      first(copy).notes = 'written';
      return { ...SUCCESS, context: { matchUp: first(copy) } };
    },
  ],
];

it.each(refused)('is not made where %s', (_label, writer) => {
  const { args, before } = prepare();
  const writeOnCopy = (copy: RecordCopy) => writer(copy, args) as ReturnType<NonNullable<BuildViewArgs['writeOnCopy']>>;
  expect(recordWholeCall({ ...args, writeOnCopy }, plain)).toBeUndefined();
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});

it('is not made for a TEAM dual or line, or with no writer', () => {
  const { args } = prepare();
  const writeOnCopy = () => ({ ...SUCCESS });
  expect(recordWholeCall({ ...args, writeOnCopy }, { isTeam: true } as OutcomeView)).toBeUndefined();
  expect(recordWholeCall({ ...args, writeOnCopy }, { line: {} } as OutcomeView)).toBeUndefined();
  expect(recordWholeCall(args, plain)).toBeUndefined();
});

it("is not made where v1 writes a round robin group's own fields", () => {
  const { args, before } = prepare(ROUND_ROBIN);
  const writeOnCopy = (copy: RecordCopy) => {
    const group = structuresOf(copy.drawDefinition.structures?.[0])?.[0];
    if (group) group.structureName = 'renamed';
    return { ...SUCCESS };
  };
  expect(recordWholeCall({ ...args, writeOnCopy }, plain)).toBeUndefined();
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});

it("puts the call's own parameters back where v1 wrote into them, and is not made", () => {
  const { args } = prepare();
  const score = args.request.score;
  const sets = score?.sets;
  const writeOnCopy = () => {
    (args.request.score as { sets?: unknown[] }).sets?.push({ setNumber: 2 });
    return { ...SUCCESS };
  };
  expect(recordWholeCall({ ...args, writeOnCopy }, plain)).toBeUndefined();
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
  const recorded = recordWholeCall({ ...args, writeOnCopy }, plain);
  expect(recorded?.written).toBe(written);
  expect(recorded?.ops.map((op) => op.op)).toEqual(['replaceMatchUp', 'announceRecorded']);
  expect(canonicalJson(args.tournamentRecord)).toEqual(before);
});
