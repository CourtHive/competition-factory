import { createTournamentRecord } from '@Generators/tournamentRecords/createTournamentRecord';
import { CorpusWriteError, writeScenario } from './writeScenario';
import mocksEngine from '@Assemblies/engines/mock';
import { MOCKS_SCENARIOS } from './mocksScenarios';
import { setClock } from '@Tools/clock';
import path from 'path';
import fs from 'fs';

const CLOCK = '2026-10-01T12:00:00.000Z';
const SEED = 5000;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');

/**
 * The `mocks` corpus source: each scenario shape's method list (`generateTournamentRecord` with `recordMethods`)
 * written as a scenario. The initial record is the tournament its `newTournamentRecord` makes; the directives are the
 * rest of the list, the engine calls a client makes to build that tournament: participants, events, entries, draws,
 * results, venues and schedules. A consumer graded on this source is graded on building tournaments.
 */
export function recordMocks({ outDir }: { outDir: string }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'mocks.jsonl');
  fs.writeFileSync(outPath, '');

  const written: any[] = [];
  const failed: { scenarioId: string; reason: string }[] = [];
  for (const [name, profile] of MOCKS_SCENARIOS) {
    const scenarioId = `mocks/${slug(name)}`;
    try {
      // generated under the source's clock too: a time stamped into a call's params (a participant's timeItems,
      // say) would otherwise make each run's directives, and so its hashes, different
      const { initialRecord, directives } = generateUnderClock(profile);
      const scenario = writeScenario({
        source: { kind: 'authored', ref: `mocks: ${name}` },
        initialRecord,
        tags: ['mocks', 'method-list'],
        directives,
        clock: CLOCK,
        seed: SEED,
        scenarioId,
      });
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push(scenario);
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId, reason: err.message.slice(0, 300) });
    }
  }
  return { written, failed };
}

// a profile's method list and the tournament its first call makes, both under the source's fixed clock
function generateUnderClock(profile: Record<string, unknown>) {
  setClock(CLOCK);
  try {
    const generated: any = mocksEngine.generateTournamentRecord({ ...profile, nonRandom: 1, recordMethods: true });
    if (generated.error) throw new CorpusWriteError(`generation refused: ${JSON.stringify(generated.error)}`);
    const [header, ...directives] = generated.methods;
    return { initialRecord: createTournamentRecord(header.params), directives };
  } finally {
    setClock();
  }
}
