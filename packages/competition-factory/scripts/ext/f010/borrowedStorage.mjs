// Run against either built package: node scripts/ext/f010/borrowedStorage.mjs /path/to/dist/index.js
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const {
  tournamentEngine: engine,
  globalState,
  tools,
  topicConstants,
} = createRequire(import.meta.url)(resolve(process.argv[2]));
const seed = JSON.parse(gunzipSync(readFileSync(new URL('./refusals.json.gz', import.meta.url))))[1];
tools.setClock('2030-01-01T00:00:00.000Z');
for (const acceptsStamp of [true, false]) {
  const schema = new mongoose.Schema(
    {
      name: String,
      value: mongoose.Schema.Types.Mixed,
      ...(acceptsStamp ? { createdAt: String } : {}),
    },
    { strict: 'throw', _id: false },
  );
  const Model = mongoose.model('F010Extensions' + acceptsStamp, new mongoose.Schema({ extensions: [schema] }));
  for (const queue of [false, true]) {
    const { initial: record, directive } = structuredClone(seed);
    const draw = record.events[0].drawDefinitions[0];
    const dual = draw.structures[0].matchUps[0];
    const sides = dual.sides;
    const doc = Model.hydrate({ extensions: [] });
    draw.extensions = doc.extensions;
    const old = record.participants.find((p) => p.participantId === directive.params.existingParticipantId);
    const [first] = old.individualParticipantIds;
    const team = record.participants.find(
      (p) => p.participantType === 'TEAM' && p.individualParticipantIds.includes(first),
    );
    Object.assign(directive.params, {
      existingParticipantId: first,
      newParticipantId: team.individualParticipantIds[2],
      substitution: true,
    });
    engine.reset();
    engine.setState(record, false);
    globalState.setSchemaWriteMode('bridge');
    const notices = [];
    globalState.setSubscriptions({
      subscriptions: Object.fromEntries(
        Object.values(topicConstants).map((topic) => [topic, () => notices.push(topic)]),
      ),
    });
    const before = JSON.stringify(record);
    const stamp = dual.updatedAt;
    const result = queue
      ? engine.executionQueue([directive], false)
      : engine.replaceTieMatchUpParticipantId(directive.params);
    assert.equal(!!result.success, acceptsStamp);
    if (!acceptsStamp) assert.match(String(result.error?.message ?? result.error), /createdAt/);
    console.log(
      JSON.stringify({
        queue,
        acceptsStamp,
        changed: before !== JSON.stringify(record),
        sidesReplaced: sides !== dual.sides,
        stampChanged: stamp !== dual.updatedAt,
        extensions: doc.extensions.length,
        dirty: doc.modifiedPaths(),
        notices,
      }),
    );
  }
}
