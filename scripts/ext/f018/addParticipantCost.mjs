// Run against a built factory checkout, e.g. node scripts/ext/f018/addParticipantCost.mjs "$PWD/dist/index.js"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { tournamentEngine: engine } = createRequire(import.meta.url)(resolve(process.argv[2]));
const participants = Array.from({ length: 128 }, (_, index) => ({
  participantId: String(index),
  participantType: 'INDIVIDUAL',
  participantRole: 'COMPETITOR',
}));
const record = { tournamentId: 'participant-cost', participants };
const samples = { accepted: [], refused: [] };
for (let round = 0; round < 12; round++) {
  for (const arm of round % 2 ? ['accepted', 'refused'] : ['refused', 'accepted']) {
    let elapsed = 0;
    for (let call = 0; call < 250; call++) {
      assert(engine.setState(record).success);
      const params = {
        returnParticipant: true,
        participant: {
          participantId: 'pair',
          participantRole: 'COMPETITOR',
          participantType: 'PAIR',
          individualParticipantIds: ['126', arm === 'accepted' ? '127' : 'missing'],
        },
      };
      const start = performance.now();
      const result = engine.addParticipant(params);
      elapsed += performance.now() - start;
      if (arm === 'accepted') assert.equal(result.participant.participantId, 'pair');
      else assert.equal(result.error?.code, 'ERR_INVALID_PARTICIPANT_IDS');
    }
    if (round >= 4) samples[arm].push((elapsed * 1000) / 250);
  }
}
console.log(JSON.stringify(samples));
