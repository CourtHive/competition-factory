import { replaceTieMatchUpParticipantId } from '@Mutate/matchUps/lineUps/replaceTieMatchUpParticipant';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const fixtures = JSON.parse(
  gunzipSync(readFileSync(new URL('../../../../scripts/ext/f010/refusals.json.gz', import.meta.url))).toString(),
);
const method = 'replaceTieMatchUpParticipantId';
const instant = '2030-01-01T00:00:00.000Z';
afterEach(() => {
  setClock();
  setSchemaWriteMode();
  engine.setState({ tournamentId: 'reset' });
});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freeze(nested);
  }
  return value;
}

for (const { code, initial, directive } of fixtures) {
  it(`refuses ${code} on a recursively frozen governor input`, () => {
    const tournamentRecord = freeze(structuredClone(initial));
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const result = replaceTieMatchUpParticipantId({ ...directive.params, tournamentRecord, event, drawDefinition });
    expect(result.error?.code).toBe(code);
  });
  it.each([true, false])(`keeps the complete record and notices on ${code}, copy=%s`, (copy) => {
    for (const queue of [true, false]) {
      setClock(instant);
      engine.setState(structuredClone(initial), copy);
      const before = JSON.stringify(engine.getTournament().tournamentRecord);
      expect(
        captureNotices(() => {
          const result = queue
            ? engine.executionQueue([structuredClone(directive)], false)
            : engine[method](structuredClone(directive.params));
          expect(result.error?.code).toBe(code);
        }),
      ).toEqual([]);
      expect(JSON.stringify(engine.getTournament().tournamentRecord)).toBe(before);
    }
  });
}

it.each([true, false])(
  'commits the doubles substitution, retires the unused pair and stamps the changed entities, copy=%s',
  (copy) => {
    const fixture = structuredClone(fixtures[1]);
    const record = fixture.initial;
    const params = fixture.directive.params;
    const old = record.participants.find((p) => p.participantId === params.existingParticipantId);
    const [first, partner] = old.individualParticipantIds;
    const team = record.participants.find(
      (p) => p.participantType === 'TEAM' && p.individualParticipantIds.includes(first),
    );
    const replacement = team.individualParticipantIds[2];
    setClock(instant);
    engine.setState(record, copy);
    const args = { ...params, existingParticipantId: first, newParticipantId: replacement, substitution: true };
    let result;
    const notices = captureNotices(() => {
      result = engine[method](args);
    });
    expect(result.success).toBe(true);
    expect(result.participantRemoved).toBe(old.participantId);
    const stored = engine.getTournament().tournamentRecord;
    const draw = stored.events[0].drawDefinitions[0];
    const dual = draw.structures[0].matchUps[0];
    const line = dual.tieMatchUps.find((m) => m.matchUpId === params.tieMatchUpId);
    expect(
      getPairedParticipant({ tournamentRecord: stored, participantIds: [partner, replacement] }).participant
        ?.participantId,
    ).toBe(result.participantAdded);
    expect(stored.participants.some((p) => p.participantId === old.participantId)).toBe(false);
    expect(dual.sides.some((side) => JSON.stringify(side.lineUp) === JSON.stringify(result.modifiedLineUp))).toBe(true);
    expect([draw, draw.structures[0], dual, line].map((entity) => entity.updatedAt)).toEqual(Array(4).fill(instant));
    expect(stored.factory.timeStamp).toBe(Date.parse(instant));
    expect(notices.map((n) => n.topic)).toEqual([
      'modifyDrawDefinition',
      'modifyEventEntries',
      'deleteParticipants',
      'addDrawDefinition',
      'modifyMatchUp',
      'modifyMatchUp',
      'addParticipants',
      'mutations',
    ]);
    expect(notices[2].payload).toEqual({ tournamentId: stored.tournamentId, participantIds: [old.participantId] });
    expect(notices[6].payload).toEqual({
      tournamentId: stored.tournamentId,
      participants: [stored.participants.find((p) => p.participantId === result.participantAdded)],
    });
  },
);

it.each([
  { mode: 'native', prior: true },
  { mode: 'bridge', prior: true },
  { mode: 'legacy', prior: true },
  { mode: 'bridge', prior: false },
  { mode: 'legacy', prior: false },
] as const)('commits the template with schema=$mode and prior extension=$prior', ({ mode, prior }) => {
  const { initial, directive } = structuredClone(fixtures[1]);
  const draw = initial.events[0].drawDefinitions[0];
  const template = draw.lineUps;
  const unrelated = { name: 'unrelated', value: { keep: true } };
  const existing = { name: 'lineUps', value: template };
  if (prior) draw.extensions = [unrelated, existing];
  else delete draw.extensions;
  if (mode === 'legacy' && prior) delete draw.lineUps;
  const old = initial.participants.find((p) => p.participantId === directive.params.existingParticipantId);
  const [first] = old.individualParticipantIds;
  const team = initial.participants.find(
    (p) => p.participantType === 'TEAM' && p.individualParticipantIds.includes(first),
  );
  const replacement = team.individualParticipantIds[2];
  setClock(instant);
  engine.setState(initial, false);
  setSchemaWriteMode(mode);
  const result = engine[method]({
    ...directive.params,
    existingParticipantId: first,
    newParticipantId: replacement,
    substitution: true,
  });
  expect(result.success).toBe(true);
  expect(template[team.participantId]).toContainEqual(expect.objectContaining({ participantId: replacement }));
  if (mode === 'legacy' && prior) expect(draw.lineUps).toBeUndefined();
  else expect(draw.lineUps).toBe(template);
  if (prior) expect(draw.extensions[0]).toBe(unrelated);
  if (mode === 'native') {
    expect(draw.extensions).toEqual([unrelated]);
  } else if (prior) {
    expect(draw.extensions[1]).toBe(existing);
    expect(existing.value).toBe(template);
  } else {
    expect(draw.extensions).toEqual([{ name: 'lineUps', value: template, createdAt: instant }]);
    expect(draw.extensions[0].value).toBe(template);
  }
});

function acceptedSubstitution() {
  const { initial, directive } = structuredClone(fixtures[1]);
  const old = initial.participants.find((p) => p.participantId === directive.params.existingParticipantId);
  const [first] = old.individualParticipantIds;
  const team = initial.participants.find(
    (p) => p.participantType === 'TEAM' && p.individualParticipantIds.includes(first),
  );
  Object.assign(directive.params, {
    existingParticipantId: first,
    newParticipantId: team.individualParticipantIds[2],
    substitution: true,
  });
  return { initial, directive, old };
}

it('commits the replacement to the selected side when storage reorders the sides', () => {
  const { initial, directive } = acceptedSubstitution();
  const dual = initial.events[0].drawDefinitions[0].structures[0].matchUps[0];
  let sides = dual.sides;
  const opponentLineUp = structuredClone(sides.find((s) => s.sideNumber === 2)?.lineUp);
  Object.defineProperty(dual, 'sides', {
    enumerable: true,
    get: () => sides,
    set: (value) => {
      sides = value.slice().sort((a, b) => b.sideNumber - a.sideNumber);
    },
  });
  engine.setState(initial, false);
  const result = engine[method](directive.params);
  expect(result.success).toBe(true);
  expect(sides.map((s) => s.sideNumber)).toEqual([2, 1]);
  expect(sides[0].lineUp).toEqual(opponentLineUp);
  expect(sides[1].lineUp).toEqual(result.modifiedLineUp);
});
