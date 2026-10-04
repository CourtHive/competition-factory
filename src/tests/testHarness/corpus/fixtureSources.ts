import { clearOutcome, getDrawDefinition, projectDraw, stableHash } from '../exitPropagation/transitions';
import { CorpusWriteError, writeScenario, type Directive } from './writeScenario';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import path from 'path';
import fs from 'fs';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * Golden corpus C2c: the real records under `src/tests/testHarness/*.codes.json` as corpus
 * sources. Two things make them worth having beside the generated scenarios: they are records
 * that real tournaments produced, with the fields and shapes mocks never emit, and they are what
 * the schema's open definitions were left open FOR. A reader that parses all sixteen has parsed
 * the wild.
 *
 * Each fixture becomes one scenario whose initial state is the record itself. The authored steps
 * are the same probe on every fixture, because the probe is what the corpus is for: score the
 * first playable matchUp, then clear it. When the clear restores the initial hash, the scenario
 * records DO_UNDO_IDENTITY as a property it was checked against. A fixture with nothing playable
 * yields a zero-step scenario, which still pins its parse.
 *
 * The harness tests that already drive these fixtures (lineUps, voluntary consolation, avoidance,
 * polar, …) are harvested by the recorder; this module does not repeat them.
 */
export const FIXTURE_DIR = 'src/tests/testHarness';

export function listFixtures(): string[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.codes.json'))
    .sort((a, b) => a.localeCompare(b));
}

/** Score the first playable matchUp with a standard result, then clear it. Nothing playable: no steps. */
export function probeDirectives(record: any): Directive[] {
  tournamentEngine.reset();
  tournamentEngine.setState(record);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const target = (matchUps ?? []).find(
    (m: any) =>
      !m.winningSide &&
      (!m.matchUpStatus || m.matchUpStatus === TO_BE_PLAYED) &&
      (m.sides ?? []).filter((s: any) => s?.participantId).length === 2 &&
      !m.tieMatchUps?.length,
  );
  if (!target) return [];
  // the matchUp's own format decides what a complete result looks like: a timed or tiebreak-only
  // format refuses a 6-1 6-1 (measured: three fixtures refused it as ERR_INVALID_SCORE)
  const generated = target.matchUpFormat
    ? mocksEngine.generateOutcome({ matchUpFormat: target.matchUpFormat, winningSide: 1, matchUpStatusProfile: {} })
    : undefined;
  const outcome =
    generated?.outcome ??
    mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
  const params = { drawId: target.drawId, matchUpId: target.matchUpId };
  return [
    { method: 'setMatchUpStatus', params: { ...params, outcome } },
    { method: 'setMatchUpStatus', params: { ...params, outcome: clearOutcome } },
  ];
}

export type FixtureWrite = {
  written: any[];
  failed: { file: string; reason: string }[];
};

export function recordFixtures({
  outDir,
  clock = '2026-10-01T12:00:00.000Z',
  seed = 16,
  files = listFixtures(),
}: {
  outDir: string;
  clock?: string;
  seed?: number;
  files?: string[];
}): FixtureWrite {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'fixtures.jsonl');
  fs.writeFileSync(outPath, '');
  const written: any[] = [];
  const failed: { file: string; reason: string }[] = [];
  for (const file of files) {
    const record = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
    const name = file.replace(/\.codes\.json$/, '');
    try {
      const scenario: any = writeScenario({
        scenarioId: `fixture/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        source: { kind: 'fixture', ref: `${FIXTURE_DIR}/${file}` },
        tags: ['fixture', 'real-record'],
        initialRecord: record,
        directives: probeDirectives(record),
        seed,
        clock,
      });
      // DO_UNDO_IDENTITY as the harness defines it (INVARIANTS.md): the DRAW's projection with the
      // volatile keys stripped, not the whole record's hash, which the clock stamps move anyway.
      // The writer leaves the engine at the final state; the initial state is reloaded to compare.
      if (scenario.steps.length === 2 && scenario.steps.every((step: any) => step.result.success)) {
        const drawId = scenario.steps[0].directive.params.drawId;
        const after = stableHash(projectDraw(getDrawDefinition(drawId)));
        tournamentEngine.reset();
        tournamentEngine.setState(scenario.initial.record);
        const before = stableHash(projectDraw(getDrawDefinition(drawId)));
        if (after === before) scenario.properties = ['DO_UNDO_IDENTITY'];
      }
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push(scenario);
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ file, reason: err.message.slice(0, 300) });
    }
  }
  return { written, failed };
}
