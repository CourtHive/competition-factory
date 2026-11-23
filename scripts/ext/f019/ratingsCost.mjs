// node scripts/ext/f019/ratingsCost.mjs /path/to/dist/index.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { scaleEngine } = createRequire(import.meta.url)(resolve(process.argv[2]));
const participants = Array.from({ length: 16 }, (_, i) => ({
  participantId: String(i),
  participantType: 'INDIVIDUAL',
}));
const matchUps = Array.from({ length: 8 }, (_, i) => ({
  matchUpId: String(i),
  roundPosition: i + 1,
  roundNumber: 1,
  matchUpType: 'SINGLES',
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  sides: participants.slice(2 * i, 2 * i + 2).map((participant, j) => ({ sideNumber: j + 1, participant })),
  score: { sets: [{ side1Score: 6, side2Score: 1 }] },
}));
const params = { matchUps, matchUpIds: matchUps.map((m) => m.matchUpId), updateParticipantRatings: true };
const accepted = { tournamentId: 'ratings-cost', participants };
const refused = structuredClone(accepted);
refused.participants.at(-1).participantType = 'TEAM';
const samples = { accepted: [], refused: [] };
scaleEngine.setClock(1700000000000);
for (let round = 0; round < 12; round++) {
  for (const arm of round % 2 ? ['accepted', 'refused'] : ['refused', 'accepted']) {
    let elapsed = 0;
    for (let call = 0; call < 100; call++) {
      scaleEngine.setState(arm === 'accepted' ? accepted : refused);
      const start = performance.now();
      const result = scaleEngine.generateDynamicRatings(params);
      elapsed += performance.now() - start;
      if (arm === 'accepted') assert.equal(Object.keys(result.modifiedScaleValues).length, 16);
      else assert.equal(result.error?.code, 'ERR_INVALID_SCALE_ITEM');
    }
    if (round >= 4) samples[arm].push((elapsed * 1000) / 100);
  }
}
console.log(JSON.stringify(samples));
