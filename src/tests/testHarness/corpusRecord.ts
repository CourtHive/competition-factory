import { currentTestSeed } from './seedMathRandom';
import { afterAll, afterEach, beforeEach } from 'vitest';
import { relative } from 'node:path';

/**
 * Opt-in: `CORPUS_RECORD=1 pnpm vitest run` (or `pnpm corpus:record`) harvests every test into
 * corpus scenarios under `CORPUS_OUT` (default `.corpus-out/`, ignored by git). Without the
 * variable this file does nothing, so the ordinary suite is unaffected. Listed AFTER
 * seedMathRandom in setupFiles so the test's seed exists when a test begins.
 */
const enabled = process.env.CORPUS_RECORD === '1';

if (enabled) {
  const { CorpusRecorder } = await import('./corpus/recorder');
  const recorder = new CorpusRecorder({ outDir: process.env.CORPUS_OUT ?? '.corpus-out' });

  beforeEach(() => {
    const current = currentTestSeed();
    if (!current) return;
    const [filePart, ...nameParts] = current.name.split('::');
    recorder.beginTest({
      file: relative(process.cwd(), filePart),
      name: nameParts.join('::'),
      seed: current.seed,
      ordinal: current.ordinal,
    });
  });

  afterEach(() => recorder.endTest());
  afterAll(() => {
    recorder.flushSummary();
  });
}
