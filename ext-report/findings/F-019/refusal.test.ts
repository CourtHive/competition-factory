import { setOutcomePipeline, setSchemaWriteMode } from '@Global/state/globalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setClock } from '@Tools/clock';

useEngineCatch();
const fixtures = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures.json.gz', import.meta.url))).toString());
afterEach(() => {
  setClock();
  setOutcomePipeline();
});

for (const fixture of fixtures) {
  for (const mode of ['v1', 'v2', 'differential'] as const) {
    it.each([false, true])(`${fixture.code} under ${mode} preserves the record, rollback=%s`, (rollback) => {
      setSchemaWriteMode(fixture.writeMode);
      setOutcomePipeline(mode);
      setClock(fixture.clock);
      tournamentEngine.reset();
      expect(tournamentEngine.setState(structuredClone(fixture.initial)).success).toBe(true);
      const record = () => canonicalJson(tournamentEngine.getTournament().tournamentRecord);
      const before = record();
      const result = scaleEngine.executionQueue([structuredClone(fixture.directive)], rollback);
      expect(result.error?.code ?? result.error).toEqual(fixture.code);
      expect(record() === before).toBe(true);
    });
  }
}
