// Run against a built factory checkout, e.g. node scripts/ext/f015/scaleItemCost.mjs "$PWD/dist/index.js"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { tournamentEngine: engine } = createRequire(import.meta.url)(resolve(process.argv[2]));
const participants = Array.from({ length: 128 }, (_, index) => ({ participantId: String(index) }));
const record = { tournamentId: 'scale-cost', participants };
const participantId = '127';
const scale = { scaleType: 'RANKING', scaleName: 'U18', eventType: 'SINGLES', createdAt: '2026-10-01T00:00:00.000Z' };
const samples = { accepted: [], refused: [] };
for (let round = 0; round < 12; round++) {
  for (const arm of round % 2 ? ['accepted', 'refused'] : ['refused', 'accepted']) {
    let elapsed = 0;
    for (let call = 0; call < 250; call++) {
      // A refusal always starts with the timeItems field absent, including on the defective base.
      assert(engine.setState(record).success);
      const scaleItem =
        arm === 'accepted' ? { ...scale, scaleValue: 1 } : { ...scale, scaleValue: 1, scaleDate: 'invalid' };
      const params = { participantId, scaleItem };
      const start = performance.now();
      const result = engine.setParticipantScaleItem(params);
      elapsed += performance.now() - start;
      if (arm === 'accepted') assert.equal(result.newValue, 1);
      else assert.equal(result.error?.code, 'ERR_INVALID_DATE');
    }
    if (round >= 4) samples[arm].push((elapsed * 1000) / 250);
  }
}
console.log(JSON.stringify(samples));
