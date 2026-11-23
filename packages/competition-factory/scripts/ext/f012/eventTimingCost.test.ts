import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('measures a public event timing edit and refusal', () => {
  const eventId = 'timed';
  const fixture = process.env.F012_FIXTURE;
  if (!fixture) throw new Error('Set F012_FIXTURE to the same fixture file for the base and candidate.');
  if (!existsSync(fixture)) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'timed-draw', drawSize: 128, eventId, matchUpFormat: FORMAT_STANDARD }],
    });
    writeFileSync(fixture, JSON.stringify(tournamentRecord));
  }
  const tournamentRecord = JSON.parse(readFileSync(fixture, 'utf8'));
  const samples: Record<string, number[]> = { accepted: [], refused: [] };
  for (let round = 0; round < 9; round++) {
    const arms = round % 2 ? ['accepted', 'refused'] : ['refused', 'accepted'];
    for (const arm of arms) {
      tournamentEngine.setState(tournamentRecord);
      const base = { eventId, matchUpFormat: FORMAT_STANDARD };
      expect(tournamentEngine.modifyEventMatchUpFormatTiming({ ...base, averageMinutes: 90 }).success).toBe(true);
      const prepared = tournamentEngine.getTournament().tournamentRecord;
      let count = 0;
      let elapsed = 0;
      for (let i = 0; i < 100; i++) {
        const params = arm === 'accepted' ? { ...base, averageMinutes: i % 2 ? 90 : 75 } : base;
        // Each refused call starts from the populated category, even on the defective baseline.
        if (arm === 'refused') tournamentEngine.setState(prepared);
        const start = performance.now();
        const result = tournamentEngine.modifyEventMatchUpFormatTiming(params);
        elapsed += performance.now() - start;
        if (arm === 'accepted' ? result.success : result.error?.code === INVALID_VALUES.code) count++;
      }
      expect(count).toBe(100);
      if (round) samples[arm].push(elapsed * 10);
    }
  }
  console.info('F012 mean microseconds per public call in each 100-call block', samples);
});
