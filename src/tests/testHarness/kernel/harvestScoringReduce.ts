import { normativeReduction } from './normativeReduction';
import { overTheWire } from './kernel';
import fs from 'node:fs';

// types
import type { ScoringConfiguration, TimelineEntry } from '@Assemblies/engines/scoring/v2/types';

/**
 * `pnpm kernel:harvest-scoring` sets `SCORING_REDUCE_CASES=<file>` and records the scoring corpus: each scenario's
 * configuration and the timeline it left become one `kernel.scoring.reduce@1` case, its expected value this
 * implementation's reduction. Generated, never committed (`.kernel-cases/`); `KERNEL_CASES=<file>` grades them.
 * A no-op without the variable.
 */
export function harvestScoringReduce(scenarioId: string, configuration: ScoringConfiguration, timeline?: unknown[]) {
  const file = process.env.SCORING_REDUCE_CASES;
  if (!file || !Array.isArray(timeline)) return;
  const input = overTheWire({ configuration, timeline });
  const value = overTheWire(normativeReduction(input.configuration, input.timeline as TimelineEntry[]));
  const caseId = `scoring.reduce.corpus.${scenarioId
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')}.v1`;
  const kernelCase = { caseId, operation: 'kernel.scoring.reduce@1', input, expected: { kind: 'value', value } };
  fs.appendFileSync(file, JSON.stringify(kernelCase) + '\n');
}
