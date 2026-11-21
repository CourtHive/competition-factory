import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import { applyPatch } from '@Tests/testHarness/corpus/applyPatch';
import { setOutcomePipeline, setSchemaWriteMode } from '@Global/state/globalState';
import { generatePatch } from '@Tools/jsonPatch';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { createReadStream, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { join } from 'node:path';

it('replays each flagged step independently from its recorded pre-call state', async () => {
  const root = process.env.HARVEST!;
  const ledger = readFileSync(process.env.LEDGER!, 'utf8')
    .trim()
    .split('\n')
    .map((row) => JSON.parse(row));
  const output = process.env.REPLAYS!;
  writeFileSync(output, '');
  const fixtures = process.env.FIXTURES!;
  mkdirSync(fixtures, { recursive: true });
  let cases = 0;
  for (const file of new Set<string>(ledger.map((row) => row.file))) {
    const lines = createInterface({ input: createReadStream(join(root, file)), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const s = JSON.parse(line);
      const rows = ledger.filter((row) => row.file === file && row.scenario === s.scenarioId);
      if (!rows.length) continue;
      let state = s.initial.record;
      for (const [index, step] of s.steps.entries()) {
        const row = rows.find((r) => r.index === index);
        if (row) {
          expect(canonicalHash(state)).toEqual(row.previous);
          const runs = [];
          for (const mode of ['v1', 'v2', 'differential'] as const) {
            for (const route of ['direct', 'queue']) {
              setOutcomePipeline(mode);
              setSchemaWriteMode(s.schemaWriteMode);
              setClock(step.clockAt ?? s.clock);
              setRandomSource(step.seed ?? s.seed);
              tournamentEngine.reset();
              expect(tournamentEngine.setState(structuredClone(state)).success).toBe(true);
              const read = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
              const before = read();
              const d = structuredClone(step.directive);
              let code, exception;
              try {
                const result =
                  route === 'queue'
                    ? tournamentEngine.executionQueue([d], false)
                    : tournamentEngine[d.method]({ ...d.params, rollbackOnError: false });
                code = result?.error?.code ?? result?.error;
              } catch (e) {
                exception = String(e);
              }
              const actual = generatePatch(before, read());
              runs.push({ mode, route, code, exception, paths: actual.map((p) => p.path) });
            }
          }
          appendFileSync(output, JSON.stringify({ ...row, source: s.source.ref, runs }) + '\n');
          if (runs.some((r) => r.code && r.paths.length))
            writeFileSync(
              join(fixtures, row.previous.slice(7) + '-' + index + '.json'),
              JSON.stringify({
                initial: state,
                directive: step.directive,
                clock: step.clockAt ?? s.clock,
                seed: step.seed ?? s.seed,
                writeMode: s.schemaWriteMode,
              }),
            );
          cases++;
        }
        state = applyPatch(state, step.patch);
      }
    }
  }
  expect(cases).toBe(ledger.length);
}, 600000);
