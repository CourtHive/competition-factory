// Run in a factory checkout with node scripts/ext/f018/borrowedStorage.mjs /path/to/dist/index.js
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const {
  tournamentEngine: engine,
  globalState,
  topicConstants,
  tools,
} = createRequire(import.meta.url)(resolve(process.argv[2]));
tools.setClock('2030-01-01T00:00:00.000Z');
const schema = new mongoose.Schema(
  {
    participantId: String,
    participantName: String,
    participantRole: String,
    participantType: String,
    person: mongoose.Schema.Types.Mixed,
  },
  { _id: false, strict: 'throw' },
);
const Tournament = mongoose.model(
  'F018DocumentArray',
  new mongoose.Schema({ tournamentId: String, participants: [schema] }, { _id: false }),
);
for (const queue of [false, true])
  for (const unknownField of [false, true]) {
    const record = Tournament.hydrate({
      tournamentId: 'T',
      participants: [
        { participantId: 'existing', person: { standardGivenName: ' Alice ', standardFamilyName: 'Li', sex: 'F' } },
      ],
    });
    const person = record.participants[0].person;
    const participant = { participantId: 'new', participantType: 'INDIVIDUAL', participantRole: 'COMPETITOR', person };
    if (unknownField) participant.customField = 1;
    const params = { participant, returnParticipant: true };
    engine.reset();
    engine.setState(record, false);
    const notices = [];
    globalState.setSubscriptions({
      subscriptions: Object.fromEntries(
        Object.values(topicConstants).map((topic) => [
          topic,
          (payloads) => notices.push(...payloads.map((payload) => ({ topic, payload }))),
        ]),
      ),
    });
    const before = JSON.stringify(record);
    const result = queue
      ? engine.executionQueue([{ method: 'addParticipant', params }], false)
      : engine.addParticipant(params);
    assert.equal(!!result.success, !unknownField);
    assert.equal(record.participants.length, unknownField ? 1 : 2);
    if (unknownField) assert.match(String(result.error?.message ?? result.error), /customField/);
    console.log(
      JSON.stringify({
        queue,
        unknownField,
        changed: before !== JSON.stringify(record),
        person,
        dirty: record.modifiedPaths(),
        updates: record.$getChanges(),
        material: result.success ? result : undefined,
        stored: record.toObject(),
        samePerson: person === record.participants[0].person,
        notices,
      }),
    );
  }
const Person = mongoose.model(
  'F018InputSetter',
  new mongoose.Schema(
    {
      participantId: String,
      participantRole: String,
      participantType: String,
      participantName: String,
      person: { standardGivenName: { type: String, set: (value) => value.toUpperCase() }, standardFamilyName: String },
    },
    { _id: false },
  ),
);
for (const copy of [true, false]) {
  const participant = Person.hydrate({
    participantId: 'P',
    participantType: 'INDIVIDUAL',
    participantRole: 'COMPETITOR',
    person: { standardGivenName: ' Alice ', standardFamilyName: 'Li' },
  });
  engine.reset();
  engine.setState({ tournamentId: 'T' }, copy);
  const result = engine.addParticipant({ participant, returnParticipant: true });
  assert(result.success);
  assert.equal(participant.participantName, 'ALICE Li');
  assert.equal(result.participant._doc.participantName, 'ALICE Li');
  console.log(
    JSON.stringify({
      copy,
      normalized: participant.person.standardGivenName,
      storedName: participant.participantName,
      returnedDocumentName: result.participant._doc?.participantName,
    }),
  );
}

// create() invokes setters on a subdocument linked to the live parent even before insertion.
const child = new mongoose.Schema(
  {
    name: {
      type: String,
      set(value) {
        this.ownerDocument().seen = value;
        return value.trim();
      },
    },
  },
  { _id: false, strict: 'throw' },
);
const Preparation = mongoose.model('F018Preparation', new mongoose.Schema({ participants: [child], seen: String }));
const parent = Preparation.hydrate({ participants: [], seen: 'original' });
assert.throws(() => parent.participants.create({ name: ' Alice ', customField: 1 }), /customField/);
console.log(
  JSON.stringify({
    preparation: 'array.create',
    seen: parent.seen,
    length: parent.participants.length,
    dirty: parent.modifiedPaths(),
  }),
);

// A factory eligibility decision can depend on user code in a name setter, even when storage never throws.
// Run this script against both builds. The fallback is external to the tournament and both hydrated inputs.
let fallback;
const personFields = {
  standardGivenName: { type: String, set: (value) => (fallback === null ? '' : value || fallback) },
  standardFamilyName: String,
};
const personSchema = new mongoose.Schema(personFields, { _id: false });
const playerFields = {
  participantId: String,
  participantType: String,
  participantName: String,
  participantRole: String,
};
const Player = mongoose.model(
  'F018EligibilityPlayer',
  new mongoose.Schema({ ...playerFields, person: personSchema }, { _id: false }),
);
const Roster = mongoose.model(
  'F018EligibilityRoster',
  new mongoose.Schema(
    {
      tournamentId: String,
      participants: [new mongoose.Schema({ ...playerFields, person: personSchema }, { _id: false })],
    },
    { _id: false },
  ),
);
for (fallback of ['Unknown', '', null]) {
  for (const shared of [false, true]) {
    for (const queue of [false, true]) {
      const fields = { standardGivenName: fallback === null ? ' Alice ' : '  ', standardFamilyName: 'Li' };
      const record = Roster.hydrate({
        tournamentId: 'T',
        participants: shared ? [{ participantId: 'old', person: fields }] : [],
      });
      const data = { participantId: 'new', participantType: 'INDIVIDUAL', participantRole: 'COMPETITOR' };
      const participant = shared
        ? { ...data, person: record.participants[0].person }
        : Player.hydrate({ ...data, person: fields });
      engine.reset();
      engine.setState(record, false);
      const params = { participant, returnParticipant: true };
      const before = JSON.stringify(record);
      const result = queue
        ? engine.executionQueue([{ method: 'addParticipant', params }], false)
        : engine.addParticipant(params);
      console.log(
        JSON.stringify({
          eligibility: true,
          queue,
          shared,
          fallback,
          success: result.success,
          code: result.error?.code,
          name: participant.participantName,
          length: record.participants.length,
          changed: before !== JSON.stringify(record),
          dirty: record.modifiedPaths(),
        }),
      );
    }
  }
}
