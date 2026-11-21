import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('./one-call.json', import.meta.url), 'utf8'));
const record = () => tournamentEngine.getTournament().tournamentRecord;

afterEach(() => {
  setClock();
  setOutcomePipeline();
});

for (const mode of ['v1', 'v2', 'differential'] as const) {
  it.each([false, true])(
    `${mode} preserves the record after a refused line correction with rollback=%s`,
    (rollback) => {
      setOutcomePipeline(mode);
      setClock('2026-10-25T00:01:00.000Z');
      tournamentEngine.reset();
      expect(tournamentEngine.setState(structuredClone(fixture.initial)).success).toBe(true);
      const before = canonicalHash(record());
      const result = tournamentEngine.executionQueue([structuredClone(fixture.directive)], rollback);
      expect(result.error?.code).toBe('ERR_MISSING_ASSIGNMENTS');
      expect(canonicalHash(record())).toBe(before);
    },
  );
}
