// Run against a built factory checkout, e.g. node scripts/ext/f017/penaltyCost.mjs "$PWD/dist/index.js"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { tournamentEngine: engine } = createRequire(import.meta.url)(resolve(process.argv[2]));
const participants = Array.from({ length: 128 }, (_, index) => ({ participantId: String(index) }));
participants.at(-1).penalties = [{ penaltyId: 'p', penaltyType: 'OTHER' }];
const record = { tournamentId: 'penalty-cost', participants };
const samples = { accepted: [], refused: [] };
for (let round = 0; round < 12; round++) {
  for (const arm of round % 2 ? ['accepted', 'refused'] : ['refused', 'accepted']) {
    let elapsed = 0;
    for (let call = 0; call < 250; call++) {
      engine.setState(record);
      const params = { penaltyId: arm === 'accepted' ? 'p' : 'absent', modifications: { penaltyType: 'Ball Abuse' } };
      const start = performance.now();
      const result = engine.modifyPenalty(params);
      elapsed += performance.now() - start;
      if (arm === 'accepted') assert.equal(result.penalty.penaltyType, 'BALL_ABUSE');
      else assert.equal(result.error?.code, 'ERR_NOT_FOUND_PENALTY');
    }
    if (round >= 4) samples[arm].push((elapsed * 1000) / 250);
  }
}
console.log(JSON.stringify(samples));
