// Compare complete accepted calls and time the public method at two built entry points.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import mongoose from 'mongoose';

const require = createRequire(import.meta.url);
const [base, candidate] = process.argv.slice(2).map((path) => require(resolve(path)));
const fixtures = JSON.parse(gunzipSync(readFileSync(new URL('./refusals.json.gz', import.meta.url))));
const fixedClock = '2030-01-01T00:00:00.000Z';
const method = 'replaceTieMatchUpParticipantId';

function setup(kind) {
  const fixture = structuredClone(
    fixtures[kind === 'values' ? 2 : ['shared', 'singles', 'warning', 'same'].includes(kind) ? 0 : 1],
  );
  const {
    initial: record,
    directive: { params },
  } = fixture;
  const find = (id) => record.participants.find((p) => p.participantId === id);
  const teamOf = (id) =>
    record.participants.find((p) => p.participantType === 'TEAM' && p.individualParticipantIds.includes(id));
  if (kind === 'singles') params.newParticipantId = teamOf(params.existingParticipantId).individualParticipantIds[1];
  if (kind === 'warning') {
    params.newParticipantId = 'free';
    record.participants.push({ ...find(params.existingParticipantId), participantId: 'free' });
  }
  if (kind === 'same') params.newParticipantId = params.existingParticipantId;
  if (['create', 'reuse', 'protected', 'entries'].includes(kind)) {
    const old = find(params.existingParticipantId);
    const [first, partner] = old.individualParticipantIds;
    const replacement = teamOf(first).individualParticipantIds[2];
    Object.assign(params, { existingParticipantId: first, newParticipantId: replacement, substitution: true });
    if (kind === 'reuse')
      record.participants.push({ ...old, participantId: 'reuse', individualParticipantIds: [partner, replacement] });
    if (kind === 'protected') {
      const alternate = structuredClone(record.events[0]);
      alternate.eventId = 'other-event';
      alternate.drawDefinitions[0].drawId = 'other-draw';
      record.events.push(alternate);
    }
    if (kind === 'entries') {
      const draw = record.events[0].drawDefinitions[0];
      const entries = [
        { participantId: old.participantId, entryPosition: 1 },
        { participantId: partner, entryPosition: 2 },
      ];
      record.events.push({
        eventId: 'doubles',
        eventType: 'DOUBLES',
        entries,
        flightProfile: { flights: [{ drawEntries: entries }] },
        drawDefinitions: [{ drawId: 'flight', entries }],
      });
      draw.entries ??= [];
      record.participants.push({
        participantType: 'GROUP',
        participantRole: 'OTHER',
        participantId: 'contacts',
        contactParticipantIds: [old.participantId],
      });
    }
  }
  return { record, params, code: fixture.code };
}

const { Mixed } = mongoose.Schema.Types;
const Tournament = mongoose.model(
  'F010Tournament',
  new mongoose.Schema(
    {
      tournamentId: String,
      events: Mixed,
      participants: [Mixed],
      factory: Mixed,
    },
    { strict: false, _id: false },
  ),
);
function call(factory, kind, storage, queue, mode) {
  const copy = storage === 'copied';
  const { tournamentEngine: e, tools, globalState: g, topicConstants } = factory;
  const { record: initial, params, code } = setup(kind);
  const record = storage === 'hydrated' ? Tournament.hydrate(initial) : initial;
  tools.setClock(fixedClock);
  tools.setRandomSource(tools.createSeededRandom(182));
  g.setSchemaWriteMode(mode);
  e.reset();
  assert(e.setState(record, copy).success);
  const notices = [];
  g.setSubscriptions({
    subscriptions: Object.fromEntries(
      Object.values(topicConstants).map((topic) => [
        topic,
        (payloads) => notices.push(...payloads.map((payload) => ({ topic, payload }))),
      ]),
    ),
  });
  const before = JSON.stringify(e.getTournament().tournamentRecord);
  const dirtyBefore = JSON.stringify(record.$getChanges?.());
  const oldDraw = record.events[0].drawDefinitions[0];
  const oldDual = oldDraw.structures[0].matchUps[0];
  const oldTemplate = oldDraw.lineUps;
  const oldParticipants = record.participants;
  const result = queue ? e.executionQueue([{ method, params }], false) : e[method](params);
  const stored = e.getTournament().tournamentRecord;
  const refused = ['shared', 'invalidPair', 'values'].includes(kind);
  if (refused) assert.equal(result.error?.code, code);
  else assert(result.success, JSON.stringify(result));
  const identity = [
    stored === record,
    oldDraw === record.events[0].drawDefinitions[0],
    oldDual === oldDraw.structures[0].matchUps[0],
    oldTemplate === oldDraw.lineUps,
    oldParticipants === record.participants,
  ];
  g.setSubscriptions({ subscriptions: {} });
  // Function-valued direct-method directives come from independent package instances.
  const data = JSON.parse(
    JSON.stringify(
      { result, stored, notices, identity, updates: record.$getChanges?.(), dirty: record.modifiedPaths?.() },
      (_k, v) => (typeof v === 'function' ? v.name : v === undefined ? { missingValue: true } : v),
    ),
  );
  return {
    data,
    unchanged: before === JSON.stringify(stored) && dirtyBefore === JSON.stringify(record.$getChanges?.()),
    refused,
  };
}

let accepted = 0,
  refused = 0;
for (const pipeline of ['v1', 'v2', 'differential']) {
  for (const f of [base, candidate]) f.globalState.setOutcomePipeline(pipeline);
  for (const kind of [
    'shared',
    'invalidPair',
    'values',
    'same',
    'singles',
    'warning',
    'create',
    'reuse',
    'protected',
    'entries',
  ]) {
    for (const storage of ['copied', 'borrowed', 'hydrated'])
      for (const queue of [false, true])
        for (const mode of ['native', 'bridge', 'legacy']) {
          const reference = call(base, kind, storage, queue, mode);
          const actual = call(candidate, kind, storage, queue, mode);
          if (actual.refused) {
            assert.equal(actual.data.result.error.code, reference.data.result.error.code);
            assert.deepEqual(actual.data.result, reference.data.result);
            assert(actual.unchanged, `${kind} changed the record`);
            assert.deepEqual(actual.data.notices, []);
            refused++;
          } else {
            assert.deepEqual(actual.data, reference.data, `${kind} storage=${storage} queue=${queue} mode=${mode}`);
            accepted++;
          }
        }
  }
}
console.log({ accepted, refused });
for (const f of [base, candidate]) f.globalState.setOutcomePipeline();

function measure(factory, kind) {
  const { tournamentEngine: e, globalState: g } = factory;
  const { record, params, code } = setup(kind);
  g.setSchemaWriteMode('native');
  let elapsed = 0;
  for (let i = 0; i < 100; i++) {
    assert(e.setState(record, true).success);
    const args = { ...params };
    const start = performance.now();
    const result = e[method](args);
    elapsed += performance.now() - start;
    if (kind === 'create') assert(result.success && result.participantAdded);
    else assert.equal(result.error.code, code);
  }
  return elapsed * 10;
}
if (process.env.F010_COST) {
  const samples = {};
  for (let round = 0; round < 12; round++)
    for (const index of round % 2 ? [1, 0] : [0, 1])
      for (const kind of ['create', 'invalidPair']) {
        const time = measure([base, candidate][index], kind);
        if (round >= 4) (samples[[index, kind]] ??= []).push(time);
      }
  console.log(JSON.stringify(samples));
}
